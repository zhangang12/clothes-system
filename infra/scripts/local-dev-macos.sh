#!/usr/bin/env bash
# =============================================================================
# 本地免 Docker 全栈(macOS / Apple Silicon)—— 供本地端到端 & 浏览器自动化测试
#
#   原生 MySQL 8 + 原生 Redis + API + web + portal,全部装进 ~/.i9-localdev,
#   不需要 Docker、不需要 Homebrew、不需要 sudo(依赖 Xcode 命令行工具编译 Redis)。
#
# 用法:
#   bash infra/scripts/local-dev-macos.sh setup    # 一次性:下载 MySQL 8 + 编译 Redis + 装 Playwright 浏览器
#   bash infra/scripts/local-dev-macos.sh up       # 起 MySQL/Redis/API(3001)/web(5173)/portal(5174)
#   bash infra/scripts/local-dev-macos.sh smoke     # 跑浏览器冒烟(登录→各列表页)
#   bash infra/scripts/local-dev-macos.sh status    # 看各服务状态
#   bash infra/scripts/local-dev-macos.sh down      # 停全部
#   bash infra/scripts/local-dev-macos.sh reload-db # 重建库(丢数据)+ 重载 init.sql
#
# 端口:MySQL 3306 / Redis 6379 / API 3001(避开被占用的 3000）/ web 5173 / portal 5174
# 账号:admin / Admin@123(及 business_user、finance_user、pm_user…同密码);门户 supplier1 / Admin@123
# =============================================================================
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEV="$HOME/.i9-localdev"
MYSQL_VER="8.0.40"
MYSQL_TARBALL="mysql-${MYSQL_VER}-macos14-arm64"
API_PORT=3001
DB_PORT=3306
REDIS_PORT=6379
SOCK="$DEV/mysql.sock"
MYSQLD="$DEV/mysql/bin/mysqld"
MYSQL="$DEV/mysql/bin/mysql"
MYSQLADMIN="$DEV/mysql/bin/mysqladmin"
REDIS="$DEV/redis-src/src/redis-server"
REDISCLI="$DEV/redis-src/src/redis-cli"
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
log(){ echo -e "${G}[local-dev]${N} $*"; }
warn(){ echo -e "${Y}[local-dev]${N} $*"; }
err(){ echo -e "${R}[local-dev]${N} $*" >&2; }

mysql_up(){ "$MYSQLADMIN" --no-defaults -uroot --socket="$SOCK" ping >/dev/null 2>&1; }
redis_up(){ "$REDISCLI" -p "$REDIS_PORT" ping >/dev/null 2>&1; }
m(){ "$MYSQL" --no-defaults -uroot --socket="$SOCK" "$@"; }

setup(){
  mkdir -p "$DEV/dl" "$DEV/logs" "$DEV/uploads" "$DEV/shots"
  # --- MySQL 8 官方免安装 tar 包(Apple Silicon）---
  if [ ! -x "$MYSQLD" ]; then
    if [ ! -f "$DEV/dl/mysql.tar.gz" ]; then
      log "下载 MySQL ${MYSQL_VER} (arm64,约 160MB)…"
      curl -L --fail --retry 3 -o "$DEV/dl/mysql.tar.gz" \
        "https://dev.mysql.com/get/Downloads/MySQL-8.0/${MYSQL_TARBALL}.tar.gz"
    fi
    log "解压 MySQL…"; mkdir -p "$DEV/mysql"
    tar xzf "$DEV/dl/mysql.tar.gz" -C "$DEV/mysql" --strip-components 1
  fi
  if [ ! -d "$DEV/mysql-data/mysql" ]; then
    log "初始化 MySQL 数据目录(空 root 密码)…"
    "$MYSQLD" --no-defaults --initialize-insecure \
      --basedir="$DEV/mysql" --datadir="$DEV/mysql-data" --log-error="$DEV/logs/mysql-init.err"
  fi
  # --- Redis 源码编译(用 Xcode CLT）---
  if [ ! -x "$REDIS" ]; then
    log "下载并编译 Redis…"
    curl -L --fail --retry 3 -o "$DEV/dl/redis.tar.gz" "https://download.redis.io/redis-stable.tar.gz"
    mkdir -p "$DEV/redis-src"; tar xzf "$DEV/dl/redis.tar.gz" -C "$DEV/redis-src" --strip-components 1
    ( cd "$DEV/redis-src" && make -j4 BUILD_TLS=no >"$DEV/logs/redis-build.log" 2>&1 )
  fi
  # --- Playwright 浏览器 ---
  log "安装 Playwright 浏览器(chromium + headless shell)…"
  ( cd "$REPO" && node_modules/.bin/playwright install chromium chromium-headless-shell )
  # --- API .env.local ---
  if [ ! -f "$REPO/packages/api/.env.local" ]; then
    log "写 packages/api/.env.local…"
    cat > "$REPO/packages/api/.env.local" <<ENV
DB_HOST=127.0.0.1
DB_PORT=${DB_PORT}
DB_NAME=i9_clothes
DB_USER=i9user
DB_PASS=i9pass123
REDIS_HOST=127.0.0.1
REDIS_PORT=${REDIS_PORT}
REDIS_PASSWORD=
JWT_SECRET=local-e2e-dev-secret-32chars-minimum-abc
JWT_EXPIRES=8h
UPLOAD_ROOT=${DEV}/uploads
PORT=${API_PORT}
NODE_ENV=production
WEB_ORIGIN=http://localhost:5173
PORTAL_ORIGIN=http://localhost:5174
ENV
  fi
  log "setup 完成。下一步:bash $0 up"
}

start_mysql(){
  if mysql_up; then log "MySQL 已在运行"; return; fi
  log "启动 mysqld…"
  "$MYSQLD" --no-defaults --basedir="$DEV/mysql" --datadir="$DEV/mysql-data" \
    --socket="$SOCK" --port="$DB_PORT" --bind-address=127.0.0.1 \
    --pid-file="$DEV/mysql.pid" --log-error="$DEV/logs/mysql.err" &
  for i in $(seq 1 20); do mysql_up && break; sleep 1; done
  mysql_up || { err "mysqld 启动失败,见 $DEV/logs/mysql.err"; exit 1; }
}

ensure_schema(){
  m -e "CREATE DATABASE IF NOT EXISTS i9_clothes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        CREATE USER IF NOT EXISTS 'i9user'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY 'i9pass123';
        CREATE USER IF NOT EXISTS 'i9user'@'localhost'  IDENTIFIED WITH mysql_native_password BY 'i9pass123';
        GRANT ALL PRIVILEGES ON i9_clothes.* TO 'i9user'@'127.0.0.1';
        GRANT ALL PRIVILEGES ON i9_clothes.* TO 'i9user'@'localhost'; FLUSH PRIVILEGES;"
  local n; n=$(m -N i9_clothes -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='i9_clothes';" 2>/dev/null || echo 0)
  if [ "${n:-0}" -lt 5 ]; then
    log "载入 init.sql(全新装机 schema + 种子)…"
    m i9_clothes < "$REPO/infra/mysql/init.sql"
  else
    log "库已有 ${n} 张表,跳过 init.sql"
  fi
}

start_redis(){
  if redis_up; then log "Redis 已在运行"; return; fi
  log "启动 redis-server…"
  "$REDIS" --port "$REDIS_PORT" --bind 127.0.0.1 --dir "$DEV" --logfile "$DEV/logs/redis.log" --daemonize yes
  for i in $(seq 1 10); do redis_up && break; sleep 1; done
  redis_up || { err "redis 启动失败"; exit 1; }
}

start_api(){
  if curl -s -o /dev/null "http://127.0.0.1:${API_PORT}/api/v1"; then log "API 已在运行(:${API_PORT})"; return; fi
  [ -f "$REPO/packages/api/dist/main.js" ] || { log "构建 types + api…"; ( cd "$REPO" && pnpm --filter @i9/types build && pnpm --filter @i9/api build ); }
  log "启动 API(:${API_PORT},生产模式 synchronize:false)…"
  ( cd "$REPO/packages/api" && NODE_ENV=production PORT=$API_PORT nohup node dist/main.js >"$DEV/logs/api.log" 2>&1 & echo $! > "$DEV/api.pid" )
  for i in $(seq 1 25); do curl -s -o /dev/null "http://127.0.0.1:${API_PORT}/api/v1" && break; sleep 1; done
}

start_front(){
  local name=$1 filter=$2 port=$3
  # vite 默认只绑 IPv6 localhost([::1]),用 localhost 而非 127.0.0.1 探测
  if curl -s -o /dev/null "http://localhost:${port}/"; then log "$name 已在运行(:${port})"; return; fi
  log "启动 $name(:${port})…"
  ( cd "$REPO" && VITE_API_TARGET="http://localhost:${API_PORT}" nohup pnpm --filter "$filter" dev >"$DEV/logs/${name}.log" 2>&1 & echo $! > "$DEV/${name}.pid" )
  for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:${port}/" && break; sleep 1; done
}

up(){
  [ -x "$MYSQLD" ] || { err "未 setup。先跑:bash $0 setup"; exit 1; }
  start_mysql; ensure_schema; start_redis; start_api
  start_front web @i9/web 5173
  start_front portal @i9/portal 5174
  echo
  log "全栈就绪:"
  echo "   管理端  http://localhost:5173   (admin / Admin@123)"
  echo "   门户H5  http://localhost:5174   (supplier1 / Admin@123)"
  echo "   API     http://localhost:${API_PORT}/api/v1"
  echo "   停止:bash $0 down"
}

down(){
  for s in web portal api; do
    [ -f "$DEV/$s.pid" ] && kill "$(cat "$DEV/$s.pid")" 2>/dev/null && rm -f "$DEV/$s.pid" && log "停 $s"
  done
  pkill -f "vite" 2>/dev/null
  pkill -f "dist/main.js" 2>/dev/null
  redis_up && "$REDISCLI" -p "$REDIS_PORT" shutdown nosave 2>/dev/null && log "停 redis"
  mysql_up && "$MYSQLADMIN" --no-defaults -uroot --socket="$SOCK" shutdown 2>/dev/null && log "停 mysql"
  log "已停全部"
}

status(){
  local c
  printf "MySQL   : %s\n" "$(mysql_up && echo '✓ 3306' || echo '✗ 未运行')"
  printf "Redis   : %s\n" "$(redis_up && echo '✓ 6379' || echo '✗ 未运行')"
  c=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$API_PORT/api/v1" 2>/dev/null)
  printf "API     : %s\n" "$([ "${c:-000}" != 000 ] && echo "✓ $API_PORT (HTTP $c)" || echo '✗ 未运行')"
  c=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:5173/" 2>/dev/null)
  printf "web     : %s\n" "$([ "${c:-000}" != 000 ] && echo "✓ 5173 (HTTP $c)" || echo '✗ 未运行')"
  c=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:5174/" 2>/dev/null)
  printf "portal  : %s\n" "$([ "${c:-000}" != 000 ] && echo "✓ 5174 (HTTP $c)" || echo '✗ 未运行')"
}

reload_db(){
  start_mysql
  log "DROP + 重建 i9_clothes…"
  m -e "DROP DATABASE IF EXISTS i9_clothes;"
  ensure_schema
  log "已重载 init.sql"
}

case "${1:-}" in
  setup) setup ;;
  up) up ;;
  down) down ;;
  status) status ;;
  smoke) ( cd "$REPO" && NODE_PATH="$REPO/node_modules" node "$REPO/infra/scripts/local-smoke.cjs" ) ;;
  reload-db) reload_db ;;
  *) echo "用法: bash $0 {setup|up|down|status|smoke|reload-db}"; exit 2 ;;
esac

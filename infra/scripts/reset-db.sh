#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — MySQL 数据库重置脚本
# 用途：修复因早期多次运行 setup 导致的「root 密码不匹配 / init.sql 未加载」
#       会删除现有 MySQL 容器及其数据卷（当前为空/损坏，无有用数据），重新初始化。
# 用法：bash infra/scripts/reset-db.sh
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
ENV_FILE="$APP_DIR/.env.production"
COMPOSE_FILE="$APP_DIR/infra/docker-compose.yml"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[RESET-DB]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ -f "$ENV_FILE" ]]     || die "环境变量文件不存在：$ENV_FILE"
[[ -f "$COMPOSE_FILE" ]] || die "compose 文件不存在：$COMPOSE_FILE（请先 git pull）"

# 读取密码与库名（cut -f2- 兼容值中含 = 的情况）
ROOT_PW=$(grep '^MYSQL_ROOT_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)
DB_NAME=$(grep '^DB_NAME=' "$ENV_FILE" | head -1 | cut -d= -f2-)
DB_NAME=${DB_NAME:-i9_clothes}
[[ -n "$ROOT_PW" ]] || die "未在 $ENV_FILE 中找到 MYSQL_ROOT_PASSWORD"

# ── 1. 停止并删除旧容器（分开写标志，兼容旧版 docker）──────────
log "停止并删除旧 MySQL 容器..."
docker stop i9_mysql 2>/dev/null || true
docker rm -f i9_mysql 2>/dev/null || true

# ── 2. 删除数据卷（自动匹配 *mysql_data 卷名）─────────────────
log "删除旧 MySQL 数据卷..."
mapfile -t VOLS < <(docker volume ls -q 2>/dev/null | grep -E 'mysql_data$' || true)
if [[ ${#VOLS[@]} -eq 0 ]]; then
  warn "未找到 *mysql_data 数据卷（可能已删除）"
else
  for vol in "${VOLS[@]}"; do
    warn "删除数据卷：$vol"
    docker volume rm "$vol" 2>/dev/null || warn "删除 $vol 失败（可能仍被占用）"
  done
fi

# ── 3. 从仓库目录重建 MySQL（init.sql 相对挂载可解析）─────────
# 只启动 mysql，不触发 redis（本机 Redis 装在宿主机上）
log "重建 MySQL 容器（加载 init.sql）..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d mysql

# ── 4. 等待 MySQL 就绪 ────────────────────────────────────────
log "等待 MySQL 就绪（最长 90s）..."
for i in $(seq 1 18); do
  if docker exec i9_mysql mysqladmin ping -h localhost --silent 2>/dev/null; then
    log "MySQL 端口已响应 ✓"
    break
  fi
  [[ $i -eq 18 ]] && die "MySQL 启动超时，请查看：docker logs i9_mysql"
  sleep 5
done

# ── 5. 验证 schema（init.sql 在 ping 通后可能还在执行，重试）──
log "验证 schema 是否加载..."
TABLES=""
for _ in $(seq 1 15); do
  TABLES=$(docker exec i9_mysql mysql -uroot -p"$ROOT_PW" -N -e \
    "USE \`$DB_NAME\`; SHOW TABLES;" 2>/dev/null || true)
  [[ -n "$TABLES" ]] && break
  sleep 3
done

if [[ -z "$TABLES" ]]; then
  warn "未检测到任何表。初始化日志（最后 30 行）："
  docker logs i9_mysql 2>&1 | tail -30
  die "schema 加载失败，请把上面日志发给我排查"
fi

COUNT=$(echo "$TABLES" | grep -c . || true)
log "schema 加载成功，共 ${COUNT} 张表："
echo "$TABLES" | sed 's/^/    /'

# ── 6. 验证默认管理员账号 ─────────────────────────────────────
ADMIN=$(docker exec i9_mysql mysql -uroot -p"$ROOT_PW" -N -e \
  "SELECT COUNT(*) FROM \`$DB_NAME\`.sys_user WHERE username='admin';" 2>/dev/null || echo 0)
if [[ "$ADMIN" == "1" ]]; then
  log "默认管理员 admin 已就绪（密码：Admin@123）✓"
else
  warn "未找到 admin 账号（sys_user 表可能未 seed），请检查 init.sql"
fi

log "================================================"
log "  数据库重置完成 ✓"
log "  下一步执行部署：bash $APP_DIR/infra/scripts/deploy.sh"
log "  部署完成后用 admin / Admin@123 登录"
log "================================================"

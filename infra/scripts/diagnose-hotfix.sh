#!/usr/bin/env bash
# diagnose-hotfix.sh — 排查 hotfix-schema.sql 在存量库执行失败
#
# 用法（服务器上）：bash infra/scripts/diagnose-hotfix.sh
#
# 做什么：
#   1. 打印环境信息（磁盘/内存/MySQL 容器状态/当前 commit/hotfix 文件指纹）
#   2. 原样执行 hotfix-schema.sql，但【不吞错误】——MySQL 报出的第一条错误原样显示
#   3. 从错误里解析 "at line N"，把脚本里出错的那条语句上下文打出来
#
# 安全：hotfix-schema.sql 本身幂等（已存在的表/列自动跳过），重复执行无害；
#       本脚本只读环境信息 + 执行该脚本，不做任何其它写操作。
set -uo pipefail

APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env.production}
MYSQL_CONTAINER=${MYSQL_CONTAINER:-i9_mysql}
HOTFIX_SQL="$APP_DIR/infra/scripts/hotfix-schema.sql"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[DIAG $(date '+%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }

cd "$APP_DIR" || { err "找不到 $APP_DIR"; exit 1; }

# ── ① 环境信息 ─────────────────────────────────────────────────
log "===== 环境信息 ====="
echo "--- git ---";        git rev-parse --short HEAD 2>/dev/null; git log -1 --pretty='%h %s' 2>/dev/null
echo "--- 磁盘 ---";        df -h / | tail -1
echo "--- 内存 ---";        free -m 2>/dev/null | head -2
echo "--- MySQL 容器 ---";  docker ps -a --filter "name=$MYSQL_CONTAINER" --format '{{.Names}} {{.Status}}' 2>/dev/null
echo "--- hotfix 文件 ---"; ls -l "$HOTFIX_SQL"; md5sum "$HOTFIX_SQL" 2>/dev/null | cut -c1-40

# ── ② 凭据与连通性 ─────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then err "缺少 $ENV_FILE"; exit 1; fi
# shellcheck source=/dev/null
source <(grep -E '^(MYSQL_ROOT_PASSWORD|DB_NAME)=' "$ENV_FILE")
DB_NAME=${DB_NAME:-i9_clothes}
[[ -n "${MYSQL_ROOT_PASSWORD:-}" ]] || { err "MYSQL_ROOT_PASSWORD 未设置"; exit 1; }

if ! docker exec "$MYSQL_CONTAINER" mysqladmin ping -h localhost --silent 2>/dev/null; then
  err "MySQL 容器 $MYSQL_CONTAINER 无响应（docker ps 确认是否在跑）"
  exit 1
fi
log "MySQL 连通正常，目标库：$DB_NAME"

# ── ③ 原样执行 hotfix（不吞错误）───────────────────────────────
log "===== 执行 hotfix-schema.sql（显示真实报错） ====="
OUT=$(mktemp)
if docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$DB_NAME" < "$HOTFIX_SQL" >"$OUT" 2>&1; then
  log "===== 执行成功：本次 hotfix 无报错 ====="
  echo "说明：若 deploy.sh 仍报失败，请把本脚本【环境信息】段输出发回排查（磁盘/内存/容器状态）。"
  rm -f "$OUT"
  exit 0
fi

err "===== 执行失败，MySQL 原始报错如下 ====="
cat "$OUT"

# ── ④ 定位出错语句 ─────────────────────────────────────────────
LINE=$(grep -oE 'at line [0-9]+' "$OUT" | head -1 | grep -oE '[0-9]+' || true)
if [[ -n "${LINE:-}" ]]; then
  echo ""
  err "===== 出错语句上下文（hotfix-schema.sql 第 $LINE 行附近） ====="
  START=$(( LINE > 5 ? LINE - 5 : 1 ))
  sed -n "${START},$(( LINE + 3 ))p" "$HOTFIX_SQL" | cat -n -v | sed "s/^/  /"
fi
rm -f "$OUT"

echo ""
warn "请把本脚本完整输出发回（含环境信息段 + 报错段），即可定位原因。"
exit 1

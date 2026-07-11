#!/usr/bin/env bash
# ============================================================
# 清库脚本 —— 交付前清空业务/测试数据，保留结构与系统表
#   保留：sys_user(登录) / sys_config(参数) / sys_dict(字典) / company_profile(本司主体)
#   清空：其余全部业务+主数据表（客户/工厂/样衣/报价/订单/合同/对账/付款/结算/发票…）
#   重置：sys_sequence（单据编号重新从 1 开始）
#
# 安全：①执行前【强制整库备份】②须二次确认（输入 CLEAN 或 --yes）③默认保留字典
# 用法（登服务器后）：
#   cd /opt/i9/clothes-system && bash infra/scripts/clean-db.sh          # 交互确认
#   bash infra/scripts/clean-db.sh --yes                                 # 免交互
#   bash infra/scripts/clean-db.sh --yes --clear-dicts                   # 连字典一起清
# ============================================================
set -euo pipefail

APP_DIR=${APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env.production}
MYSQL_CONTAINER=${MYSQL_CONTAINER:-i9_mysql}
BACKUP_DIR=${BACKUP_DIR:-/opt/i9/backups}
DB_NAME=i9_clothes

YES=0; CLEAR_DICTS=0
for a in "$@"; do
  case "$a" in
    --yes|-y) YES=1 ;;
    --clear-dicts) CLEAR_DICTS=1 ;;
    *) echo "未知参数：$a"; exit 2 ;;
  esac
done

log() { echo -e "\033[0;36m[clean-db $(date +%H:%M:%S)]\033[0m $*"; }
die() { echo -e "\033[0;31m[clean-db] $*\033[0m" >&2; exit 1; }

# ── 载入密码 ──
[[ -f "$ENV_FILE" ]] || die "未找到 $ENV_FILE"
# shellcheck disable=SC1090
source <(grep -E '^(MYSQL_ROOT_PASSWORD|DB_NAME)=' "$ENV_FILE")
DB_NAME=${DB_NAME:-i9_clothes}
[[ -n "${MYSQL_ROOT_PASSWORD:-}" ]] || die "MYSQL_ROOT_PASSWORD 未在 $ENV_FILE 设置"

# ── 容器就绪 ──
docker ps --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$" || die "MySQL 容器 ${MYSQL_CONTAINER} 未运行"
MYSQL="docker exec -i ${MYSQL_CONTAINER} mysql -uroot -p${MYSQL_ROOT_PASSWORD} --default-character-set=utf8mb4 -N"

# 保留表（系统/参考数据）
KEEP="sys_user sys_config sys_dict company_profile"
[[ "$CLEAR_DICTS" -eq 0 ]] || KEEP="sys_user sys_config company_profile"

# ── 待清表 = 所有基础表 − 保留表 ──
ALL=$($MYSQL "$DB_NAME" -e \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_type='BASE TABLE';" 2>/dev/null)
[[ -n "$ALL" ]] || die "无法读取表清单"

TRUNC=""
for t in $ALL; do
  skip=0
  for k in $KEEP; do [[ "$t" == "$k" ]] && skip=1; done
  [[ "$skip" -eq 0 ]] && TRUNC="$TRUNC $t"
done

echo ""
log "库：$DB_NAME @ $MYSQL_CONTAINER"
log "【保留】$KEEP"
log "【清空】$(echo $TRUNC | wc -w | tr -d ' ') 张表：$TRUNC"
echo ""

# ── 二次确认 ──
if [[ "$YES" -ne 1 ]]; then
  echo -e "\033[0;33m⚠️  这将永久清空上述业务数据（先自动备份）。输入 CLEAN 回车以继续，其它任意键取消：\033[0m"
  read -r ans
  [[ "$ans" == "CLEAN" ]] || die "已取消（未改动数据库）"
fi

# ── 强制备份 ──
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M%S)
DUMP="$BACKUP_DIR/${DB_NAME}_before_clean_${TS}.sql.gz"
log "清库前整库备份 → $DUMP"
docker exec "$MYSQL_CONTAINER" mysqldump -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  --single-transaction --routines --triggers "$DB_NAME" 2>/dev/null | gzip > "$DUMP"
[[ -s "$DUMP" ]] || die "备份失败（未清库）"
log "备份完成：$(du -h "$DUMP" | cut -f1)"

# ── 执行清空（关外键约束，逐表 TRUNCATE，重置序列在其中） ──
log "清空业务数据…"
{
  echo "SET FOREIGN_KEY_CHECKS=0;"
  for t in $TRUNC; do echo "TRUNCATE TABLE \`$t\`;"; done
  echo "SET FOREIGN_KEY_CHECKS=1;"
} | $MYSQL "$DB_NAME"

# ── 校验 + 本司主体保底 ──
log "校验剩余行数（应仅保留表有数据）："
$MYSQL "$DB_NAME" -e "
  SELECT 'sys_user' t, COUNT(*) n FROM sys_user
  UNION ALL SELECT 'sys_config', COUNT(*) FROM sys_config
  UNION ALL SELECT 'sys_dict', COUNT(*) FROM sys_dict
  UNION ALL SELECT 'company_profile', COUNT(*) FROM company_profile
  UNION ALL SELECT 'customer(清)', COUNT(*) FROM customer
  UNION ALL SELECT 'factory(清)', COUNT(*) FROM factory
  UNION ALL SELECT 'order_main(清)', COUNT(*) FROM order_main
  UNION ALL SELECT 'contract(清)', COUNT(*) FROM contract
  UNION ALL SELECT 'sys_sequence(重置)', COUNT(*) FROM sys_sequence;" \
  | awk '{printf "    %-22s %s\n", $1, $2}'

echo ""
log "✅ 清库完成。备份留存：$DUMP"
log "   如需回滚：gunzip < $DUMP | docker exec -i $MYSQL_CONTAINER mysql -uroot -p<密码> $DB_NAME"

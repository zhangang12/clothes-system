#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 存量库结构升级（热修复）
# -----------------------------------------------------------------------------
# 场景：发版后接口大面积 "Unknown column" / "doesn't exist"（生产库结构落后于代码）。
# 动作：①先备份 → ②应用幂等的 hotfix-schema.sql → ③校验关键表/列 → ④重启 API → ⑤健康检查
# 用法：bash infra/scripts/upgrade-db.sh            （交互确认）
#        bash infra/scripts/upgrade-db.sh --yes      （跳过确认，供自动化）
# 安全：hotfix-schema.sql 全幂等，可反复执行；升级前自动整库备份。
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env.production}
SQL_FILE=${SQL_FILE:-$APP_DIR/infra/scripts/hotfix-schema.sql}
CONTAINER=${MYSQL_CONTAINER:-i9_mysql}
SERVICE=${SERVICE:-i9-api}

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[UPGRADE]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ -f "$ENV_FILE" ]] || die "环境变量文件不存在：$ENV_FILE"
[[ -f "$SQL_FILE"  ]] || die "SQL 文件不存在：$SQL_FILE"

# ── 读取数据库凭据 ────────────────────────────────────────────
# shellcheck source=/dev/null
source <(grep -E '^(MYSQL_ROOT_PASSWORD|DB_NAME)=' "$ENV_FILE")
DB_NAME=${DB_NAME:-i9_clothes}
[[ -n "${MYSQL_ROOT_PASSWORD:-}" ]] || die "MYSQL_ROOT_PASSWORD 未在 $ENV_FILE 中设置"

mysql_exec() { docker exec -i "$CONTAINER" mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" "$@"; }

# ── 前置检查 ──────────────────────────────────────────────────
docker exec "$CONTAINER" mysqladmin ping -h localhost --silent 2>/dev/null \
  || die "MySQL 容器 $CONTAINER 未响应，请先确认数据库在运行"

# ── 确认 ──────────────────────────────────────────────────────
if [[ "${1:-}" != "--yes" ]]; then
  echo ""
  warn "即将对生产库 [$DB_NAME] 应用结构升级（幂等，仅新增表/列，不动业务数据）。"
  warn "升级前会自动整库备份到 /data/backups。"
  read -rp "确认继续？[y/N] " CONFIRM
  [[ "${CONFIRM,,}" == "y" ]] || { warn "已取消"; exit 0; }
fi

# ── ① 升级前备份 ──────────────────────────────────────────────
log "升级前整库备份..."
if [[ -x "$APP_DIR/infra/scripts/backup.sh" ]]; then
  bash "$APP_DIR/infra/scripts/backup.sh" || die "备份失败，已中止升级（未对数据库做任何改动）"
else
  TS=$(date '+%Y%m%d_%H%M%S'); mkdir -p /data/backups
  docker exec "$CONTAINER" mysqldump -uroot -p"${MYSQL_ROOT_PASSWORD}" \
    --single-transaction --quick --routines --triggers "$DB_NAME" \
    | gzip -9 > "/data/backups/${DB_NAME}_preupgrade_${TS}.sql.gz" \
    || die "备份失败，已中止升级"
  log "备份完成 → /data/backups/${DB_NAME}_preupgrade_${TS}.sql.gz"
fi

# ── ② 应用热修复（幂等）───────────────────────────────────────
log "应用结构升级 $SQL_FILE ..."
mysql_exec "$DB_NAME" < "$SQL_FILE" || die "SQL 执行失败，请检查上方报错（数据已备份，可安全排查）"

# ── ③ 校验关键表/列是否补齐 ───────────────────────────────────
log "校验结构..."
MISSING=$(mysql_exec -N -B "$DB_NAME" <<SQL
SELECT GROUP_CONCAT(item SEPARATOR ', ') FROM (
  SELECT 'table:contract_shipment' item WHERE NOT EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract_shipment')
  UNION ALL SELECT 'table:reconciliation_expense_item' WHERE NOT EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reconciliation_expense_item')
  UNION ALL SELECT 'table:reconciliation_labor_item' WHERE NOT EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reconciliation_labor_item')
  UNION ALL SELECT 'table:company_profile' WHERE NOT EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profile')
  UNION ALL SELECT 'col:contract.revised' WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract' AND COLUMN_NAME='revised')
  UNION ALL SELECT 'col:settlement.refund_status' WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='settlement' AND COLUMN_NAME='refund_status')
  UNION ALL SELECT 'col:settlement.customer_name' WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='settlement' AND COLUMN_NAME='customer_name')
  UNION ALL SELECT 'col:settlement_cost.tax_rate' WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='settlement_cost' AND COLUMN_NAME='tax_rate')
  UNION ALL SELECT 'col:factory.extra_types' WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='factory' AND COLUMN_NAME='extra_types')
  UNION ALL SELECT 'col:contract.approval_status' WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract' AND COLUMN_NAME='approval_status')
  UNION ALL SELECT 'col:reconciliation.review_remark' WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reconciliation' AND COLUMN_NAME='review_remark')
  UNION ALL SELECT 'col:reconciliation_shipment.contract_id' WHERE NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reconciliation_shipment' AND COLUMN_NAME='contract_id')
) t;
SQL
)
if [[ -n "${MISSING//NULL/}" && "${MISSING}" != "NULL" ]]; then
  die "校验发现仍缺失：${MISSING}（请把此行发给我，我扩充 hotfix）"
fi
log "结构校验通过 ✓（关键表/列均已就位）"

# ── ④ 重启 API 清理失败连接状态 ───────────────────────────────
# 说明：结构补齐后 TypeORM 下一次查询即恢复，重启并非必需——仅为清空可能缓存的失败连接。
# 用 `systemctl cat` 判定单元是否存在（比 grep list-unit-files 稳健，不受名称格式影响）。
if systemctl cat "${SERVICE}.service" &>/dev/null; then
  log "重启 API 服务 ($SERVICE)..."
  systemctl restart "$SERVICE" || warn "重启 $SERVICE 失败，请手动 systemctl restart $SERVICE"
elif command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "$SERVICE"; then
  log "检测到 pm2 托管，重启 API ($SERVICE)..."
  pm2 restart "$SERVICE" || warn "pm2 restart $SERVICE 失败，请手动重启"
else
  warn "未找到 systemd 单元 ${SERVICE}.service（可能手动/其他方式启动）。"
  warn "结构升级不依赖重启（TypeORM 下次查询即恢复）；若用其他进程管理，请自行重启 API 以清空连接池。"
fi

# ── ⑤ 健康检查 ────────────────────────────────────────────────
log "等待 API 就绪..."
for i in $(seq 1 15); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/v1 2>/dev/null || echo 000)
  [[ "$CODE" =~ ^[234] ]] && { log "API 已就绪 ✓ (HTTP $CODE)"; break; }
  [[ $i -eq 15 ]] && warn "API 未在预期时间就绪（最后 HTTP $CODE），请查 journalctl -u $SERVICE"
  sleep 2
done

# 若近 2 分钟日志仍有 schema 报错，提示（不算失败——可能是历史日志）
if command -v journalctl &>/dev/null; then
  RESID=$(journalctl -u "$SERVICE" --since "1 min ago" 2>/dev/null \
    | grep -icE "Unknown column|ER_BAD_FIELD_ERROR|ER_NO_SUCH_TABLE|doesn't exist" || true)
  [[ "${RESID:-0}" -gt 0 ]] && warn "重启后 1 分钟内仍检测到 ${RESID} 条结构报错，请把报错列名发我扩充 hotfix"
fi

echo ""
log "===== 结构升级完成 ====="
log "建议随后跑一次业务冒烟：bash $APP_DIR/infra/scripts/health.sh"

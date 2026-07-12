#!/usr/bin/env bash
# ============================================================
# 运维巡检 —— 定时拉取"未处理系统报错 + 未处理用户反馈"
#   独立运行于生产服务器(直连本地 MySQL,无需 API/凭据)；
#   发现待处理项 → 追加到报告日志 /var/log/i9-ops-watch.log；
#   退出码：0=无待处理  10=有待处理(可供告警/自动修复触发判断)。
# 用法：bash infra/scripts/ops-watch.sh    （crontab 每 30 分钟）
# ============================================================
set -euo pipefail

APP_DIR=${APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env.production}
MYSQL_CONTAINER=${MYSQL_CONTAINER:-i9_mysql}
LOG=${OPS_LOG:-/var/log/i9-ops-watch.log}
DB_NAME=i9_clothes

# shellcheck disable=SC1090
source <(grep -E '^(MYSQL_ROOT_PASSWORD|DB_NAME)=' "$ENV_FILE")
DB_NAME=${DB_NAME:-i9_clothes}
MYSQL="docker exec -i ${MYSQL_CONTAINER} mysql -uroot -p${MYSQL_ROOT_PASSWORD} --default-character-set=utf8mb4 -N"

TS=$(date '+%Y-%m-%d %H:%M:%S')

# 未处理系统报错(近 24h 新增 + 仍未处理)
ERR=$($MYSQL "$DB_NAME" -e \
  "SELECT COUNT(*) FROM error_log WHERE status='OPEN';" 2>/dev/null || echo 0)
# 未处理用户反馈
FB=$($MYSQL "$DB_NAME" -e \
  "SELECT COUNT(*) FROM feedback WHERE status='PENDING' AND deleted=0;" 2>/dev/null || echo 0)

ERR=${ERR:-0}; FB=${FB:-0}

if [[ "${ERR}" -eq 0 && "${FB}" -eq 0 ]]; then
  echo "[$TS] ✓ 无待处理(报错0/反馈0)" >> "$LOG"
  exit 0
fi

{
  echo "[$TS] ⚠️ 待处理：系统报错 ${ERR} 条 / 用户反馈 ${FB} 条"
  if [[ "${ERR}" -gt 0 ]]; then
    echo "  —— 未处理报错(最多10条，按指纹去重) ——"
    $MYSQL "$DB_NAME" -e \
      "SELECT CONCAT('  #', id, ' [', status_code, '] ', method, ' ', path, ' | ', COALESCE(error_type,'-'), ' | ', LEFT(COALESCE(message,''),80), ' x', count)
         FROM error_log WHERE status='OPEN' ORDER BY last_seen DESC LIMIT 10;" 2>/dev/null || true
  fi
  if [[ "${FB}" -gt 0 ]]; then
    echo "  —— 未处理反馈(最多10条) ——"
    $MYSQL "$DB_NAME" -e \
      "SELECT CONCAT('  #', id, ' ', LEFT(COALESCE(content,''),100))
         FROM feedback WHERE status='PENDING' AND deleted=0 ORDER BY id DESC LIMIT 10;" 2>/dev/null || true
  fi
} >> "$LOG"

exit 10

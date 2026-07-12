#!/usr/bin/env bash
# ============================================================
# 生成「定时作业监控」纯静态页面
#   读取：MySQL 未处理报错/反馈数、日备份日志、巡检日志、系统时间
#   产出：把数值填进 infra/ops/monitor.tpl.html，写成一个自包含静态 HTML
#         默认落到 nginx 的 web 根目录 → http://<host>/ops-monitor.html
#   页面本身零接口调用（纯静态）；由 crontab 每 30 分钟重生成保持数据新鲜。
# 用法：bash infra/scripts/gen-ops-page.sh            （crontab 每 30 分钟）
#      OPS_PAGE_OUT=/some/path.html bash ...          （自定义输出位置）
# 容错：任一数据源失败只降级显示「—」，绝不因此失败退出。
# ============================================================
set -uo pipefail

APP_DIR=${APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env.production}
MYSQL_CONTAINER=${MYSQL_CONTAINER:-i9_mysql}
TPL=${OPS_PAGE_TPL:-$APP_DIR/infra/ops/monitor.tpl.html}
OUT=${OPS_PAGE_OUT:-/var/www/web/ops-monitor.html}
BACKUP_DIR=${BACKUP_DIR:-/data/backups}
BK_LOG=${BK_LOG:-/var/log/i9-backup.log}
OW_LOG=${OW_LOG:-/var/log/i9-ops-watch.log}
DB_NAME=i9_clothes

[[ -f "$TPL" ]] || { echo "模板缺失：$TPL" >&2; exit 1; }

# ── 载入 DB 密码 ──
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source <(grep -E '^(MYSQL_ROOT_PASSWORD|DB_NAME)=' "$ENV_FILE" 2>/dev/null || true)
fi
DB_NAME=${DB_NAME:-i9_clothes}

dt_re='[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}'

# ── 未处理报错 / 反馈 ──
ERR="—"; FB="—"
if [[ -n "${MYSQL_ROOT_PASSWORD:-}" ]] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${MYSQL_CONTAINER}$"; then
  MYSQL="docker exec -i ${MYSQL_CONTAINER} mysql -uroot -p${MYSQL_ROOT_PASSWORD} --default-character-set=utf8mb4 -N"
  E=$($MYSQL "$DB_NAME" -e "SELECT COUNT(*) FROM error_log WHERE status='OPEN';" 2>/dev/null) && [[ -n "$E" ]] && ERR="$E"
  F=$($MYSQL "$DB_NAME" -e "SELECT COUNT(*) FROM feedback WHERE status='PENDING' AND deleted=0;" 2>/dev/null) && [[ -n "$F" ]] && FB="$F"
fi

# ── 健康判定 ──
BANNER_CLASS=""; BANNER_TITLE="全部正常运行"; TODO_COLOR="var(--ok)"; TODO_TOTAL="0"
BANNER_META="3 项定时作业在册 · 今日 ${ERR} 报错 / ${FB} 反馈 · 均按计划执行"
if [[ "$ERR" =~ ^[0-9]+$ && "$FB" =~ ^[0-9]+$ ]]; then
  TODO_TOTAL=$(( ERR + FB ))
  if [[ "$TODO_TOTAL" -gt 0 ]]; then
    BANNER_CLASS="warn"; BANNER_TITLE="有 ${TODO_TOTAL} 项待处理"; TODO_COLOR="var(--warn)"
    BANNER_META="待处理：系统报错 ${ERR} 条 / 用户反馈 ${FB} 条 · 智能巡检将在下个时段自动处理"
  fi
else
  TODO_TOTAL="—"; TODO_COLOR="var(--ink-3)"
  BANNER_META="3 项定时作业在册 · 待处理计数暂不可用（DB 未就绪）"
fi

# ── 最近备份（时间 / 大小 / 份数）──
BK_FULL="—"; BK_HHMM="--:--"; BK_SIZE="—"; BK_KEEP="0"
# 只取数据库 dump 完成行（排除「上传文件备份完成」的附件行，否则大小会取成附件包大小）
BK_LINE=$(grep "备份完成" "$BK_LOG" 2>/dev/null | grep -v "上传文件" | tail -1 || true)
if [[ -n "$BK_LINE" ]]; then
  T=$(echo "$BK_LINE" | grep -oE "$dt_re" | head -1); [[ -n "$T" ]] && BK_FULL="$T" && BK_HHMM="${T:11:5}"
  S=$(echo "$BK_LINE" | grep -oE '大小=[0-9.]+[KMGT]?' | head -1 | cut -d= -f2); [[ -n "$S" ]] && BK_SIZE="$S"
fi
N=$(ls "$BACKUP_DIR"/i9_clothes_*.sql.gz 2>/dev/null | wc -l | tr -d ' '); [[ -n "$N" ]] && BK_KEEP="$N"

# ── 最近巡检（时间 / 结果）──
OW_FULL="—"; OW_RESULT="暂无记录"
OW_LINE=$(tail -1 "$OW_LOG" 2>/dev/null || true)
if [[ -n "$OW_LINE" ]]; then
  T=$(echo "$OW_LINE" | grep -oE "$dt_re" | head -1); [[ -n "$T" ]] && OW_FULL="$T"
  R=$(echo "$OW_LINE" | sed -E 's/^\[[^]]*\][[:space:]]*//'); [[ -n "$R" ]] && OW_RESULT="$R"
fi

SNAP="$(date '+%Y-%m-%d %H:%M') $(date '+%Z')"

# ── 填充模板（bash 字符串替换，避免 sed 转义坑）──
HTML=$(<"$TPL")
fill(){ HTML=${HTML//"$1"/"$2"}; }
fill "@@BANNER_CLASS@@" "$BANNER_CLASS"
fill "@@BANNER_TITLE@@" "$BANNER_TITLE"
fill "@@BANNER_META@@"  "$BANNER_META"
fill "@@SNAP@@"         "$SNAP"
fill "@@TODO_COLOR@@"   "$TODO_COLOR"
fill "@@TODO_TOTAL@@"   "$TODO_TOTAL"
fill "@@ERR@@"          "$ERR"
fill "@@FB@@"           "$FB"
fill "@@BK_HHMM@@"      "$BK_HHMM"
fill "@@BK_FULL@@"      "$BK_FULL"
fill "@@BK_SIZE@@"      "$BK_SIZE"
fill "@@BK_KEEP@@"      "$BK_KEEP"
fill "@@OW_FULL@@"      "$OW_FULL"
fill "@@OW_RESULT@@"    "$OW_RESULT"

# ── 原子写出 ──
mkdir -p "$(dirname "$OUT")" 2>/dev/null || true
TMP="${OUT}.tmp.$$"
printf '%s\n' "$HTML" > "$TMP" && mv -f "$TMP" "$OUT"
echo "[gen-ops-page $(date '+%H:%M:%S')] 写出 $OUT （报错=$ERR 反馈=$FB 备份=$BK_HHMM×$BK_KEEP 巡检=$OW_FULL）"

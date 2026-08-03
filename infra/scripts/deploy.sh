#!/usr/bin/env bash
# 防呆：被 sh/dash 误调时自动用 bash 重跑（本脚本用了 process substitution `source <(...)` 等
# bash 专有语法；部分 web 终端/AI 面板默认用 sh 解释脚本，会在 101 行附近报
# "syntax error near unexpected token `('"）
[ -z "${BASH_VERSION:-}" ] && exec bash "$0" "$@"
# =============================================================================
# I9 服装制造管理系统 — 一键部署（每次发版只跑这一条）
# 用法：bash infra/scripts/deploy.sh [--skip-pull] [--skip-backup]
#
# 一条命令完成：拉码(main) → 构建四包 → 【自动备份 + 幂等升级数据库结构】
#              → 保证 MySQL/Redis 就绪 → 重启 API → 健康检查 → reload nginx
# 关键：数据库结构升级(hotfix-schema.sql，幂等)在 API 重启【之前】自动执行，
#       无需再区分"有没有动 schema"，也不会再出现发版后 Unknown column。
# 失败即打印回滚命令（保留发版前 commit）。
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env.production}
WEB_ROOT=${WEB_ROOT:-/var/www/web}
PORTAL_ROOT=${PORTAL_ROOT:-/var/www/portal}
SERVICE=i9-api
MYSQL_CONTAINER=${MYSQL_CONTAINER:-i9_mysql}
REDIS_CONTAINER=${REDIS_CONTAINER:-i9_redis}
HOTFIX_SQL="$APP_DIR/infra/scripts/hotfix-schema.sql"
LOG_FILE=${LOG_FILE:-/var/log/i9/deploy.log}
# 「上一个完整跑完部署的 commit」落盘处：失败时的回滚目标首选它（见 resolve_prev_commit）
STATE_DIR=${STATE_DIR:-/var/lib/i9}
LAST_DEPLOYED_FILE="$STATE_DIR/last-deployed-commit"

SKIP_PULL=false; SKIP_BACKUP=false; SKIP_BUILD=false
for a in "$@"; do
  case "$a" in
    --skip-pull)   SKIP_PULL=true ;;
    --skip-backup) SKIP_BACKUP=true ;;
    --skip-build)  SKIP_BUILD=true ;;
    *) echo "未知参数：$a（可用 --skip-pull / --skip-backup / --skip-build）"; exit 2 ;;
  esac
done

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PREV_COMMIT_ENV=${PREV_COMMIT:-}   # 调用方（deploy-local.sh）在 git push 之前读到的服务器 HEAD
PREV_COMMIT=""                     # 解析结果见 resolve_prev_commit
DIED=false
log()  { echo -e "${GREEN}[DEPLOY $(date '+%H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*" | tee -a "$LOG_FILE"; }
# 回滚提示：只在「确实拿到了一个不等于当前版本的 commit」时才打印命令，
# 否则老老实实说不知道——打一条把你送回出问题那一版的命令，比不打更糟。
rollback_hint() {
  local cur; cur=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || true)
  if [[ -n "$PREV_COMMIT" && "$PREV_COMMIT" != "$cur" ]]; then
    echo -e "${YELLOW}如需回滚上一版：bash $APP_DIR/infra/scripts/rollback.sh $PREV_COMMIT${NC}" | tee -a "$LOG_FILE"
  else
    echo -e "${YELLOW}未能确定发版前的 commit（当前 ${cur:-?}）——请先 git -C $APP_DIR log --oneline -10 挑目标，再 bash $APP_DIR/infra/scripts/rollback.sh <commit>${NC}" | tee -a "$LOG_FILE"
  fi
}
die()  {
  DIED=true
  echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
  rollback_hint
  exit 1
}
# 没包 die 的命令（pnpm/rsync/systemctl…）失败时被 set -e 直接掐掉，此前连一行回滚提示都没有。
# ERR 兜底，保证「任一步失败都留下回滚路径」这句话是真的。
trap 'rc=$?; $DIED || { echo -e "${RED}[ERROR]${NC} 部署在第 ${LINENO} 行中断（exit=${rc}）" | tee -a "$LOG_FILE"; rollback_hint; }; exit $rc' ERR

# 发版前「线上真正在跑」的 commit —— 失败时的回滚目标。
# 【2026-08-03 修】原来直接取当前 HEAD，但默认发版路径是开发机 deploy-local.sh：
#   它先 git push ecs main（服务器 receive.denyCurrentBranch=updateInstead，工作树当场
#   被更新到新 commit），之后才 ssh 调本脚本（--skip-pull）——此时 HEAD 已经是新版本。
#   实证：8-03 两次发版日志都打「部署成功 commit=54ca4c7 (上一版 54ca4c7)」，上一版==当前版；
#   一旦中途失败，照提示回滚就是回到出问题的那一版，等于没有回滚路径。
# 取值优先级（越靠前越可信）：
#   ① $LAST_DEPLOYED_FILE：上次**完整跑完**部署的版本，唯一能证明「这版真上过线」。
#      上次发版中途失败时它仍指向最后一个好版本（传入值和 HEAD 都会指向失败的那一版）。
#   ② 调用方传入的 PREV_COMMIT：deploy-local.sh 在 push 之前读的服务器 HEAD（首次部署时的兜底）。
#   ③ 本脚本自己拉码（未 --skip-pull，如服务器直接发版 / CI）：拉之前的 HEAD 就是上一版。
#   ④ --skip-pull 且无人告知：HEAD 已被 push/checkout 换掉，退到 reflog 上一条。
resolve_prev_commit() {
  local cur v cands
  cur=$(git rev-parse --short HEAD 2>/dev/null || true)
  cands=("$(cat "$LAST_DEPLOYED_FILE" 2>/dev/null || true)" "$PREV_COMMIT_ENV")
  if $SKIP_PULL; then
    cands+=("$(git rev-parse --short 'HEAD@{1}' 2>/dev/null || true)")  # 被 push/checkout 换掉之前那条
  else
    cands+=("$cur")                                                     # 拉码之前的 HEAD = 上一版
  fi
  for v in "${cands[@]}"; do
    v=$(echo "$v" | tr -d '[:space:]')
    [[ -n "$v" ]] || continue
    # 记录过期/传错（commit 在本仓库不存在）就跳过——别打一条根本跑不通的回滚命令
    v=$(git rev-parse --short --verify "${v}^{commit}" 2>/dev/null || true)
    [[ -n "$v" ]] || continue
    # --skip-pull 下代码已是新版：候选等于当前 HEAD 说明它就是「出问题的这一版」，没有回滚价值，继续往下找
    if $SKIP_PULL && [[ "$v" == "$cur" ]]; then continue; fi
    echo "$v"; return 0
  done
  return 1
}

mkdir -p "$(dirname "$LOG_FILE")"   # 先建日志目录：die() 要往 $LOG_FILE 里 tee，早于它就 die 会写不进去
[[ -f "$ENV_FILE" ]] || die "环境变量文件不存在：$ENV_FILE"
echo "" >> "$LOG_FILE"
log "===== 开始一键部署 ====="
cd "$APP_DIR"
PREV_COMMIT=$(resolve_prev_commit || true)
if [[ -n "$PREV_COMMIT" ]]; then
  log "发版前版本：$PREV_COMMIT（失败即按此回滚）"
else
  warn "未能确定发版前版本——失败时需自行 git log 挑回滚目标"
fi

# ── ① 拉取最新代码（GitHub 国内网络不稳，失败自动重试）──────────
if ! $SKIP_PULL; then
  log "拉取最新代码 (origin/main)..."
  n=0
  until git fetch origin main; do
    n=$((n + 1))
    [[ $n -ge 4 ]] && die "git fetch 失败（网络问题），已重试 ${n} 次。手动 git fetch 成功后可 bash $0 --skip-pull"
    warn "git fetch 失败（${n}/4），$((n * 3))s 后重试..."
    sleep $((n * 3))
  done
  git reset --hard origin/main
fi

# ── ② 安装依赖 + 构建（types 必须先于 api）────────────────────
# 【2026-07-16 事故教训】本机只有 ~1.8G 内存且无 swap，四个包连续构建会耗尽内存，
# 内核 OOM killer 挑中 RSS 最大的进程——把生产 mysqld 杀了（数据靠容器重启+崩溃恢复
# 保住，但线上险些出事）。故默认改为「本地构建、产物 rsync 上来」：
#   开发机跑 bash infra/scripts/deploy-local.sh —— 它会带 --skip-build 调用本脚本。
# 仍想在服务器上构建（如临时救急），去掉 --skip-build 即可，但请先确认有 swap。
log "安装依赖（frozen）..."
pnpm install --frozen-lockfile --prefer-offline 2>&1 | tail -5
if $SKIP_BUILD; then
  log "跳过构建（--skip-build：产物由开发机 rsync 上传）"
  for d in packages/types/dist packages/api/dist packages/web/dist packages/portal/dist; do
    [[ -d "$APP_DIR/$d" ]] || die "缺少构建产物 $d —— 请在开发机执行 bash infra/scripts/deploy-local.sh"
  done
  # 产物比源码旧 = 开发机没重新构建就推了，属于典型翻车
  if [[ "$APP_DIR/packages/web/src" -nt "$APP_DIR/packages/web/dist" ]]; then
    warn "web 源码比产物新——开发机可能忘了重新构建，请核对"
  fi
else
  log "构建类型包..."; pnpm --filter @i9/types build
  log "构建 API...";   pnpm --filter @i9/api build
  log "构建管理后台..."; pnpm --filter @i9/web build
  log "构建供应商门户..."; NODE_ENV=production pnpm --filter @i9/portal build
fi

# ── ③ 数据库结构：自动备份 + 幂等升级（在 API 重启之前！）──────
# hotfix-schema.sql 幂等：已存在的表/列自动跳过，没动 schema 时是无害 no-op。
mysql_up() { docker exec "$MYSQL_CONTAINER" mysqladmin ping -h localhost --silent 2>/dev/null; }
# 【2026-08-03 修】原来是 `docker ps ... | grep -q "^name$"`：grep 命中就立刻退出，docker 若还没
# 写完就吃 SIGPIPE，`set -o pipefail` 下整条管道返回 141 → 判成「没有这台容器」→ **静默跳过整个
# 结构升级**，然后照常重启 API = 红线一最怕的「发版后 Unknown column 全线报错」，还只留一条 warn。
# （本次沙箱验证里真踩到过一次，容器名后面还有别的容器时更容易中。）先把输出落进变量再纯 bash 匹配，
# 没有管道就没有 SIGPIPE。
has_container() {  # $1=容器名；$2=--all 时连未运行的也算
  local names
  if [[ "${2:-}" == "--all" ]]; then names=$(docker ps -a --format '{{.Names}}' 2>/dev/null || true)
  else                                names=$(docker ps    --format '{{.Names}}' 2>/dev/null || true); fi
  [[ $'\n'"$names"$'\n' == *$'\n'"$1"$'\n'* ]]
}
if command -v docker &>/dev/null && has_container "$MYSQL_CONTAINER" --all; then
  if ! mysql_up; then
    log "MySQL 容器未运行，尝试启动..."
    docker start "$MYSQL_CONTAINER" >/dev/null 2>&1 || true
    for i in $(seq 1 12); do mysql_up && break; sleep 3; done
  fi
  mysql_up || die "MySQL 容器 $MYSQL_CONTAINER 无响应，已中止（未改动数据库）"

  # 读取数据库凭据
  # shellcheck source=/dev/null
  source <(grep -E '^(MYSQL_ROOT_PASSWORD|DB_NAME)=' "$ENV_FILE")
  DB_NAME=${DB_NAME:-i9_clothes}
  [[ -n "${MYSQL_ROOT_PASSWORD:-}" ]] || die "MYSQL_ROOT_PASSWORD 未在 $ENV_FILE 设置"
  MYSQL="docker exec -i $MYSQL_CONTAINER mysql -uroot -p${MYSQL_ROOT_PASSWORD}"

  # 升级前备份（可 --skip-backup 跳过）
  if $SKIP_BACKUP; then
    warn "已跳过升级前备份（--skip-backup）"
  else
    log "升级前整库备份..."
    if [[ -x "$APP_DIR/infra/scripts/backup.sh" ]]; then
      bash "$APP_DIR/infra/scripts/backup.sh" >/dev/null || die "备份失败，已中止（未改动数据库）"
    else
      TS=$(date '+%Y%m%d_%H%M%S'); mkdir -p /data/backups
      docker exec "$MYSQL_CONTAINER" mysqldump -uroot -p"${MYSQL_ROOT_PASSWORD}" \
        --single-transaction --quick --routines --triggers "$DB_NAME" \
        | gzip -9 > "/data/backups/${DB_NAME}_predeploy_${TS}.sql.gz" || die "备份失败，已中止"
    fi
  fi

  if [[ -f "$HOTFIX_SQL" ]]; then
    log "应用数据库结构升级（幂等 hotfix-schema.sql）..."
    # 错误输出留底并露出——失败时直接能看到是哪条语句报的什么错（此前 >/dev/null 2>&1 全吞了，排查全靠猜）
    SQL_ERR=$(mktemp)
    if ! $MYSQL "$DB_NAME" < "$HOTFIX_SQL" >"$SQL_ERR" 2>&1; then
      cat "$SQL_ERR" >&2
      die "结构升级 SQL 执行失败（数据已备份，可排查后重跑）"
    fi
    rm -f "$SQL_ERR"
    # 抽检关键列（缺失即中止，避免带病重启 API）；用 set +e 包裹，避免查询本身失败触发 set -e 静默退出
    set +e
    MISS=$($MYSQL -N -B "$DB_NAME" 2>/dev/null <<SQL
SELECT GROUP_CONCAT(x SEPARATOR ', ') FROM (
  SELECT 'contract.revised' x WHERE NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract' AND COLUMN_NAME='revised')
  UNION ALL SELECT 'settlement_cost.tax_rate' WHERE NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='settlement_cost' AND COLUMN_NAME='tax_rate')
  UNION ALL SELECT 'table:contract_shipment' WHERE NOT EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract_shipment')
) t;
SQL
)
    set -e
    [[ -z "${MISS//NULL/}" || "$MISS" == "NULL" ]] || die "结构升级后关键列仍缺失：$MISS"
    log "数据库结构已就位 ✓"
  else
    warn "未找到 $HOTFIX_SQL，跳过结构升级（请确认库结构与代码一致）"
  fi
else
  warn "未发现 $MYSQL_CONTAINER 容器（如用外部数据库），跳过自动结构升级——请自行确保库结构已升级到位"
fi

# ── ④ 静态文件 + 权限 ─────────────────────────────────────────
log "修正文件权限..."
chown -R i9app:i9app "$APP_DIR/packages/api/dist" 2>/dev/null || true
log "更新静态文件..."
rsync -a --delete packages/web/dist/    "$WEB_ROOT/"
rsync -a --delete packages/portal/dist/ "$PORTAL_ROOT/"

# ── ⑤ 保证 Redis 就绪（单号生成依赖，停机会导致新建单据失败）────
if command -v docker &>/dev/null && has_container "$REDIS_CONTAINER" --all; then
  if ! has_container "$REDIS_CONTAINER"; then
    log "Redis 容器未运行，尝试启动..."
    docker start "$REDIS_CONTAINER" >/dev/null 2>&1 || warn "启动 $REDIS_CONTAINER 失败，请手动检查（新建单据会受影响）"
  fi
fi

# ── ⑥ 重启 API（服务不存在时先注册）──────────────────────────
log "重启 API 服务..."
if ! systemctl is-enabled "$SERVICE" &>/dev/null; then
  cp "$APP_DIR/infra/systemd/i9-api.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable "$SERVICE"
fi
systemctl restart "$SERVICE"

# ── ⑦ 健康检查（/api/v1 正常 404，证明已在路由；不用 curl -f）──
log "等待服务就绪..."
for i in $(seq 1 15); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/v1 2>/dev/null || echo 000)
  [[ "$CODE" =~ ^[234] ]] && { log "API 已就绪 ✓ (HTTP $CODE)"; break; }
  [[ $i -eq 15 ]] && die "服务启动超时（最后 HTTP $CODE），查 journalctl -u $SERVICE"
  sleep 2
done
# 重启后残留结构报错自检
RESID=$(journalctl -u "$SERVICE" --since "40 sec ago" 2>/dev/null | grep -icE "Unknown column|ER_BAD_FIELD_ERROR|ER_NO_SUCH_TABLE|doesn't exist" || true)
[[ "${RESID:-0}" -eq 0 ]] || warn "重启后检测到 ${RESID} 条结构报错，请把报错列名发我扩充 hotfix-schema.sql"

# ── ⑧ Nginx reload（未运行不阻断部署）────────────────────────
if systemctl is-active --quiet nginx; then
  nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || warn "nginx reload 失败"
else
  warn "nginx 未运行，跳过 reload"
fi

COMMIT=$(git rev-parse --short HEAD)
# 落盘「这一版完整跑完了部署」——下次失败时的回滚目标就取它（resolve_prev_commit ①）
if ! { mkdir -p "$STATE_DIR" && printf '%s\n' "$COMMIT" > "$LAST_DEPLOYED_FILE"; } 2>/dev/null; then
  warn "无法写入 $LAST_DEPLOYED_FILE——下次失败时的回滚提示只能退回 reflog 推断"
fi
log "===== 部署成功  commit=${COMMIT} (上一版 ${PREV_COMMIT:-?}) ====="
log "建议随手体检：bash $APP_DIR/infra/scripts/health.sh"

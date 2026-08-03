#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 版本回滚脚本
# 用法：bash rollback.sh              （列出最近 10 次提交供选择）
#        bash rollback.sh <commit>     （直接回滚到指定 commit/tag）
#
# 【为什么回滚必须在服务器上重新构建】(2026-08-03 核实)
# 日常发版走 deploy-local.sh：开发机构建 → dist rsync 上来 → deploy.sh --skip-build。
# 但回滚时服务器上的 dist 正是「要滚掉的那一版」，**跳过构建 = 代码回了、跑的还是旧产物**，
# 等于没回滚且毫无提示。所以这里必须带构建，不能图快加 --skip-build。
# 构建吃内存（7-16 曾因无 swap 连构建四包触发 OOM，内核挑中 RSS 最大的进程杀了生产 mysqld）；
# 现已配 4G swapfile，下方 preflight 会在内存+swap 不足时直接拦下并给替代路径。
# =============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
SERVICE=i9-api
# 构建四包所需的「可用内存 + swap」下限（MB）。低于此值不如不开工——
# 真到要回滚的时候，线上多半已经在出问题，不该再把 mysqld 挤进 swap 里。
MIN_BUILD_MEM_MB=${MIN_BUILD_MEM_MB:-2048}

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[ROLLBACK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

cd "$APP_DIR"

# ── 选择目标版本 ──────────────────────────────────────────────
if [[ -n "${1:-}" ]]; then
  TARGET="$1"
else
  echo ""
  echo "最近 10 次提交："
  git log --oneline -10
  echo ""
  read -rp "请输入要回滚到的 commit hash 或 tag（留空取消）: " TARGET
  [[ -z "$TARGET" ]] && { warn "已取消回滚"; exit 0; }
fi

# ── 确认 ──────────────────────────────────────────────────────
CURRENT=$(git rev-parse --short HEAD)
TARGET_FULL=$(git rev-parse --short --verify "${TARGET}^{commit}" 2>/dev/null) || die "无效的 commit: $TARGET"
[[ "$TARGET_FULL" != "$CURRENT" ]] || die "目标就是当前版本 ${CURRENT}，无需回滚"

# ── preflight：构建内存够不够（不够就别开工，给替代路径）──────
AVAIL_MB=$(awk '/^MemAvailable:/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
SWAP_MB=$(awk '/^SwapTotal:/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
TOTAL_MB=$((AVAIL_MB + SWAP_MB))
log "内存 preflight：可用 ${AVAIL_MB}MB + swap ${SWAP_MB}MB = ${TOTAL_MB}MB（下限 ${MIN_BUILD_MEM_MB}MB）"
if (( TOTAL_MB < MIN_BUILD_MEM_MB )); then
  echo ""
  die "内存不足以在本机构建四包（${TOTAL_MB}MB < ${MIN_BUILD_MEM_MB}MB），已中止——继续下去有把生产 mysqld 挤爆的风险（7-16 事故原样）。
  替代路径（在开发机执行，构建放开发机、服务器只换产物重启）：
    git checkout main && git reset --hard ${TARGET_FULL} && git push ecs main --force-with-lease
    bash infra/scripts/deploy-local.sh
  或先加 swap 再重跑本脚本：
    fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"
fi

echo ""
warn "即将回滚: ${CURRENT} → ${TARGET_FULL}"
warn "服务器会重新构建四包（回滚必须重建，否则跑的还是要滚掉的那版产物），API 会短暂中断。"
read -rp "确认回滚？[y/N] " CONFIRM
[[ "${CONFIRM,,}" == "y" ]] || { warn "已取消"; exit 0; }

# ── 执行回滚 ──────────────────────────────────────────────────
# 【别用 git checkout <commit>】那会把服务器打成 detached HEAD，而服务器配了
# receive.denyCurrentBranch=updateInstead —— 该配置只在「推的分支正是检出中的分支」时才更新工作树。
# detached 之下，下次开发机 git push ecs main 只会挪 ref、**工作树纹丝不动**：
# 新产物 rsync 上来照常重启，源码树却停在回滚版，deploy.sh 读到的还是旧 hotfix-schema.sql——
# 版本错配且全程无提示。所以停在原分支上，只把分支指针挪回去（之后再发版仍是正常快进）。
BRANCH=$(git symbolic-ref --short -q HEAD || true)
if [[ -n "$BRANCH" ]]; then
  log "在分支 $BRANCH 上回退到 $TARGET_FULL ..."
  git reset --hard "$TARGET_FULL"     # 不动未跟踪文件(.env.production 等)
else
  warn "当前是 detached HEAD（非常规状态），仅切换到目标版本"
  git checkout "$TARGET_FULL"
  warn "回滚后请尽快 git checkout main 复位，否则下次 push 不会更新工作树"
fi

log "重新部署（含构建）..."
bash "$APP_DIR/infra/scripts/deploy.sh" --skip-pull

log "回滚完成  current=$(git rev-parse --short HEAD)  分支=${BRANCH:-detached}"

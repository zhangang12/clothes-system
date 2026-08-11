#!/usr/bin/env bash
# 发版（开发机执行）—— 本地构建 → 产物 rsync 到服务器 → 服务器只做备份/结构升级/重启。
#
# 【为什么不在服务器构建】2026-07-16 事故：ECS 仅 ~1.8G 内存且无 swap，deploy.sh 连续
# 构建四个包耗尽内存，内核 OOM killer 选中 RSS 最大的进程，把生产 mysqld 杀了
# （容器自动重启 + XA 崩溃恢复保住了数据，但线上险些出事）。构建这种吃内存的活儿
# 不该和生产数据库抢同一台 1.8G 的机器。
#
# 用法：bash infra/scripts/deploy-local.sh [--skip-tests] [--skip-backup]
set -euo pipefail

REMOTE=${REMOTE:-root@123.57.87.30}
APP_DIR=${APP_DIR:-/opt/i9/clothes-system}
REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

SKIP_TESTS=false; PASS_THRU=()
for a in "$@"; do
  case "$a" in
    --skip-tests)  SKIP_TESTS=true ;;
    --skip-backup) PASS_THRU+=("--skip-backup") ;;
    *) echo "未知参数：$a（可用 --skip-tests / --skip-backup）"; exit 2 ;;
  esac
done

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[LOCAL $(date '+%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

cd "$REPO_ROOT"

# ── ① 干净性检查：别把没提交的东西发上去 ─────────────────────
[[ -z "$(git status --porcelain)" ]] || die "工作区有未提交改动，先提交或暂存（发版必须与 git 版本一致）"
COMMIT=$(git rev-parse --short HEAD)
log "本次发版：$COMMIT $(git log -1 --pretty=%s)"

# ── ② 本地构建（types 必须先于 api）───────────────────────────
log "构建类型包..."; pnpm --filter @i9/types build >/dev/null
log "构建 API...";   pnpm --filter @i9/api build >/dev/null
log "构建管理后台..."; pnpm --filter @i9/web build >/dev/null
log "构建供应商门户..."; NODE_ENV=production pnpm --filter @i9/portal build >/dev/null
for d in packages/types/dist packages/api/dist packages/web/dist packages/portal/dist; do
  [[ -d "$d" ]] || die "构建产物缺失：$d"
done

# ── ③ 测试（默认跑，--skip-tests 可跳）────────────────────────
if ! $SKIP_TESTS; then
  log "API 单测..."; (cd packages/api && npx jest -c jest.unit.config.js --silent >/dev/null) || die "API 单测未过"
  log "Web 单测..."; (cd packages/web && npx vitest run --silent >/dev/null 2>&1) || die "Web 单测未过"
fi

# ── ④ 推代码（服务器留一份源码，便于回滚/查证）────────────────
# 【必须在 push 之前读】服务器 receive.denyCurrentBranch=updateInstead，push 一到
# 工作树当场就更新到新 commit；等 deploy.sh（--skip-pull）再去读 HEAD 已经是新版本了，
# 于是失败时打印的回滚命令会把你送回出问题的那一版（8-03 实证：上一版==当前版）。
SRV_PREV=$(ssh "$REMOTE" "git -C $APP_DIR rev-parse --short HEAD" 2>/dev/null | tr -d '[:space:]' || true)
[[ "$SRV_PREV" =~ ^[0-9a-f]{6,40}$ ]] || SRV_PREV=""
if [[ -n "$SRV_PREV" ]]; then
  log "服务器当前版本：$SRV_PREV（本次失败时的回滚目标）"
else
  warn "未取到服务器当前版本——deploy.sh 将自行推断回滚目标（上次成功部署记录 / reflog）"
fi

log "推送代码到服务器..."
git push ecs main 2>&1 | tail -1

# ── ⑤ 产物 rsync 上去（服务器不再构建）────────────────────────
#
# 【为什么可以照常 --delete】(2026-08-11 白屏事故的最终解法)
# 事故本身是：chunk 名带内容哈希，发版换一批新名字，用户**已打开的页面**手里是旧 index.html，
# 点进某页时按旧名字请求 → 404 → 白屏。
# 一度想用「保留旧文件不删」绕过去，但那只是让白屏不发生，代价是**用户可以一直跑在旧版本上**
# ——今天修好的问题他明天照样遇到，还会再报一次，等于把问题藏起来。
# 正解在前端：产物里带 version.json，页面轮询比对构建标识，发现发版就提示并在下次切页时
# 整页跳转去取新资源（见 packages/web/src/utils/versionCheck.ts）；万一还是撞上竞态窗口，
# router.onError 再兜底重载一次。所以这里恢复 --delete，不留旧文件、不掩盖问题。
log "上传构建产物..."
for p in types api web portal; do
  rsync -az --delete "packages/$p/dist/" "$REMOTE:$APP_DIR/packages/$p/dist/"
done

# ── ⑥ 服务器只做：备份 → 结构升级 → 换静态 → 重启 → 体检 ──────
log "服务器执行部署（跳过构建）..."
# shellcheck disable=SC2029
ssh "$REMOTE" "cd $APP_DIR && PREV_COMMIT=$SRV_PREV bash infra/scripts/deploy.sh --skip-pull --skip-build ${PASS_THRU[*]:-}"

log "健康检查..."
ssh "$REMOTE" "cd $APP_DIR && bash infra/scripts/health.sh"
log "===== 发版完成 commit=$COMMIT (上一版 ${SRV_PREV:-?}) ====="

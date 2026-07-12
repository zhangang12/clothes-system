#!/usr/bin/env bash
# ============================================================
# 写「智能巡检+自愈」会话循环的心跳，供 /ops/status 读取，
# 让离线监控页真实反映该循环(跑在 Claude 会话里)是否存活。
# 由循环每次醒来时(经 ssh)调用；文件被 API(i9app)读取，故 644 全局可读。
# 用法：bash ops-loop-beat.sh "<下一时段 YYYY-MM-DD HH:MM>" "<上次巡检结果简述>"
# ============================================================
OUT=${OPS_LOOP_FILE:-/data/ops-loop.json}
NEXT="${1:-}"
LASTRUN="${2:-}"
# 转义双引号，避免破坏 JSON
NEXT=${NEXT//\"/\'}
LASTRUN=${LASTRUN//\"/\'}
mkdir -p "$(dirname "$OUT")" 2>/dev/null || true
cat > "$OUT" <<EOF
{"beat":"$(date '+%Y-%m-%d %H:%M:%S')","beatEpoch":$(date +%s),"next":"${NEXT}","lastRun":"${LASTRUN}","session":"active"}
EOF
chmod 644 "$OUT" 2>/dev/null || true
echo "[ops-loop-beat $(date '+%H:%M:%S')] 心跳已写 $OUT （next=${NEXT} last=${LASTRUN}）"

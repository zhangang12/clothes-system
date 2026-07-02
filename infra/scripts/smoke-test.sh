#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 全业务流程 API 联调冒烟测试
# 走通：登录 → 客户 → 工厂 → 样衣 → 报价 → 订单 → 发货 → 合同 → 对账 → 付款 → 结算
# 用法：bash infra/scripts/smoke-test.sh [用户名] [密码]
#   直连 API（默认）：      bash infra/scripts/smoke-test.sh
#   走 nginx 代理验证：     BASE_URL=http://127.0.0.1/api/v1 bash infra/scripts/smoke-test.sh
# 说明：会创建带时间戳后缀的测试数据（不影响真实数据），失败步骤会打印响应片段。
# =============================================================================
set -uo pipefail

BASE_URL=${BASE_URL:-http://127.0.0.1:3000/api/v1}
USERNAME=${1:-admin}
PASSWORD=${2:-Admin@123}
SFX="st$(date +%s)"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;36m'; NC='\033[0m'
P=0; F=0; S=0
step() { echo -e "\n${BLUE}▶ $*${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $*"; P=$((P + 1)); }
bad()  { echo -e "  ${RED}✗${NC} $* ${RESP:0:220}"; F=$((F + 1)); }
skip() { echo -e "  ${YELLOW}⊘${NC} $*（前置缺失，跳过）"; S=$((S + 1)); }

command -v node >/dev/null 2>&1 || { echo "需要 node 来解析 JSON（服务器应已安装）"; exit 1; }

# 从 stdin 的 JSON 里取字段，如 data.id / data.access_token
json_get() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{let o=JSON.parse(d);for(const k of process.argv[1].split("."))o=(o==null?undefined:o[k]);console.log(o==null?"":o)}catch(e){console.log("")}})' "$1"
}

# api METHOD PATH [JSON]  → 设置全局 CODE(http状态) 与 RESP(响应体)
TOKEN=""
api() {
  local method=$1 path=$2 data=${3:-} tmp
  tmp=$(mktemp)
  if [[ -n "$data" ]]; then
    CODE=$(curl -s -o "$tmp" -w '%{http_code}' -X "$method" "$BASE_URL$path" \
      -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d "$data" 2>/dev/null || echo 000)
  else
    CODE=$(curl -s -o "$tmp" -w '%{http_code}' -X "$method" "$BASE_URL$path" \
      -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo 000)
  fi
  RESP=$(cat "$tmp"); rm -f "$tmp"
}
is2xx() { [[ "$CODE" =~ ^2 ]]; }

# 预置所有 ID 变量，避免 set -u 报错
CUSTOMER_ID=""; FACTORY_ID=""; SAMPLE_ID=""; QUOTE_ID=""
ORDER_ID=""; CONTRACT_ID=""; RECONCILE_ID=""; PAYREQ_ID=""; SETTLE_ID=""

echo "=================================================================="
echo " I9 全业务流程 API 联调    目标：$BASE_URL"
echo "=================================================================="

# ── 登录 ──────────────────────────────────────────────────────
step "登录（$USERNAME）"
api POST /auth/login "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}"
TOKEN=$(echo "$RESP" | json_get data.access_token)
if [[ -n "$TOKEN" ]]; then
  ok "登录成功（token ${#TOKEN} 字符）"
else
  bad "登录失败（HTTP $CODE）"
  echo -e "\n${RED}无法拿到 token，终止。请确认 admin/密码 与数据库 sys_user。${NC}"
  exit 1
fi

# ── 1. 客户 ───────────────────────────────────────────────────
step "1. 基础资料 · 客户"
api POST /customers "{\"name\":\"联调客户_$SFX\",\"grade\":\"A\",\"currency\":\"USD\",\"payment_method\":\"T/T\",\"contact_name\":\"张三\",\"contact_email\":\"t@ex.com\"}"
CUSTOMER_ID=$(echo "$RESP" | json_get data.id)
{ is2xx && [[ -n "$CUSTOMER_ID" ]]; } && ok "创建客户 id=$CUSTOMER_ID" || bad "创建客户（HTTP $CODE）"

# ── 2. 工厂 ───────────────────────────────────────────────────
step "2. 基础资料 · 工厂/供应商"
api POST /factories "{\"name\":\"联调工厂_$SFX\",\"type\":\"BOTH\",\"contact_name\":\"李四\",\"contact_phone\":\"13800000000\"}"
FACTORY_ID=$(echo "$RESP" | json_get data.id)
{ is2xx && [[ -n "$FACTORY_ID" ]]; } && ok "创建工厂 id=$FACTORY_ID" || bad "创建工厂（HTTP $CODE）"

# ── 3. 样衣 ───────────────────────────────────────────────────
step "3. 样衣管理（创建 → 打版提交 → 确认）"
if [[ -n "$CUSTOMER_ID" ]]; then
  api POST /samples "{\"customer_id\":$CUSTOMER_ID,\"style_name\":\"联调款式_$SFX\",\"season\":\"2026春\",\"category\":\"针织\"}"
  SAMPLE_ID=$(echo "$RESP" | json_get data.id)
  { is2xx && [[ -n "$SAMPLE_ID" ]]; } && ok "创建样衣 id=$SAMPLE_ID" || bad "创建样衣（HTTP $CODE）"
  if [[ -n "$SAMPLE_ID" ]]; then
    api PATCH "/samples/$SAMPLE_ID/submit" '{"remark":"首版完成"}'
    is2xx && ok "样衣打版提交" || bad "样衣打版提交（HTTP $CODE）"
    api PATCH "/samples/$SAMPLE_ID/confirm" ''
    is2xx && ok "样衣确认" || bad "样衣确认（HTTP $CODE）"
  fi
else skip "样衣"; fi

# ── 4. 报价 ───────────────────────────────────────────────────
step "4. 报价（创建含费用项 → 发送 → 客户确认）"
if [[ -n "$CUSTOMER_ID" ]]; then
  api POST /quotes "{\"customer_id\":$CUSTOMER_ID,\"sample_id\":${SAMPLE_ID:-null},\"style_name\":\"联调款式_$SFX\",\"currency\":\"USD\",\"global_loss_rate\":5,\"gross_margin\":30,\"total_qty\":1000,\"items\":[{\"item_name\":\"面料\",\"unit\":\"米\",\"usage_qty\":1.5,\"unit_price\":8.5,\"loss_rate\":5},{\"item_name\":\"加工费\",\"unit\":\"件\",\"unit_price\":3,\"loss_rate\":0}]}"
  QUOTE_ID=$(echo "$RESP" | json_get data.id)
  { is2xx && [[ -n "$QUOTE_ID" ]]; } && ok "创建报价 id=$QUOTE_ID" || bad "创建报价（HTTP $CODE）"
  if [[ -n "$QUOTE_ID" ]]; then
    api PATCH "/quotes/$QUOTE_ID/send" ''
    is2xx && ok "报价发送客户" || bad "报价发送（HTTP $CODE）"
    api PATCH "/quotes/$QUOTE_ID/confirm" ''
    is2xx && ok "报价客户确认" || bad "报价确认（HTTP $CODE）"
  fi
else skip "报价"; fi

# ── 5. 订单 ───────────────────────────────────────────────────
step "5. 订单（创建 → 推进状态 → 发货）"
if [[ -n "$CUSTOMER_ID" ]]; then
  api POST /orders "{\"customer_id\":$CUSTOMER_ID,\"quote_id\":${QUOTE_ID:-null},\"customer_po\":\"PO-$SFX\",\"style_name\":\"联调款式_$SFX\",\"delivery_date\":\"2026-09-30\",\"qty_total\":1000,\"currency\":\"USD\",\"unit_price\":12.5,\"materials\":[{\"item_name\":\"面料\",\"unit\":\"米\",\"net_usage\":1.5,\"loss_rate\":5,\"unit_price\":8.5}]}"
  ORDER_ID=$(echo "$RESP" | json_get data.id)
  { is2xx && [[ -n "$ORDER_ID" ]]; } && ok "创建订单 id=$ORDER_ID" || bad "创建订单（HTTP $CODE）"
  if [[ -n "$ORDER_ID" ]]; then
    api PATCH "/orders/$ORDER_ID/advance" ''
    is2xx && ok "订单推进(1)" || bad "订单推进1（HTTP $CODE）"
    api PATCH "/orders/$ORDER_ID/advance" ''
    is2xx && ok "订单推进(2)" || bad "订单推进2（HTTP $CODE）"
    api POST "/orders/$ORDER_ID/shipments" "{\"shipment_date\":\"2026-09-20\",\"qty\":500,\"cartons\":20,\"tracking_no\":\"SF$SFX\"}"
    is2xx && ok "订单发货登记" || bad "订单发货（HTTP $CODE）"
  fi
else skip "订单"; fi

# ── 6. 合同 ───────────────────────────────────────────────────
step "6. 合同（创建 → 推送供应商门户）"
if [[ -n "$ORDER_ID" && -n "$FACTORY_ID" ]]; then
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":$FACTORY_ID,\"order_id\":$ORDER_ID,\"currency\":\"CNY\",\"deposit_ratio\":30,\"final_ratio\":70,\"last_ship_date\":\"2026-09-15\",\"account_period_days\":30,\"materials\":[{\"item_name\":\"面料\",\"spec\":\"32支\",\"unit\":\"米\",\"unit_price\":8.5,\"qty\":1500}]}"
  CONTRACT_ID=$(echo "$RESP" | json_get data.id)
  { is2xx && [[ -n "$CONTRACT_ID" ]]; } && ok "创建合同 id=$CONTRACT_ID" || bad "创建合同（HTTP $CODE）"
  if [[ -n "$CONTRACT_ID" ]]; then
    api PATCH "/contracts/$CONTRACT_ID/push" ''
    is2xx && ok "合同推送门户" || bad "合同推送（HTTP $CODE）"
  fi
else skip "合同"; fi

# ── 7. 对账 ───────────────────────────────────────────────────
step "7. 对账（创建 → 确认）"
if [[ -n "$FACTORY_ID" ]]; then
  api POST /reconciliations "{\"type\":\"CONTRACT\",\"contract_id\":${CONTRACT_ID:-null},\"factory_id\":$FACTORY_ID,\"tax_rate\":13,\"invoice_no\":\"FP-$SFX\",\"invoice_amount\":12750,\"description\":\"联调对账\"}"
  RECONCILE_ID=$(echo "$RESP" | json_get data.id)
  { is2xx && [[ -n "$RECONCILE_ID" ]]; } && ok "创建对账 id=$RECONCILE_ID" || bad "创建对账（HTTP $CODE）"
  if [[ -n "$RECONCILE_ID" ]]; then
    api PATCH "/reconciliations/$RECONCILE_ID/confirm" ''
    is2xx && ok "对账确认" || bad "对账确认（HTTP $CODE）"
  fi
else skip "对账"; fi

# ── 8. 付款 ───────────────────────────────────────────────────
step "8. 付款（预付款 + 付款申请：提交 → 审批 → 支付）"
if [[ -n "$FACTORY_ID" ]]; then
  api POST /payments/prepayments "{\"factory_id\":$FACTORY_ID,\"contract_id\":${CONTRACT_ID:-null},\"amount\":3825,\"pay_date\":\"2026-08-01\",\"remark\":\"30%定金\"}"
  is2xx && ok "创建预付款" || bad "创建预付款（HTTP $CODE）"

  api POST /payments/requests "{\"type\":\"CONTRACT\",\"reconcile_id\":${RECONCILE_ID:-null},\"factory_id\":$FACTORY_ID,\"amount\":8925,\"prepay_offset\":3825,\"description\":\"尾款\"}"
  PAYREQ_ID=$(echo "$RESP" | json_get data.id)
  { is2xx && [[ -n "$PAYREQ_ID" ]]; } && ok "创建付款申请 id=$PAYREQ_ID" || bad "创建付款申请（HTTP $CODE）"
  if [[ -n "$PAYREQ_ID" ]]; then
    api PATCH "/payments/requests/$PAYREQ_ID/submit" ''
    is2xx && ok "付款申请提交" || bad "付款提交（HTTP $CODE）"
    api PATCH "/payments/requests/$PAYREQ_ID/approve" ''
    is2xx && ok "付款申请审批通过" || bad "付款审批（HTTP $CODE）"
    api PATCH "/payments/requests/$PAYREQ_ID/paid" '{"pay_date":"2026-10-10"}'
    is2xx && ok "付款标记已付" || bad "付款标记（HTTP $CODE）"
  fi
else skip "付款"; fi

# ── 9. 结算 ───────────────────────────────────────────────────
step "9. 结算（创建 → 加成本 → 确认）"
if [[ -n "$ORDER_ID" ]]; then
  api POST /settlements "{\"order_id\":$ORDER_ID,\"revenue\":12500,\"description\":\"联调结算\",\"costs\":[{\"cost_name\":\"面料采购\",\"amount\":8925,\"has_invoice\":1}]}"
  SETTLE_ID=$(echo "$RESP" | json_get data.id)
  { is2xx && [[ -n "$SETTLE_ID" ]]; } && ok "创建结算 id=$SETTLE_ID" || bad "创建结算（HTTP $CODE）"
  if [[ -n "$SETTLE_ID" ]]; then
    api POST "/settlements/$SETTLE_ID/costs" '{"cost_name":"物流费","amount":300,"has_invoice":0}'
    is2xx && ok "结算追加成本" || bad "结算加成本（HTTP $CODE）"
    api PATCH "/settlements/$SETTLE_ID/confirm" ''
    is2xx && ok "结算确认" || bad "结算确认（HTTP $CODE）"
  fi
else skip "结算"; fi

# ── 汇总 ──────────────────────────────────────────────────────
echo ""
echo "=================================================================="
echo -e " 结果：${GREEN}${P} 通过${NC} / ${RED}${F} 失败${NC} / ${YELLOW}${S} 跳过${NC}"
echo "=================================================================="
if [[ $F -eq 0 ]]; then
  echo -e "${GREEN}全流程贯通 ✓ 前端→API→数据库链路正常${NC}"
else
  echo -e "${YELLOW}存在失败步骤，上方每条 ✗ 后已附响应片段，便于定位业务逻辑/状态机问题。${NC}"
fi
exit "$F"

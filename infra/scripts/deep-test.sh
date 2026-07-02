#!/usr/bin/env bash
# =============================================================================
# I9 服装制造管理系统 — 深度测试（业务计算 + 输入校验 + 权限 + 状态机 + 门户）
# 用法：bash infra/scripts/deep-test.sh
#   直连 API（默认）BASE_URL=http://127.0.0.1:3000/api/v1
#   走 nginx：       BASE_URL=http://127.0.0.1/api/v1 bash infra/scripts/deep-test.sh
# 前置：数据库已用最新 init.sql 初始化（含 admin/business_user/finance_user/pm_user
#       及门户账号 supplier1，密码均 Admin@123）。会创建带时间戳的测试数据。
# =============================================================================
set -uo pipefail

BASE_URL=${BASE_URL:-http://127.0.0.1:3000/api/v1}
PW=${PW:-Admin@123}
SFX="dt$(date +%s)"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
P=0; F=0
group() { echo -e "\n${CYAN}══ $* ══${NC}"; }
ok()  { echo -e "  ${GREEN}✓${NC} $*"; P=$((P + 1)); }
bad() { echo -e "  ${RED}✗${NC} $*"; F=$((F + 1)); }

command -v node >/dev/null 2>&1 || { echo "需要 node"; exit 1; }

# 从 $RESP(JSON) 取字段，如 jval data.id
jval() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{let o=JSON.parse(d);for(const k of process.argv[1].split("."))o=(o==null?undefined:o[k]);console.log(o==null?"":o)}catch(e){console.log("")}})' "$1"; }

# api METHOD PATH [JSON_BODY] [TOKEN]  → 设置全局 CODE、RESP（TOKEN 默认 admin）
CODE=""; RESP=""
api() {
  local method=$1 path=$2 data=${3:-} token=${4:-$TOKEN_ADMIN} tmp
  tmp=$(mktemp)
  if [[ -n "$data" ]]; then
    CODE=$(curl -s -o "$tmp" -w '%{http_code}' -X "$method" "$BASE_URL$path" \
      -H 'Content-Type: application/json' -H "Authorization: Bearer $token" -d "$data" 2>/dev/null || echo 000)
  else
    CODE=$(curl -s -o "$tmp" -w '%{http_code}' -X "$method" "$BASE_URL$path" \
      -H "Authorization: Bearer $token" 2>/dev/null || echo 000)
  fi
  RESP=$(cat "$tmp"); rm -f "$tmp"
}

# ── 断言（均计入 P/F）─────────────────────────────────────────
# expect_code 期望码 "描述"
expect_code() { if [[ "$CODE" == "$1" ]]; then ok "$2 [$CODE]"; else bad "$2 (期望 $1 实得 $CODE) ${RESP:0:160}"; fi; }
# expect_ok "描述"   —— 2xx
expect_ok()   { if [[ "$CODE" =~ ^2 ]]; then ok "$1 [$CODE]"; else bad "$1 (期望 2xx 实得 $CODE) ${RESP:0:160}"; fi; }
# expect_deny "描述" —— 401/403（越权/未授权）
expect_deny() { if [[ "$CODE" =~ ^(401|403)$ ]]; then ok "$1 [$CODE]"; else bad "$1 (期望 401/403 实得 $CODE) ${RESP:0:120}"; fi; }
# expect_num JSONPATH 期望值 "描述"  —— 数值≈（容差 0.011）
expect_num() {
  local got; got=$(echo "$RESP" | jval "$1")
  local r; r=$(node -e "const a=parseFloat(process.argv[1]),b=parseFloat(process.argv[2]);console.log(isNaN(a)?'NaN':(Math.abs(a-b)<=0.011?'OK':'BAD'))" "$got" "$2" 2>/dev/null || echo NaN)
  if [[ "$r" == "OK" ]]; then ok "$3 ($1=$got)"; else bad "$3 (期望 $1≈$2 实得 $got)"; fi
}
# expect_eq JSONPATH 期望值 "描述"  —— 字符串相等
expect_eq() {
  local got; got=$(echo "$RESP" | jval "$1")
  if [[ "$got" == "$2" ]]; then ok "$3 ($1=$got)"; else bad "$3 (期望 $1=$2 实得 $got)"; fi
}
# expect_match JSONPATH 正则 "描述"
expect_match() {
  local got; got=$(echo "$RESP" | jval "$1")
  if [[ "$got" =~ $2 ]]; then ok "$3 ($1=$got)"; else bad "$3 (期望 $1 匹配 /$2/ 实得 $got)"; fi
}

# ── 登录各角色 ────────────────────────────────────────────────
login_user() { api POST /auth/login "{\"username\":\"$1\",\"password\":\"$PW\"}"; echo "$RESP" | jval data.access_token; }
TOKEN_ADMIN=""   # 先占位，供 api() 默认参数引用
TOKEN_ADMIN=$(login_user admin)
[[ -n "$TOKEN_ADMIN" ]] || { echo "admin 登录失败，终止（确认已 reset-db 到最新 init.sql）"; exit 1; }
TOKEN_BUSINESS=$(login_user business_user)
TOKEN_FINANCE=$(login_user finance_user)
TOKEN_PM=$(login_user pm_user)
api POST /auth/portal/login "{\"username\":\"supplier1\",\"password\":\"$PW\"}"
TOKEN_SUP=$(echo "$RESP" | jval data.access_token)

# ── fixtures（用 admin 建前置数据，返回新 id 到 stdout）───────
fx_customer() { api POST /customers "{\"name\":\"C_${SFX}_${RANDOM}\",\"grade\":\"A\",\"currency\":\"USD\"}"; echo "$RESP" | jval data.id; }
fx_factory()  { api POST /factories "{\"name\":\"F_${SFX}_${RANDOM}\",\"type\":\"BOTH\"}"; echo "$RESP" | jval data.id; }
fx_sample()   { api POST /samples "{\"customer_id\":$1,\"style_name\":\"S_$SFX\"}"; echo "$RESP" | jval data.id; }
fx_quote()    { api POST /quotes "{\"customer_id\":$1,\"currency\":\"USD\",\"global_loss_rate\":5,\"gross_margin\":30,\"total_qty\":1000,\"items\":[{\"item_name\":\"面料\",\"unit\":\"米\",\"usage_qty\":1.5,\"unit_price\":8,\"loss_rate\":5},{\"item_name\":\"加工\",\"unit_price\":3}]}"; echo "$RESP" | jval data.id; }
fx_order()    { api POST /orders "{\"customer_id\":$1,\"qty_total\":1000,\"currency\":\"USD\",\"unit_price\":12,\"materials\":[{\"item_name\":\"面料\",\"net_usage\":1.5,\"loss_rate\":5,\"unit_price\":8}]}"; echo "$RESP" | jval data.id; }
# 订单推进到 PRODUCING（可发货）：DRAFT→CONFIRMED→PRODUCING
fx_order_producing() { local oid; oid=$(fx_order "$1"); api PATCH "/orders/$oid/advance" ''; api PATCH "/orders/$oid/advance" ''; echo "$oid"; }
fx_contract() { api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":$1,\"order_id\":$2,\"currency\":\"CNY\",\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":1500}]}"; echo "$RESP" | jval data.id; }

echo "=================================================================="
echo " I9 深度测试   目标：$BASE_URL"
echo " token: admin=${TOKEN_ADMIN:+✓} business=${TOKEN_BUSINESS:+✓} finance=${TOKEN_FINANCE:+✓} pm=${TOKEN_PM:+✓} supplier=${TOKEN_SUP:+✓}"
echo "=================================================================="

# ── 各模块深度测试函数 ──────────────────────────────────────
test_customer() {
  local nm="客户测试_${SFX:-x}"
  local em="buyer_${SFX:-x}@i9.com"
  local cid

  # ---- DTO 校验：异常输入应 400 ----
  # name 必填(@IsString，无@IsOptional)，缺失应 400
  api POST /customers "{\"grade\":\"B\",\"currency\":\"USD\"}"
  expect_code 400 "缺少 name(必填@IsString)应400"

  # grade @IsEnum(CustomerGrade) 仅 A/B/C，非法值 Z 应 400
  api POST /customers "{\"name\":\"$nm\",\"grade\":\"Z\",\"currency\":\"USD\"}"
  expect_code 400 "非法 grade=Z(@IsEnum 仅A/B/C)应400"

  # contact_email @IsEmail，非法邮箱应 400
  api POST /customers "{\"name\":\"$nm\",\"grade\":\"B\",\"currency\":\"USD\",\"contact_email\":\"not-an-email\"}"
  expect_code 400 "非法 contact_email(@IsEmail)应400"

  # ---- 权限：POST @Roles(ADMIN,BUSINESS) ----
  # PATTERNMAKER 不在允许角色内，应被拒(403)
  api POST /customers "{\"name\":\"$nm\",\"grade\":\"B\",\"currency\":\"USD\",\"contact_email\":\"$em\"}" "$TOKEN_PM"
  expect_deny "PATTERNMAKER 创建客户应被拒(不在@Roles)"

  # BUSINESS 属于允许角色，合法创建应 2xx
  api POST /customers "{\"name\":\"$nm\",\"grade\":\"B\",\"currency\":\"USD\",\"contact_email\":\"$em\"}" "$TOKEN_BUSINESS"
  expect_ok "BUSINESS 合法创建客户应2xx"
  cid=$(echo "$RESP" | jval data.id)

  # ---- 详情字段与输入一致 ----
  api GET "/customers/${cid:-0}"
  expect_eq data.name "$nm" "详情 name 与输入一致"
  expect_eq data.grade "B" "详情 grade 与输入一致"
  expect_eq data.currency "USD" "详情 currency 与输入一致"

  # ---- 更新后再查生效（PUT @Roles ADMIN,BUSINESS）----
  api PUT "/customers/${cid:-0}" "{\"grade\":\"C\"}" "$TOKEN_BUSINESS"
  expect_ok "BUSINESS 更新客户应2xx"
  api GET "/customers/${cid:-0}"
  expect_eq data.grade "C" "更新后再查 grade=C 生效"

  # ---- 列表分页(无@Roles，任意登录可访问) ----
  api GET "/customers?page=1&size=5"
  expect_ok "客户列表分页 page=1&size=5 应2xx"

  # ---- 状态机 toggleStatus：PATCH :id/status @Roles(仅ADMIN) ----
  # BUSINESS 不在允许角色，切换状态应被拒
  api PATCH "/customers/${cid:-0}/status" '' "$TOKEN_BUSINESS"
  expect_deny "BUSINESS 切换客户状态应被拒(仅ADMIN)"

  # ADMIN 切换：默认 status=1，翻转公式 (status===1?0:1) → 0
  api PATCH "/customers/${cid:-0}/status" ''
  expect_ok "ADMIN 切换客户状态应2xx"
  expect_num data.status 0 "状态机 status 由默认1翻转为0"
}

test_factory() {
  local fid=""

  # ---- 异常：DTO class-validator 校验 ----
  # create-factory.dto: name 为 @IsString() 且无 @IsOptional，缺失即 400
  api POST /factories '{"type":"MATERIAL"}'
  expect_code 400 "创建工厂缺 name 应 400"

  # type 为 @IsEnum(FactoryType)，非 MATERIAL/PROCESS/BOTH 即 400（name 合法以隔离 type）
  api POST /factories '{"name":"BadType-'"$SFX"'","type":"NOT_A_TYPE"}'
  expect_code 400 "创建工厂非法 type 应 400"

  # ---- 权限：controller @Roles(ADMIN, BUSINESS) ----
  # 打版师(PATTERNMAKER)不在允许角色内，应 403
  api POST /factories '{"name":"Deny-'"$SFX"'","type":"PROCESS"}' "$TOKEN_PM"
  expect_deny "打版师创建工厂应被拒绝"

  # 业务员(BUSINESS)在允许角色内，应成功
  api POST /factories '{"name":"Biz-'"$SFX"'","type":"BOTH"}' "$TOKEN_BUSINESS"
  expect_ok "业务员创建工厂应成功"

  # ---- 正常路径：合法创建（admin 默认 token） ----
  api POST /factories '{"name":"Fac-'"$SFX"'","type":"MATERIAL","short_name":"FS-'"$SFX"'"}'
  expect_ok "合法创建工厂应成功"
  fid=$(echo "$RESP" | jval data.id)

  # ---- 建后 GET 详情：编号规则 NUM_PREFIX.FACTORY='CN' → factory_no ^CN ----
  api GET /factories/${fid:-}
  expect_ok "获取工厂详情应成功"
  expect_match data.factory_no '^CN' "工厂编号应以 CN 开头"
  expect_eq data.type MATERIAL "详情类型应为 MATERIAL"

  # ---- 更新：PUT @Roles(ADMIN,BUSINESS)，admin 更新并校验生效 ----
  api PUT /factories/${fid:-} '{"name":"FacUpd-'"$SFX"'","short_name":"US-'"$SFX"'"}'
  expect_ok "管理员更新工厂应成功"
  expect_eq data.name "FacUpd-$SFX" "PUT 更新后名称应生效"

  # ---- 异常：不存在的工厂详情 → NotFoundException 404 ----
  api GET /factories/99999999
  expect_code 404 "查询不存在工厂应 404"

  # ---- 列表分页：size=5 应被回显（interceptor 将 total/page/size 展开到顶层） ----
  api GET '/factories?page=1&size=5'
  expect_ok "工厂列表分页应成功"
  expect_num size 5 "分页 size 应回显为 5"
}

test_auth() {
  api POST /auth/login '{"username":"admin","password":"WrongPass999"}'
  expect_code 401 "错误密码登录应401"
  api POST /auth/login '{"username":"nobody_xyz","password":"Admin@123"}'
  expect_code 401 "不存在用户登录应401"
  api POST /auth/login '{"username":"admin"}'
  expect_code 400 "登录缺password应400"
  api GET /customers '' ''
  expect_deny "无token访问受保护接口应拒绝"
  api GET /customers '' 'invalid.forged.token'
  expect_deny "伪造token应拒绝"
  api POST /auth/login '{"username":"admin","password":"Admin@123"}'
  expect_ok "admin正确登录"
  local t; t=$(echo "$RESP" | jval data.access_token)
  [[ -n "$t" ]] && ok "登录返回access_token" || bad "登录未返回access_token"
}

test_sample() {
  local cid sid
  cid=$(fx_customer); sid=$(fx_sample "$cid")
  api GET "/samples/${sid:-0}"
  expect_eq data.status PENDING "新建样衣状态PENDING"
  api PATCH "/samples/${sid:-0}/submit" '{"remark":"x"}'
  expect_code 400 "未派工直接提交应400"
  api PATCH "/samples/${sid:-0}/assign" '{"patternmaker_id":1}'
  expect_ok "指派版师"
  api GET "/samples/${sid:-0}"; expect_eq data.status PATTERN "派工后PATTERN"
  api PATCH "/samples/${sid:-0}/submit" '{"remark":"完成"}'
  expect_ok "打版提交"
  api GET "/samples/${sid:-0}"; expect_eq data.status DONE "提交后DONE"
  api PATCH "/samples/${sid:-0}/confirm" ''
  expect_ok "样衣确认"
  api GET "/samples/${sid:-0}"; expect_eq data.status CONFIRMED "确认后CONFIRMED"
  api PATCH "/samples/${sid:-0}/confirm" ''
  expect_code 400 "已确认再确认应400"
  api POST /samples '{"customer_id":999999,"style_name":"x"}'
  if [[ "$CODE" =~ ^(400|404)$ ]]; then ok "非法customer_id建样衣应400/404 [$CODE]"; else bad "非法customer_id应400/404 实得$CODE"; fi
}

test_quote() {
  local cid qid q2
  cid=$(fx_customer)
  api POST /quotes '{"currency":"USD","items":[{"item_name":"x","unit_price":5}]}'
  expect_code 400 "报价缺customer_id应400"
  api POST /quotes "{\"customer_id\":${cid:-0},\"items\":[{\"item_name\":\"x\",\"unit_price\":-1}]}"
  expect_code 400 "报价负单价应400"
  api POST /quotes "{\"customer_id\":${cid:-0},\"items\":[{\"item_name\":\"x\",\"unit_price\":5,\"loss_rate\":150}]}"
  expect_code 400 "报价损耗率>99.99应400"
  qid=$(fx_quote "$cid")
  [[ -n "$qid" ]] && ok "创建报价 id=$qid" || bad "创建报价失败 ${RESP:0:120}"
  api GET "/quotes/${qid:-0}"
  expect_num data.total_amount 13.296 "报价合计=Σ含损小计(8÷0.95×1.5÷0.95)"
  q2=$(fx_quote "$cid")
  api PATCH "/quotes/${q2:-0}/confirm" ''
  expect_code 400 "草稿未发送直接确认应400"
  api PATCH "/quotes/${q2:-0}/send" ''; expect_ok "报价发送"
  api PATCH "/quotes/${q2:-0}/confirm" ''; expect_ok "报价确认(SENT→CONFIRMED)"
}

test_order() {
  local cid oid
  cid=$(fx_customer)
  api POST /orders "{\"customer_id\":${cid:-0},\"unit_price\":10}"
  expect_code 400 "订单缺qty_total应400"
  oid=$(fx_order "$cid")
  [[ -n "$oid" ]] && ok "创建订单 id=$oid" || bad "创建订单失败 ${RESP:0:120}"
  api GET "/orders/${oid:-0}"
  expect_eq data.status DRAFT "新建订单DRAFT"
  expect_num data.total_amount 12000 "订单总额=单价12×数量1000"
  expect_num data.materials.0.loss_usage 1.5789 "含损用量=净用量÷(1-损耗率)"
  expect_num data.materials.0.total_purchase 1578.9 "总采购量=含损用量×数量"
  expect_num data.materials.0.budget 12631.2 "预算=总采购量×单价"
  api POST "/orders/${oid:-0}/shipments" '{"shipment_date":"2026-09-01","qty":100}'
  expect_code 400 "DRAFT订单发货应400"
  api PATCH "/orders/${oid:-0}/advance" ''; expect_ok "订单推进1(DRAFT→CONFIRMED)"
  api PATCH "/orders/${oid:-0}/advance" ''; expect_ok "订单推进2(CONFIRMED→PRODUCING)"
  api GET "/orders/${oid:-0}"; expect_eq data.status PRODUCING "推进两次后PRODUCING"
  api POST "/orders/${oid:-0}/shipments" '{"shipment_date":"2026-09-01","qty":500}'
  expect_ok "PRODUCING订单可发货"
}

test_contract() {
  local cid fid oid ctid
  cid=$(fx_customer); fid=$(fx_factory); oid=$(fx_order_producing "$cid")
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0}}"
  expect_code 400 "合同缺materials应400"
  api POST /contracts "{\"type\":\"BADTYPE\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"materials\":[{\"item_name\":\"x\",\"unit_price\":1,\"qty\":1}]}"
  expect_code 400 "合同非法type应400"
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"deposit_ratio\":150,\"materials\":[{\"item_name\":\"x\",\"unit_price\":1,\"qty\":1}]}"
  expect_code 400 "合同定金比例>100应400"
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"currency\":\"CNY\",\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":1500}]}"
  ctid=$(echo "$RESP" | jval data.id)
  [[ -n "$ctid" ]] && ok "创建合同 id=$ctid" || bad "创建合同失败 ${RESP:0:120}"
  api PATCH "/contracts/${ctid:-0}/status" '{"portal_status":"PUSHED"}' "$TOKEN_BUSINESS"
  expect_deny "BUSINESS改合同状态应拒绝(仅ADMIN)"
  api PATCH "/contracts/${ctid:-0}/push" ''; expect_ok "合同推送门户"
  api GET "/contracts/${ctid:-0}"; expect_eq data.portal_status PUSHED "推送后portal_status=PUSHED"
  api PATCH "/contracts/${ctid:-0}/push" ''
  expect_code 400 "重复推送应400(非DRAFT)"
}

test_reconciliation() {
  local fid rid
  fid=$(fx_factory)
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0}}" "$TOKEN_BUSINESS"
  expect_deny "BUSINESS建对账应拒绝(仅FINANCE/ADMIN)"
  api POST /reconciliations '{"type":"NO_CONTRACT"}' "$TOKEN_FINANCE"
  expect_code 400 "对账缺factory_id应400"
  api POST /reconciliations "{\"type\":\"BADTYPE\",\"factory_id\":${fid:-0}}" "$TOKEN_FINANCE"
  expect_code 400 "对账非法type应400"
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"description\":\"测试对账\"}" "$TOKEN_FINANCE"
  rid=$(echo "$RESP" | jval data.id)
  [[ -n "$rid" ]] && ok "FINANCE创建对账 id=$rid" || bad "创建对账失败 ${RESP:0:120}"
  api PATCH "/reconciliations/${rid:-0}/confirm" '' "$TOKEN_FINANCE"
  expect_ok "对账确认(DRAFT→)"
  api PATCH "/reconciliations/${rid:-0}/confirm" '' "$TOKEN_FINANCE"
  expect_code 400 "重复确认对账应400"
}

test_payment() {
  local fid pid pid2
  fid=$(fx_factory)
  api POST /payments/requests "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"amount\":-5}" "$TOKEN_FINANCE"
  expect_code 400 "付款申请负金额应400"
  api POST /payments/requests "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"amount\":5000}" "$TOKEN_FINANCE"
  pid=$(echo "$RESP" | jval data.id)
  [[ -n "$pid" ]] && ok "创建付款申请 id=$pid" || bad "创建付款申请失败 ${RESP:0:120}"
  api PATCH "/payments/requests/${pid:-0}/approve" '' "$TOKEN_ADMIN"
  expect_code 400 "未提交就审批应400"
  api PATCH "/payments/requests/${pid:-0}/submit" '' "$TOKEN_FINANCE"
  expect_ok "付款申请提交(DRAFT→PENDING)"
  api PATCH "/payments/requests/${pid:-0}/approve" '' "$TOKEN_FINANCE"
  expect_deny "FINANCE审批应拒绝(仅ADMIN)"
  api PATCH "/payments/requests/${pid:-0}/approve" '' "$TOKEN_ADMIN"
  expect_ok "ADMIN审批通过(PENDING→APPROVED)"
  api PATCH "/payments/requests/${pid:-0}/approve" '' "$TOKEN_ADMIN"
  expect_code 400 "重复审批应400"
  api PATCH "/payments/requests/${pid:-0}/paid" '{"slip_url":"https://ex.com/s.pdf"}' "$TOKEN_FINANCE"
  expect_ok "标记已付(APPROVED→PAID)"
  api POST /payments/requests "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"amount\":800}" "$TOKEN_FINANCE"
  pid2=$(echo "$RESP" | jval data.id)
  api PATCH "/payments/requests/${pid2:-0}/submit" '' "$TOKEN_FINANCE"
  api PATCH "/payments/requests/${pid2:-0}/reject" '{"reason":"金额有误"}' "$TOKEN_ADMIN"
  expect_ok "驳回付款申请(PENDING→REJECTED)"
  api PATCH "/payments/requests/${pid2:-0}/paid" '{"slip_url":"https://ex.com/s2.pdf"}' "$TOKEN_FINANCE"
  expect_code 400 "驳回后标记付款应400"
}

test_settlement() {
  local cid oid sid
  cid=$(fx_customer); oid=$(fx_order_producing "$cid")
  api POST /settlements "{\"order_id\":${oid:-0},\"revenue\":10000}" "$TOKEN_PM"
  expect_deny "PATTERNMAKER建结算应拒绝"
  api POST /settlements '{"revenue":10000}' "$TOKEN_FINANCE"
  expect_code 400 "结算缺order_id应400"
  api POST /settlements "{\"order_id\":${oid:-0},\"revenue\":10000,\"costs\":[{\"cost_name\":\"面料\",\"amount\":6000,\"has_invoice\":1},{\"cost_name\":\"加工\",\"amount\":1500}]}" "$TOKEN_FINANCE"
  sid=$(echo "$RESP" | jval data.id)
  [[ -n "$sid" ]] && ok "FINANCE创建结算 id=$sid" || bad "创建结算失败 ${RESP:0:120}"
  expect_num data.total_cost 7500 "总成本=6000+1500"
  expect_num data.net_profit 2500 "净利=收入10000-成本7500"
  expect_match data.settlement_no '[0-9]{8}' "结算单号含日期"
  api POST "/settlements/${sid:-0}/costs" '{"cost_name":"物流","amount":500,"has_invoice":0}' "$TOKEN_FINANCE"
  expect_ok "追加成本500"
  api GET "/settlements/${sid:-0}"
  expect_num data.total_cost 8000 "追加后总成本=8000"
  expect_num data.net_profit 2000 "追加后净利=2000"
  api PATCH "/settlements/${sid:-0}/confirm" '' "$TOKEN_FINANCE"
  expect_ok "结算确认"
  api GET "/settlements/${sid:-0}"; expect_eq data.status CONFIRMED "确认后CONFIRMED"
  api POST "/settlements/${sid:-0}/costs" '{"cost_name":"x","amount":1}' "$TOKEN_FINANCE"
  expect_code 400 "已确认再加成本应400"
}

test_portal() {
  local cid oid ctid
  cid=$(fx_customer); oid=$(fx_order_producing "$cid")
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":1,\"order_id\":${oid:-0},\"currency\":\"CNY\",\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":1500}]}"
  ctid=$(echo "$RESP" | jval data.id)
  [[ -n "$ctid" ]] && ok "建门户合同 id=$ctid(工厂1)" || bad "建门户合同失败 ${RESP:0:120}"
  api PATCH "/contracts/${ctid:-0}/push" ''; expect_ok "合同推送门户"
  api GET /portal/contracts '' ''
  expect_deny "无token访问门户应拒绝"
  api GET /portal/contracts '' "$TOKEN_SUP"
  expect_ok "供应商查看合同列表"
  api GET "/portal/contracts/${ctid:-0}" '' "$TOKEN_SUP"
  expect_ok "供应商查看合同详情"
  api PATCH "/portal/contracts/${ctid:-0}/stamp" '' "$TOKEN_SUP"
  expect_ok "供应商盖章(PUSHED→STAMPED)"
  api PATCH "/portal/contracts/${ctid:-0}/ship" '{"remark":"已发货"}' "$TOKEN_SUP"
  expect_ok "供应商确认发货(STAMPED→SHIPPING)"
  api PATCH "/portal/contracts/${ctid:-0}/invoice" '{"invoice_no":"INV-P1","invoice_amount":12000}' "$TOKEN_SUP"
  expect_ok "供应商开票"
  api PATCH "/portal/contracts/${ctid:-0}/stamp" '' "$TOKEN_SUP"
  expect_code 400 "重复盖章应400(非PUSHED)"
}

# ── 执行所有模块深度测试 ──────────────────────────────────────
group "1. 鉴权与权限基线";        test_auth
group "2. 客户 · 校验/权限/CRUD";  test_customer
group "3. 工厂 · 校验/权限/编号";  test_factory
group "4. 样衣 · 状态机";          test_sample
group "5. 报价 · 业务计算";        test_quote
group "6. 订单 · 状态机/用料计算";  test_order
group "7. 合同 · 校验/权限/推送";  test_contract
group "8. 对账 · 校验/权限/计算";  test_reconciliation
group "9. 付款 · 审批流状态机";    test_payment
group "10. 结算 · 业务计算";       test_settlement
group "11. 供应商门户 · 端到端";   test_portal

echo ""
echo "=================================================================="
echo -e " 深度测试结果：${GREEN}${P} 通过${NC} / ${RED}${F} 失败${NC}"
echo "=================================================================="
if [[ $F -eq 0 ]]; then
  echo -e "${GREEN}全部通过 ✓${NC}"
else
  echo -e "${YELLOW}存在失败，见上方每条 ✗（含期望值/实得值/响应片段），逐条定位。${NC}"
fi
exit "$F"

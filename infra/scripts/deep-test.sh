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
  local method=$1 path=$2 data=${3:-} token=${4-$TOKEN_ADMIN} tmp
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
  local r; r=$(GOT="$got" EXP="$2" node -e "const a=parseFloat(process.env.GOT),b=parseFloat(process.env.EXP);console.log(isNaN(a)?'NaN':(Math.abs(a-b)<=0.011?'OK':'BAD'))" 2>/dev/null || echo NaN)
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
fx_customer() { api POST /customers "{\"name\":\"C_${SFX}_${RANDOM}\",\"type\":\"MIDDLEMAN\",\"grade\":\"A\",\"currency\":\"USD\",\"contacts\":[{\"name\":\"张三\",\"mobile\":\"13900000000\"}]}"; echo "$RESP" | jval data.id; }
fx_factory()  { api POST /factories "{\"name\":\"F_${SFX}_${RANDOM}\",\"type\":\"FABRIC\",\"portalAccount\":\"sup_${SFX}_${RANDOM}\",\"portalPassword\":\"Sup@123\",\"contacts\":[{\"name\":\"张三\",\"mobile\":\"13900000000\"}]}"; echo "$RESP" | jval data.id; }
fx_sample()   { api POST /samples "{\"middlemanId\":$1,\"styleNo\":\"S_$SFX\",\"materials\":[{\"itemName\":\"面料\",\"part\":\"主面料\"}]}"; echo "$RESP" | jval data.id; }
fx_quote()    { api POST /quotes "{\"middlemanId\":$1,\"styleNo\":\"K_$SFX\",\"currency\":\"USD\",\"exchangeRate\":7,\"profitRate\":10,\"items\":[{\"itemName\":\"面料\",\"unit\":\"米\",\"quoteUsage\":1.5,\"rmbPrice\":8,\"lossRate\":5}]}"; echo "$RESP" | jval data.id; }
fx_order()    { api POST /orders "{\"customer_id\":$1,\"qty_total\":1000,\"currency\":\"USD\",\"unit_price\":12,\"materials\":[{\"item_name\":\"面料\",\"net_usage\":1.5,\"loss_rate\":5,\"unit_price\":8}]}"; echo "$RESP" | jval data.id; }
# 订单推进到 PRODUCING（可发货）：DRAFT→已下单→已生成合同→生产中（3次advance）
fx_order_producing() { local oid; oid=$(fx_order "$1"); api PATCH "/orders/$oid/advance" ''; api PATCH "/orders/$oid/advance" ''; api PATCH "/orders/$oid/advance" ''; echo "$oid"; }
fx_contract() { api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":$1,\"order_id\":$2,\"currency\":\"CNY\",\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":1500}]}"; echo "$RESP" | jval data.id; }

echo "=================================================================="
echo " I9 深度测试   目标：$BASE_URL"
echo " token: admin=${TOKEN_ADMIN:+✓} business=${TOKEN_BUSINESS:+✓} finance=${TOKEN_FINANCE:+✓} pm=${TOKEN_PM:+✓} supplier=${TOKEN_SUP:+✓}"
echo "=================================================================="

# ═══════════════ 基础用例(11 模块) ═══════════════
test_customer() {
  local nm="客户测试_${SFX:-x}"
  local em="buyer_${SFX:-x}@i9.com"
  local cid

  # ---- DTO 校验：异常输入应 400（基础资料设计稿 §2.1：必填=客户类型；联系人子表非空）----
  # 客户类型 @IsEnum(CustomerType) 必填，缺失应 400
  api POST /customers "{\"name\":\"$nm\",\"grade\":\"B\",\"currency\":\"USD\",\"contacts\":[{\"name\":\"李\"}]}"
  expect_code 400 "缺少 type(客户类型必填)应400"

  # grade @IsEnum(CustomerGrade) 仅 A/B/C，非法值 Z 应 400
  api POST /customers "{\"name\":\"$nm\",\"type\":\"MIDDLEMAN\",\"grade\":\"Z\",\"currency\":\"USD\",\"contacts\":[{\"name\":\"李\"}]}"
  expect_code 400 "非法 grade=Z(@IsEnum 仅A/B/C)应400"

  # 联动校验：type=最终买家 未选关联中间商应 400（设计稿 D.4）
  api POST /customers "{\"name\":\"$nm\",\"type\":\"BUYER\",\"currency\":\"USD\",\"contacts\":[{\"name\":\"李\"}]}"
  expect_code 400 "最终买家未选关联中间商应400(联动校验)"

  # 保存前·联系人非空校验：无 contacts 应 400
  api POST /customers "{\"name\":\"$nm\",\"type\":\"MIDDLEMAN\",\"currency\":\"USD\"}"
  expect_code 400 "客户无联系人子表应400(联系人非空校验)"

  # ---- 权限：POST @Roles(ADMIN,BUSINESS) ----
  # PATTERNMAKER 不在允许角色内，应被拒(403)
  api POST /customers "{\"name\":\"$nm\",\"type\":\"MIDDLEMAN\",\"grade\":\"B\",\"currency\":\"USD\",\"contacts\":[{\"name\":\"李\"}]}" "$TOKEN_PM"
  expect_deny "PATTERNMAKER 创建客户应被拒(不在@Roles)"

  # BUSINESS 属于允许角色，合法创建应 2xx
  api POST /customers "{\"name\":\"$nm\",\"type\":\"MIDDLEMAN\",\"grade\":\"B\",\"currency\":\"USD\",\"contacts\":[{\"name\":\"李\",\"mobile\":\"139\"}]}" "$TOKEN_BUSINESS"
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
  api POST /factories '{"type":"FABRIC","contacts":[{"name":"张"}]}'
  expect_code 400 "创建工厂缺 name 应 400"

  # type 为 @IsEnum(FactoryType)，非 7 类合法值即 400（name 合法以隔离 type）
  api POST /factories '{"name":"BadType-'"$SFX"'","type":"NOT_A_TYPE","contacts":[{"name":"张"}]}'
  expect_code 400 "创建工厂非法 type 应 400"

  # 保存前·联系人非空校验：无 contacts 应 400
  api POST /factories '{"name":"NoContact-'"$SFX"'","type":"FABRIC"}'
  expect_code 400 "工厂无联系人子表应400(联系人非空校验)"

  # ---- 权限：controller @Roles(ADMIN, BUSINESS) ----
  # 打版师(PATTERNMAKER)不在允许角色内，应 403
  api POST /factories '{"name":"Deny-'"$SFX"'","type":"OUTSOURCE","contacts":[{"name":"张"}]}' "$TOKEN_PM"
  expect_deny "打版师创建工厂应被拒绝"

  # 业务员(BUSINESS)在允许角色内，应成功
  api POST /factories '{"name":"Biz-'"$SFX"'","type":"ACCESSORY","contacts":[{"name":"张"}]}' "$TOKEN_BUSINESS"
  expect_ok "业务员创建工厂应成功"

  # ---- 正常路径：合法创建（admin 默认 token） ----
  api POST /factories '{"name":"Fac-'"$SFX"'","type":"FABRIC","short_name":"FS-'"$SFX"'","contacts":[{"name":"张建国","mobile":"13901588888"}]}'
  expect_ok "合法创建工厂应成功"
  fid=$(echo "$RESP" | jval data.id)

  # ---- 建后 GET 详情：编号规则 NUM_PREFIX.FACTORY='S' → factory_no ^S；联系人回填 ----
  api GET /factories/${fid:-}
  expect_ok "获取工厂详情应成功"
  expect_match data.factory_no '^S' "工厂编号应以 S 开头(设计稿 §1.1)"
  expect_eq data.type FABRIC "详情类型应为 FABRIC"
  expect_eq data.contact_name "张建国" "主联系人应自动回填为子表首行姓名"

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
  expect_eq data.status PENDING "新建样衣状态PENDING(待派单)"
  # 材料明细回读：至少 1 行
  api GET "/samples/${sid:-0}"; expect_eq data.materials.0.item_name "面料" "材料明细首行品名回读"
  # 推送版师（填材料寄出单号）→ 打样中
  api PATCH "/samples/${sid:-0}/push" '{"patternmakerId":1,"materialShipNo":"SF-'"$SFX"'"}'
  expect_ok "推送版师(填材料寄出单号)"
  api GET "/samples/${sid:-0}"; expect_eq data.status SAMPLING "推送后打样中SAMPLING"
  # 版师填件数+工时单价 → 工时金额 + 已对账
  api PATCH "/samples/${sid:-0}/patternmaker" '{"pieceCount":3,"laborUnitPrice":50}' "$TOKEN_PM"
  expect_ok "版师填件数+单价"
  api GET "/samples/${sid:-0}"; expect_eq data.status RECONCILED "件数单价填完已对账RECONCILED"
  expect_num data.labor_amount 150 "工时金额=件数×单价=150"
  # 版师只填件数不填单价应 400
  api PATCH "/samples/${sid:-0}/patternmaker" '{"pieceCount":5}' "$TOKEN_PM"
  expect_code 400 "版师仅填件数缺单价应400"
  # 完成
  api PATCH "/samples/${sid:-0}/complete" ''
  api GET "/samples/${sid:-0}"; expect_eq data.status DONE "完成后DONE(已完成)"
  # 非法中间商建样衣
  api POST /samples '{"middlemanId":999999,"styleNo":"x","materials":[{"itemName":"面料"}]}'
  if [[ "$CODE" =~ ^(400|404)$ ]]; then ok "非法中间商建样衣应400/404 [$CODE]"; else bad "非法中间商应400/404 实得$CODE"; fi
  # 材料明细为空应 400
  api POST /samples "{\"middlemanId\":${cid:-0},\"styleNo\":\"NoMat\",\"materials\":[]}"
  expect_code 400 "样衣材料明细为空应400"
}

test_quote() {
  local cid qid q2
  cid=$(fx_customer)
  api POST /quotes '{"currency":"USD","items":[{"itemName":"x","rmbPrice":5}]}'
  expect_code 400 "报价缺middlemanId应400"
  api POST /quotes "{\"middlemanId\":${cid:-0},\"styleNo\":\"x\",\"items\":[{\"itemName\":\"x\",\"rmbPrice\":-1}]}"
  expect_code 400 "报价负人民币单价应400"
  api POST /quotes "{\"middlemanId\":${cid:-0},\"styleNo\":\"x\",\"items\":[{\"itemName\":\"x\",\"rmbPrice\":5,\"lossRate\":150}]}"
  expect_code 400 "报价损耗率>100应400"
  qid=$(fx_quote "$cid")
  [[ -n "$qid" ]] && ok "创建报价 id=$qid" || bad "创建报价失败 ${RESP:0:120}"
  api GET "/quotes/${qid:-0}"
  # 含损金额=8×1.5×(1+5%)=12.6；报价人民币价格=12.6×(1+10%)=13.86（设计稿公式）
  expect_num data.rmb_total 13.86 "报价人民币价格=(8×1.5×1.05)×1.1=13.86"
  expect_eq data.fees.0.fee_name 加工费 "费用明细新建自动带首行=加工费"
  q2=$(fx_quote "$cid")
  api PATCH "/quotes/${q2:-0}/adjust" ''
  expect_code 400 "草稿直接客户调整应400"
  api PATCH "/quotes/${q2:-0}/submit" ''; expect_ok "发出报价(草稿→已报价)"
  api GET "/quotes/${q2:-0}"; expect_eq data.status QUOTED "已报价QUOTED"
  api PATCH "/quotes/${q2:-0}/adjust" ''; expect_ok "客户调整(已报价→客户调整)"
  api GET "/quotes/${q2:-0}"; expect_eq data.status ADJUSTING "客户调整ADJUSTING"
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
  expect_num data.materials.0.loss_usage 1.575 "含损单件耗用=单件×(1+损耗%)=1.5×1.05"
  expect_num data.materials.0.total_purchase 1575 "系统采购量=大货总数×单件×(1+损耗)=1000×1.575"
  expect_num data.materials.0.budget 12600 "预算=最终采购量×单价=1575×8"
  api POST "/orders/${oid:-0}/shipments" '{"shipment_date":"2026-09-01","qty":100}'
  expect_code 400 "DRAFT订单发货应400"
  api PATCH "/orders/${oid:-0}/advance" ''; expect_ok "订单推进1(草稿→已下单)"
  api PATCH "/orders/${oid:-0}/advance" ''; expect_ok "订单推进2(已下单→已生成合同)"
  api GET "/orders/${oid:-0}"; expect_eq data.status CONTRACTED "推进两次后已生成合同"
  api PATCH "/orders/${oid:-0}/advance" ''; expect_ok "订单推进3(已生成合同→生产中)"
  api GET "/orders/${oid:-0}"; expect_eq data.status PRODUCING "推进三次后生产中"
  api POST "/orders/${oid:-0}/shipments" '{"shipment_date":"2026-09-01","qty":500}'
  expect_ok "生产中订单可发货"
}

test_contract() {
  local cid fid oid ctid oidBare
  cid=$(fx_customer); fid=$(fx_factory); oid=$(fx_order_producing "$cid")
  # 快照联动（Phase 3）：材料合同不传 materials 时，自动从订单已核算的用料清单带出
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0}}"
  expect_ok "不传materials时自动从order_material带出(快照联动)"
  expect_num data.total_amount 12600 "自动带出总额=单价8×系统采购量1575"
  # 真正无可带出记录时才报错：手工建一个不含 materials 的裸订单
  api POST /orders "{\"customer_id\":${cid:-0},\"qty_total\":100,\"unit_price\":5}"
  oidBare=$(echo "$RESP" | jval data.id)
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oidBare:-0}}"
  expect_code 400 "无materials且订单无用料核算记录应400"
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

  # ── 推送前校验门户账号：未开通账号的工厂,合同推送应拦截(设计稿 A5 死流程防护) ──
  api POST /factories "{\"name\":\"NoAcc_${SFX}_${RANDOM}\",\"type\":\"FABRIC\",\"contacts\":[{\"name\":\"李\"}]}"
  local noAccFid noAccCt
  noAccFid=$(echo "$RESP" | jval data.id)
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${noAccFid:-0},\"order_id\":${oid:-0},\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":100}]}"
  noAccCt=$(echo "$RESP" | jval data.id)
  api PATCH "/contracts/${noAccCt:-0}/push" ''
  expect_code 400 "未开通门户账号的工厂合同推送应400(A5死流程防护)"
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
  api POST /settlements "{\"order_id\":${oid:-0}}" "$TOKEN_PM"
  expect_deny "PATTERNMAKER建结算应拒绝"
  api POST /settlements '{"receipt_usd":1000}' "$TOKEN_FINANCE"
  expect_code 400 "结算缺order_id应400"
  api POST /settlements "{\"order_id\":${oid:-0},\"revenue\":10000}" "$TOKEN_FINANCE"
  expect_code 400 "结算含未知字段revenue应400(whitelist)"
  # 船务出货 1000 件（成本单价/保本汇率口径）
  api POST "/orders/${oid:-0}/shipments" '{"shipment_date":"2026-06-01","qty":1000}' "$TOKEN_BUSINESS"
  expect_ok "船务登记出货1000件"
  # 财务口径：总货款含税11300(不含税10000)，收汇2000×汇率7=结算金额14000，期间费用合计200，退税300
  api POST /settlements "{\"order_id\":${oid:-0},\"receipt_usd\":2000,\"exchange_rate\":7,\"invoice_amount_usd\":2500,\"freight_fee\":100,\"express_fee\":50,\"sample_fee\":30,\"other_fee\":20,\"tax_refund\":300,\"costs\":[{\"cost_name\":\"面料\",\"amount\":11300,\"has_invoice\":1}]}" "$TOKEN_FINANCE"
  sid=$(echo "$RESP" | jval data.id)
  [[ -n "$sid" ]] && ok "FINANCE创建结算 id=$sid" || bad "创建结算失败 ${RESP:0:120}"
  expect_num data.goods_amount_tax 11300 "总货款含税=11300"
  expect_num data.goods_amount_extax 10000 "总货款不含税=11300÷1.13=10000"
  expect_num data.settle_amount 14000 "结算金额=收汇2000×汇率7"
  expect_num data.finance_fee 980 "财务及管理费=结算金额14000×7%=980"
  expect_num data.gross_profit 4000 "毛利=结算金额14000−不含税10000"
  expect_num data.net_profit_ex_refund 2820 "不含退税净利=毛利4000−期间费用200−财务费980"
  expect_num data.net_profit 3120 "含退税净利=2820+退税300"
  expect_num data.cost_per_unit_extax 10 "成本单价不含税=10000÷出货件数1000"
  expect_num data.breakeven_rate_extax 4 "保本汇率不含税=成本单价10÷美金单价2.5"
  expect_match data.settlement_no '[0-9]{8}' "结算单号含日期"
  # 追加无票成本500→全额进不含税：含税11800、不含税10500，毛利重算
  api POST "/settlements/${sid:-0}/costs" '{"cost_name":"现金采购","amount":500,"has_invoice":0}' "$TOKEN_FINANCE"
  expect_ok "追加成本500(无票)"
  api GET "/settlements/${sid:-0}"
  expect_num data.goods_amount_tax 11800 "追加后总货款含税=11800"
  expect_num data.goods_amount_extax 10500 "追加后不含税=10000+500(无票全额)"
  expect_num data.gross_profit 3500 "重算毛利=14000−10500"
  api PATCH "/settlements/${sid:-0}/confirm" '' "$TOKEN_FINANCE"
  expect_ok "结算确认"
  api GET "/settlements/${sid:-0}"; expect_eq data.status CONFIRMED "确认后CONFIRMED"
  api POST "/settlements/${sid:-0}/costs" '{"cost_name":"x","amount":1}' "$TOKEN_FINANCE"
  expect_code 400 "已确认再加成本应400"
}

test_portal() {
  local cid oid ctid rcid
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
  # 四步顺序锁定：未对账直接开票应拦截（设计稿 门户 B2/E4）
  api PATCH "/portal/contracts/${ctid:-0}/invoice" '{"invoice_no":"INV-EARLY"}' "$TOKEN_SUP"
  expect_code 400 "未对账直接开票应400(开票须对账后)"
  # 内部对账（CONTRACT类型）确认 → 合同门户置「已对账」RECONCILED，解锁开票
  api POST /reconciliations "{\"type\":\"CONTRACT\",\"contract_id\":${ctid:-0},\"factory_id\":1,\"shipments\":[{\"shipment_id\":1,\"item_name\":\"面料\",\"snapshot_unit_price\":8,\"qty\":1500}]}" "$TOKEN_FINANCE"
  rcid=$(echo "$RESP" | jval data.id)
  api PATCH "/reconciliations/${rcid:-0}/confirm" '' "$TOKEN_FINANCE"
  expect_ok "内部对账确认"
  api GET "/portal/contracts/${ctid:-0}" '' "$TOKEN_SUP"
  expect_eq data.portal_status RECONCILED "对账确认后合同门户置「已对账」"
  api PATCH "/portal/contracts/${ctid:-0}/invoice" '{"invoice_no":"INV-P1","invoice_amount":12000,"invoice_url":"/api/v1/uploads/file?p=misc/2026/01/inv.pdf"}' "$TOKEN_SUP"
  expect_ok "供应商开票(对账后放行,含发票号/金额/附件URL)"
  api GET "/portal/contracts/${ctid:-0}" '' "$TOKEN_SUP"
  [[ "$RESP" == *"附件:/api/v1/uploads"* ]] && ok "开票附件URL写入门户流水备注" || bad "开票备注未含附件URL ${RESP:0:160}"
  api PATCH "/portal/contracts/${ctid:-0}/stamp" '' "$TOKEN_SUP"
  expect_code 400 "重复盖章应400(非PUSHED)"
}

# ═══════════════ 扩展用例(11 模块 · 深度补充) ═══════════════
test_auth_ext() {
  local longname="" longpass="" injp="" inja=""

  # ── 门户登录:凭证与必填校验(基础用例仅覆盖了管理端 /auth/login)──
  api POST /auth/portal/login '{"username":"supplier1","password":"WrongPass999"}'
  expect_code 401 "门户错误密码应401"
  api POST /auth/portal/login '{"username":"supplier1"}'
  expect_code 400 "门户缺password应400"
  api POST /auth/portal/login '{"password":"Admin@123"}'
  expect_code 400 "门户缺username应400"
  api POST /auth/portal/login '{}'
  expect_code 400 "门户空body应400"

  # ── DTO 边界值(PortalLoginDto 继承 LoginDto:username@MaxLength50 / password@MinLength6@MaxLength100)──
  longname=$(printf 'a%.0s' {1..60})
  api POST /auth/portal/login "{\"username\":\"$longname\",\"password\":\"Admin@123\"}"
  if [[ "${CODE:-0}" =~ ^(400|401)$ ]]; then ok "超长username(>50)应400/401非500 [$CODE]"; else bad "超长username期望400/401 实得${CODE:-0} ${RESP:0:120}"; fi
  api POST /auth/portal/login '{"username":"supplier1","password":"12345"}'
  expect_code 400 "password过短(<6@MinLength)应400"
  longpass=$(printf 'A%.0s' {1..120})
  api POST /auth/portal/login "{\"username\":\"supplier1\",\"password\":\"$longpass\"}"
  expect_code 400 "password超长(>100@MaxLength)应400"

  # ── 注入安全:特殊字符用户名走参数化查询,应按凭证错误401 而非500 ──
  injp="supplier1' OR '1'='1"
  api POST /auth/portal/login "{\"username\":\"$injp\",\"password\":\"Admin@123\"}"
  expect_code 401 "门户SQL注入用户名应401非500"
  inja="admin' OR '1'='1"
  api POST /auth/login "{\"username\":\"$inja\",\"password\":\"Admin@123\"}"
  expect_code 401 "管理端SQL注入用户名应401非500"

  # ── 路由/方法:AuthController 仅有 POST login,其余应404 ──
  api GET /auth
  expect_code 404 "GET /auth 无此路由应404"
  api GET /auth/login
  if [[ "${CODE:-0}" =~ ^(404|405)$ ]]; then ok "GET访问POST路由/auth/login应404/405 [$CODE]"; else bad "GET /auth/login期望404/405 实得${CODE:-0}"; fi

  # ── 正向对照:合法 token 可访问受保护接口 ──
  api GET /customers '' "${TOKEN_ADMIN:-}"
  expect_ok "合法admin token访问/customers应2xx(正向对照)"
}

test_customer_ext() {
  local cid big_name

  # 1) CRUD完整性：PUT改name/grade后GET详情验证字段确实变化
  cid=$(fx_customer)
  api PUT "/customers/${cid:-0}" '{"name":"客户改后EXT'"$SFX"'","grade":"C"}'
  expect_ok "ADMIN更新客户name/grade成功"
  api GET "/customers/${cid:-0}"
  expect_eq data.name "客户改后EXT$SFX" "更新后GET详情name已变更"
  expect_eq data.grade "C" "更新后GET详情grade已变更为C"

  # 2) 枚举各合法值：grade=B / C 均可建
  api POST "/customers" '{"name":"B级客户'"$SFX"'","type":"MIDDLEMAN","grade":"B","currency":"USD","contacts":[{"name":"李"}]}'
  expect_ok "grade=B客户创建成功"
  api POST "/customers" '{"name":"C级客户'"$SFX"'","type":"MIDDLEMAN","grade":"C","currency":"CNY","contacts":[{"name":"李"}]}'
  expect_ok "grade=C客户创建成功"

  # 3) 边界值：name超@MaxLength(100)→400
  big_name=$(printf 'X%.0s' {1..101})
  api POST "/customers" '{"name":"'"$big_name"'","type":"MIDDLEMAN","currency":"USD","contacts":[{"name":"李"}]}'
  expect_code 400 "name超100字符创建应被拒"

  # 4) GET不存在的大id→404
  api GET "/customers/999999"
  expect_code 404 "GET不存在客户应返回404"

  # 5) 列表分页：?page=1&size=2→2xx且结构含分页字段
  api GET "/customers?page=1&size=2"
  expect_ok "分页查询page=1&size=2成功"
  expect_eq size 2 "分页结果结构含size=2"

  # 6) 列表keyword关键字筛选→2xx
  api GET "/customers?keyword=EXT"
  expect_ok "keyword关键字筛选成功"

  # 7) 次要状态机：ADMIN启停切换(正向)后GET验证status变化
  api PATCH "/customers/${cid:-0}/status"
  expect_ok "ADMIN切换客户启停状态成功"
  api GET "/customers/${cid:-0}"
  expect_eq data.status 0 "切换后GET详情status已变为停用"

  # 8) 权限矩阵：BUSINESS可建客户但无权切换状态/删除(均ADMIN-only)
  api PATCH "/customers/${cid:-0}/status" '{}' "$TOKEN_BUSINESS"
  expect_deny "BUSINESS无权切换客户状态"
  api DELETE "/customers/${cid:-0}" '{}' "$TOKEN_BUSINESS"
  expect_deny "BUSINESS无权删除客户"

  # 9) 软删除：ADMIN逻辑删除后GET详情→404
  api DELETE "/customers/${cid:-0}"
  expect_ok "ADMIN逻辑删除客户成功"
  api GET "/customers/${cid:-0}"
  expect_code 404 "软删除后GET详情应返回404"
}

test_factory_ext() {
  local fid="" no_a="" no_b="" nocmp="same" sid="" did="" longname=""

  # ---- CRUD 完整性：PUT 更新后重新 GET 验证字段确实变化（基础用例只校验 PUT 响应体） ----
  api POST /factories "{\"name\":\"ExtA_${SFX}_${RANDOM}\",\"type\":\"FABRIC\",\"contacts\":[{\"name\":\"初始人\",\"mobile\":\"139\"}]}"
  fid=$(echo "$RESP" | jval data.id)
  api PUT "/factories/${fid:-0}" "{\"name\":\"ExtAUpd_${SFX}\",\"contacts\":[{\"name\":\"Tom_${SFX}\",\"mobile\":\"138\"}]}"
  expect_ok "管理员 PUT 更新工厂应成功"
  api GET "/factories/${fid:-0}"
  expect_eq data.name "ExtAUpd_${SFX}" "PUT 后重新 GET 名称应已变更"
  expect_eq data.contact_name "Tom_${SFX}" "PUT 更新联系人子表后主联系人应自动回填"

  # ---- 枚举各合法值都能建：type OUTSOURCE / ACCESSORY（FABRIC 已在上方创建） ----
  api POST /factories "{\"name\":\"TP_${SFX}_${RANDOM}\",\"type\":\"OUTSOURCE\",\"contacts\":[{\"name\":\"李\"}]}"
  expect_eq data.type OUTSOURCE "OUTSOURCE 类型工厂应可创建并回显"
  api POST /factories "{\"name\":\"TB_${SFX}_${RANDOM}\",\"type\":\"ACCESSORY\",\"contacts\":[{\"name\":\"李\"}]}"
  expect_eq data.type ACCESSORY "ACCESSORY 类型工厂应可创建并回显"

  # ---- 唯一/递增：连建两个工厂 factory_no 应不同（NumberingService 全局递增） ----
  api POST /factories "{\"name\":\"NoA_${SFX}_${RANDOM}\",\"type\":\"FABRIC\",\"contacts\":[{\"name\":\"李\"}]}"
  no_a=$(echo "$RESP" | jval data.factory_no)
  api POST /factories "{\"name\":\"NoB_${SFX}_${RANDOM}\",\"type\":\"FABRIC\",\"contacts\":[{\"name\":\"李\"}]}"
  no_b=$(echo "$RESP" | jval data.factory_no)
  if [[ -n "${no_a:-}" && "${no_a:-}" != "${no_b:-}" ]]; then ok "连建两工厂编号不同($no_a≠$no_b)"; else bad "工厂编号应唯一递增($no_a vs $no_b)"; fi

  # ---- 列表查询：分页 size=2 结构应含分页字段并回显 ----
  api GET "/factories?page=1&size=2"
  expect_num size 2 "分页 size 应回显为 2"

  # ---- 列表查询：按 type 筛选，返回项类型应全部为 OUTSOURCE（取首条校验） ----
  api GET "/factories?type=OUTSOURCE&size=5"
  expect_eq data.0.type OUTSOURCE "按 type=OUTSOURCE 筛选首条类型应为 OUTSOURCE"

  # ---- 次要接口：PATCH status 用 ADMIN → 2xx，默认启用(1)切换为停用(0) ----
  api POST /factories "{\"name\":\"St_${SFX}_${RANDOM}\",\"type\":\"FABRIC\",\"contacts\":[{\"name\":\"李\"}]}"
  sid=$(echo "$RESP" | jval data.id)
  api PATCH "/factories/${sid:-0}/status"
  expect_ok "管理员切换工厂状态应成功"
  expect_eq data.status 0 "默认启用(1)切换后应为停用(0)"
  # 按 status=0 筛选应能命中刚停用的工厂
  api GET "/factories?status=0&size=5"
  expect_eq data.0.status 0 "按 status=0 筛选首条状态应为停用(0)"

  # ---- 软删除完整性：DELETE 后详情 404；对已删记录重复删除 → 404(终态幂等) ----
  api POST /factories "{\"name\":\"Del_${SFX}_${RANDOM}\",\"type\":\"FABRIC\",\"contacts\":[{\"name\":\"李\"}]}"
  did=$(echo "$RESP" | jval data.id)
  api DELETE "/factories/${did:-0}"
  expect_ok "管理员逻辑删除工厂应成功"
  api GET "/factories/${did:-0}"
  expect_code 404 "软删除后查询详情应 404"
  api DELETE "/factories/${did:-0}"
  expect_code 404 "重复删除已删除工厂应 404(终态)"

  # ---- 边界：GET 超大 id → 404；name 超 @MaxLength(100) → 400 ----
  api GET /factories/2000000001
  expect_code 404 "查询超大 id 工厂应 404"
  longname=$(printf 'N%.0s' $(seq 1 101))
  api POST /factories "{\"name\":\"${longname}\",\"type\":\"FABRIC\",\"contacts\":[{\"name\":\"李\"}]}"
  expect_code 400 "name 超过 100 字符应 400"

  # ---- 权限矩阵：补写接口换无权角色 ----
  # PUT @Roles(ADMIN,BUSINESS)：财务无权
  api PUT "/factories/${fid:-0}" "{\"name\":\"Hack_${SFX}\"}" "$TOKEN_FINANCE"
  expect_deny "财务角色更新工厂应被拒绝"
  # PATCH status @Roles(ADMIN)：业务员可建工厂但无权切换状态
  api PATCH "/factories/${fid:-0}/status" "" "$TOKEN_BUSINESS"
  expect_deny "业务员切换工厂状态应被拒绝(仅ADMIN)"

  # ── 批量导入·工厂：2 条有效 + 1 条缺联系人(应记失败) ──
  api POST /factories/import "{\"rows\":[{\"name\":\"Imp1_${SFX}_${RANDOM}\",\"type\":\"FABRIC\",\"contacts\":[{\"name\":\"李\"}]},{\"name\":\"Imp2_${SFX}_${RANDOM}\",\"type\":\"OUTSOURCE\",\"contacts\":[{\"name\":\"王\"}]},{\"name\":\"ImpBad_${SFX}\",\"type\":\"FABRIC\"}]}"
  expect_ok "批量导入工厂应2xx"
  expect_num data.created 2 "导入成功2条(有效行)"
  expect_num data.failedCount 1 "导入失败1条(缺联系人)"

  # ── 批量导入·客户：2 条有效 + 1 条缺联系人(应记失败) ──
  api POST /customers/import "{\"rows\":[{\"name\":\"CImp1_${SFX}_${RANDOM}\",\"type\":\"MIDDLEMAN\",\"grade\":\"A\",\"currency\":\"USD\",\"contacts\":[{\"name\":\"李\"}]},{\"name\":\"CImp2_${SFX}_${RANDOM}\",\"type\":\"MIDDLEMAN\",\"grade\":\"B\",\"currency\":\"USD\",\"contacts\":[{\"name\":\"王\"}]},{\"name\":\"CImpBad_${SFX}\",\"type\":\"MIDDLEMAN\",\"grade\":\"A\",\"currency\":\"USD\"}]}"
  expect_ok "批量导入客户应2xx"
  expect_num data.created 2 "客户导入成功2条(有效行)"
  expect_num data.failedCount 1 "客户导入失败1条(缺联系人)"
}

test_sample_ext() {
  local cid newname big sid_r sid_p sid_del sid_cp

  cid=$(fx_customer)
  newname="U_${SFX}"

  # ── 修改守卫：SAMPLING 可改，RECONCILED(版师填件数单价后)不可改 ──────
  sid_r=$(fx_sample "$cid")
  api PATCH "/samples/${sid_r:-0}/push" '{"patternmakerId":1,"materialShipNo":"SF1"}'
  api PUT "/samples/${sid_r:-0}" "{\"styleNo\":\"$newname\"}"
  expect_ok "打样中样衣允许修改基本信息"
  api GET "/samples/${sid_r:-0}"; expect_eq data.style_no "$newname" "更新后GET款号确实变化"
  api PATCH "/samples/${sid_r:-0}/patternmaker" '{"pieceCount":2,"laborUnitPrice":40}' "$TOKEN_PM"
  api PUT "/samples/${sid_r:-0}" '{"styleNo":"x"}'
  expect_code 400 "已对账状态不可修改基本信息"

  # ── 复制：新单待派单，款号沿用 ────────────────────────────────────
  api POST "/samples/${sid_r:-0}/copy" ''
  expect_ok "复制样衣"
  sid_cp=$(echo "$RESP" | jval data.id)
  api GET "/samples/${sid_cp:-0}"
  expect_eq data.status PENDING "复制新单状态待派单PENDING"
  expect_eq data.style_no "$newname" "复制沿用款号"

  # ── 删除规则：仅待派单可删 ───────────────────────────────────────
  sid_p=$(fx_sample "$cid")
  api PATCH "/samples/${sid_p:-0}/push" '{"materialShipNo":"SF2"}'
  api DELETE "/samples/${sid_p:-0}"
  expect_code 400 "非待派单样衣删除应400(仅待派单可删)"

  # ── 版师接口权限：财务无权 ───────────────────────────────────────
  api PATCH "/samples/${sid_r:-0}/patternmaker" '{"pieceCount":1,"laborUnitPrice":1}' "$TOKEN_FINANCE"
  expect_deny "财务调用版师保存应拒绝(仅版师/管理员)"

  # ── 不存在的大 id：GET / push 均 404 ─────────────────────────────
  api GET "/samples/99999999"
  expect_code 404 "GET不存在样衣应404"
  api PATCH "/samples/99999999/push" '{"materialShipNo":"x"}'
  expect_code 404 "推送不存在样衣应404"

  # ── 软删除完整性：DELETE 待派单后详情不可见 ──────────────────────
  sid_del=$(fx_sample "$cid")
  api DELETE "/samples/${sid_del:-0}"
  expect_ok "逻辑删除待派单样衣"
  api GET "/samples/${sid_del:-0}"
  expect_code 404 "软删除后详情应404"

  # ── 列表查询：分页结构 / 状态筛选 / 非法枚举 ─────────────────────
  api GET "/samples?page=1&size=2"
  expect_ok "样衣分页查询2xx"
  expect_eq size 2 "分页返回size=2"
  api GET "/samples?status=RECONCILED&customer_id=${cid:-0}"
  expect_ok "按状态+客户筛选2xx"
  api GET "/samples?status=BOGUS"
  expect_code 400 "非法status枚举筛选应400"

  # ── 边界：超 MaxLength(100) 的 styleNo ───────────────────────────
  big=$(printf 'x%.0s' {1..101})
  api POST /samples "{\"middlemanId\":${cid:-0},\"styleNo\":\"$big\",\"materials\":[{\"itemName\":\"面料\"}]}"
  expect_code 400 "styleNo超100字符应400"

  # ── 权限矩阵：各写接口换无权角色 ─────────────────────────────────
  api POST /samples "{\"middlemanId\":${cid:-0},\"styleNo\":\"deny\",\"materials\":[{\"itemName\":\"面料\"}]}" "$TOKEN_FINANCE"
  expect_deny "财务创建样衣应拒绝"
  api DELETE "/samples/${sid_cp:-0}" '' "$TOKEN_BUSINESS"
  expect_deny "业务删除样衣应拒绝(仅管理员)"
}

test_quote_ext() {
  local cid qa qb qm qd big
  cid=$(fx_customer)

  # ── 全流程转合同 草稿→已报价→转销售合同(已成单)──
  qa=$(fx_quote "$cid")
  api PATCH "/quotes/${qa:-0}/submit" ''
  api PATCH "/quotes/${qa:-0}/to-contract" ''
  expect_ok "报价转销售合同(已报价→已成单)应2xx"
  api GET "/quotes/${qa:-0}"
  expect_eq data.status ORDERED "转合同后状态为ORDERED(已成单)"

  # ── 幂等/终态:ORDERED 上再转合同、再编辑均应400 ──
  api PATCH "/quotes/${qa:-0}/to-contract" ''
  expect_code 400 "已成单再转合同应400(终态幂等)"
  api PUT "/quotes/${qa:-0}" "{\"styleNo\":\"改\"}"
  expect_code 400 "已成单编辑应400(仅草稿/客户调整可编辑)"

  # ── 非法转移:草稿未发出直接转合同应400 ──
  qb=$(fx_quote "$cid")
  api PATCH "/quotes/${qb:-0}/to-contract" ''
  expect_code 400 "草稿未发出直接转合同应400(非法转移)"

  # ── 多明细+费用合计手算(设计稿公式)──
  # 面料 10×2×(1+0%)=20; 辅料 5×4×(1+20%)=24; 含损合计=44
  # 费用:加工8×1 + 运费2×1 = 10; (44+10)×(1+利润10%)=59.4
  api POST /quotes "{\"middlemanId\":${cid:-0},\"styleNo\":\"M_$SFX\",\"currency\":\"USD\",\"exchangeRate\":6,\"profitRate\":10,\"items\":[{\"itemName\":\"面料\",\"unit\":\"米\",\"quoteUsage\":2,\"rmbPrice\":10,\"lossRate\":0},{\"itemName\":\"辅料\",\"quoteUsage\":4,\"rmbPrice\":5,\"lossRate\":20}],\"fees\":[{\"feeName\":\"加工费\",\"rmbPrice\":8,\"quoteUsage\":1},{\"feeName\":\"运费\",\"rmbPrice\":2,\"quoteUsage\":1}]}"
  qm=$(echo "$RESP" | jval data.id)
  api GET "/quotes/${qm:-0}"
  expect_num data.rmb_total 59.4 "报价人民币价格=(44含损+10费用)×1.1=59.4"
  expect_num data.items.1.loss_amount 24 "辅料含损金额=5×4×1.2=24"
  expect_num data.usd_total 9.9 "报价美元价格=59.4/6=9.9"

  # ── CRUD:草稿编辑 PUT 后 GET 详情验证字段确实变化 ──
  qd=$(fx_quote "$cid")
  api PUT "/quotes/${qd:-0}" "{\"styleNo\":\"改款EXT${SFX}\",\"totalRemark\":\"改备注\"}"
  expect_ok "草稿报价编辑应2xx"
  api GET "/quotes/${qd:-0}"
  expect_eq data.style_no "改款EXT${SFX}" "编辑后GET详情款号已变更"

  # ── 输入校验:报价明细缺 itemName(@IsString 必填)应400 ──
  api POST /quotes "{\"middlemanId\":${cid:-0},\"styleNo\":\"x\",\"items\":[{\"rmbPrice\":5}]}"
  expect_code 400 "报价明细缺itemName应400"
  # ── 边界:itemName 超@MaxLength(100)应400 ──
  big=$(printf 'X%.0s' $(seq 1 101))
  api POST /quotes "{\"middlemanId\":${cid:-0},\"styleNo\":\"x\",\"items\":[{\"itemName\":\"$big\",\"rmbPrice\":5}]}"
  expect_code 400 "报价明细itemName超100字符应400"

  # ── 权限矩阵:写接口对无权角色(非ADMIN/BUSINESS)应拒绝 ──
  api POST /quotes "{\"middlemanId\":${cid:-0},\"styleNo\":\"x\",\"items\":[{\"itemName\":\"x\",\"rmbPrice\":5}]}" "$TOKEN_FINANCE"
  expect_deny "FINANCE创建报价应被拒(不在@Roles)"
  api PATCH "/quotes/${qm:-0}/submit" '' "$TOKEN_PM"
  expect_deny "打版师发出报价应被拒(不在@Roles)"

  # ── 列表:分页返回2xx且结构含分页 + status 筛选 ──
  api GET "/quotes?page=1&size=2"
  expect_ok "报价列表分页page=1&size=2应2xx"
  expect_num size 2 "分页结构顶层含size=2"
  api GET "/quotes?status=ORDERED&page=1&size=5"
  expect_ok "报价按status=ORDERED筛选应2xx"

  # ── GET 不存在大id应404 ──
  api GET /quotes/99999999
  expect_code 404 "查不存在报价应404"

  # ── 软删除:草稿删除后 GET 详情应404 ──
  api DELETE "/quotes/${qd:-0}"
  api GET "/quotes/${qd:-0}"
  expect_code 404 "草稿软删除后GET详情应404"
}

test_order_ext() {
  local cid moid uoid doid soid delid delid2 poid m2oid long101
  cid=$(fx_customer)

  # ── 尺码矩阵：设置→2xx，GET回读；再更新→变化生效 ──
  moid=$(fx_order "$cid")
  api PATCH "/orders/${moid:-0}/matrix" '{"matrix_data":{"S":10,"M":20,"L":30}}'
  expect_ok "PATCH 设置尺码矩阵→2xx"
  api GET "/orders/${moid:-0}"
  expect_num data.matrix.matrix_data.M 20 "GET回读矩阵M码=20"
  api PATCH "/orders/${moid:-0}/matrix" '{"matrix_data":{"S":1,"M":99}}'
  expect_ok "PATCH 更新尺码矩阵→2xx"
  api GET "/orders/${moid:-0}"
  expect_num data.matrix.matrix_data.M 99 "更新后矩阵M码=99确已变化"

  # ── PUT 仅草稿可编辑：草稿改成功并回读，非草稿→400 ──
  uoid=$(fx_order "$cid")
  api PUT "/orders/${uoid:-0}" '{"style_name":"改后款式X","remark":"upd"}'
  expect_ok "草稿订单PUT编辑成功"
  api GET "/orders/${uoid:-0}"
  expect_eq data.style_name "改后款式X" "PUT后GET回读style_name已变更"
  api PATCH "/orders/${uoid:-0}/advance" ''
  api PUT "/orders/${uoid:-0}" '{"style_name":"再改"}'
  expect_code 400 "非草稿(CONFIRMED)订单PUT编辑→400"

  # ── 多条 materials 各自含损用量 loss_usage ──
  api POST /orders "{\"customer_id\":${cid:-0},\"qty_total\":1000,\"materials\":[{\"item_name\":\"面料A\",\"net_usage\":2,\"loss_rate\":20,\"sort_order\":0},{\"item_name\":\"辅料B\",\"net_usage\":3,\"loss_rate\":25,\"sort_order\":1}]}"
  m2oid=$(echo "$RESP" | jval data.id)
  api GET "/orders/${m2oid:-0}"
  expect_num data.materials.0.loss_usage 2.4 "料0含损单件=2×(1+20%)=2.4"
  expect_num data.materials.1.loss_usage 3.75 "料1含损单件=3×(1+25%)=3.75"

  # ── 一路 advance 到 DONE；DONE 再 advance→400；DONE 发货→400 ──
  doid=$(fx_order "$cid")
  api PATCH "/orders/${doid:-0}/advance" ''; expect_ok "推进1 草稿→已下单"
  api PATCH "/orders/${doid:-0}/advance" ''; expect_ok "推进2 已下单→已生成合同"
  api PATCH "/orders/${doid:-0}/advance" ''; expect_ok "推进3 已生成合同→生产中"
  api PATCH "/orders/${doid:-0}/advance" ''; expect_ok "推进4 生产中→已完成"
  api GET "/orders/${doid:-0}"; expect_eq data.status DONE "四次推进后状态=DONE(已完成)"
  api PATCH "/orders/${doid:-0}/advance" ''; expect_code 400 "终态DONE再推进(非法转移)→400"
  api POST "/orders/${doid:-0}/shipments" '{"shipment_date":"2026-09-01","qty":10}'
  expect_code 400 "终态DONE订单发货→400"

  # ── 多次发货累计（PRODUCING 连续两单，明细按日期累积）──
  soid=$(fx_order_producing "$cid")
  api POST "/orders/${soid:-0}/shipments" '{"shipment_date":"2026-09-01","qty":100}'; expect_ok "首次发货成功"
  api POST "/orders/${soid:-0}/shipments" '{"shipment_date":"2026-09-05","qty":200}'; expect_ok "二次发货成功"
  api GET "/orders/${soid:-0}"
  expect_num data.shipments.0.qty 100 "累计出货第1条qty=100"
  expect_num data.shipments.1.qty 200 "累计出货第2条qty=200"

  # ── 列表：status 筛选 + 分页结构 ──
  api GET '/orders?status=DRAFT'
  expect_ok "列表按status=DRAFT筛选成功"
  expect_eq data.0.status DRAFT "筛选结果首条status=DRAFT"
  api GET '/orders?page=1&size=2'
  expect_ok "列表分页查询成功"
  expect_num size 2 "分页size回显=2"
  expect_num page 1 "分页page回显=1"
  expect_match total '^[0-9]+$' "分页结构含数字total"

  # ── 边界/异常值 ──
  api GET /orders/99999999
  expect_code 404 "查询不存在大id订单→404"
  api POST /orders "{\"customer_id\":${cid:-0},\"qty_total\":-5}"
  expect_code 400 "qty_total负数→400"
  api POST /orders "{\"customer_id\":${cid:-0},\"qty_total\":0}"
  expect_ok "qty_total=0边界(@Min0)允许创建"
  long101=$(printf 'x%.0s' {1..101})
  api POST /orders "{\"customer_id\":${cid:-0},\"qty_total\":1,\"style_name\":\"$long101\"}"
  expect_code 400 "style_name超100字符(@MaxLength)→400"
  api POST /orders "{\"customer_id\":${cid:-0},\"qty_total\":500,\"materials\":[]}"
  expect_ok "空materials数组允许创建"

  # ── 软删除：草稿删除后详情404；非草稿删除→400 ──
  delid=$(fx_order "$cid")
  api DELETE "/orders/${delid:-0}"; expect_ok "草稿订单逻辑删除成功"
  api GET "/orders/${delid:-0}"; expect_code 404 "软删除后GET详情→404"
  delid2=$(fx_order "$cid")
  api PATCH "/orders/${delid2:-0}/advance" ''
  api DELETE "/orders/${delid2:-0}"; expect_code 400 "非草稿订单删除→400"

  # ── 权限矩阵：每个写接口换无权角色→拒绝 ──
  poid=$(fx_order "$cid")
  api POST /orders "{\"customer_id\":${cid:-0},\"qty_total\":1}" "$TOKEN_FINANCE"
  expect_deny "finance创建订单应拒绝"
  api PUT "/orders/${poid:-0}" '{"style_name":"x"}' "$TOKEN_FINANCE"
  expect_deny "finance编辑订单应拒绝"
  api PATCH "/orders/${poid:-0}/advance" '' "$TOKEN_PM"
  expect_deny "pm推进订单应拒绝"
  api POST "/orders/${poid:-0}/shipments" '{"shipment_date":"2026-09-01","qty":1}' "$TOKEN_FINANCE"
  expect_deny "finance添加发货应拒绝"
  api PATCH "/orders/${poid:-0}/matrix" '{"matrix_data":{}}' "$TOKEN_PM"
  expect_deny "pm改尺码矩阵应拒绝"
  api DELETE "/orders/${poid:-0}" '' "$TOKEN_BUSINESS"
  expect_deny "business删除订单应拒绝(仅ADMIN)"

  # ── 状态联动：下单反写报价「已成单」；生成合同反写订单「已生成合同」(设计稿 订单D2/合同A9) ──
  local wf_fid wf_qid wf_oid
  wf_fid=$(fx_factory)
  wf_qid=$(fx_quote "$cid")
  api PATCH "/quotes/${wf_qid:-0}/submit" ''; expect_ok "报价提交(草稿→已报价)"
  wf_oid=$(fx_order "$cid")
  api PATCH "/orders/${wf_oid:-0}/import-quote/${wf_qid:-0}" ''
  expect_ok "订单从报价导入(建立quote_id关联)"
  api PATCH "/orders/${wf_oid:-0}/advance" ''; expect_ok "订单下单(草稿→已下单)"
  api GET "/quotes/${wf_qid:-0}"
  expect_eq data.status ORDERED "下单自动反写关联报价「已成单」"
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${wf_fid:-0},\"order_id\":${wf_oid:-0},\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":100}]}"
  expect_ok "从已下单订单生成材料合同"
  api GET "/orders/${wf_oid:-0}"
  expect_eq data.status CONTRACTED "生成合同后订单自动「已生成合同」"
}

test_contract_ext() {
  local cid fid oid ctid ctdel ctpush ctm no
  cid=$(fx_customer); fid=$(fx_factory); oid=$(fx_order "$cid")

  # —— 权限矩阵：写接口换无权角色 → 拒绝 ——
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":100}]}" "$TOKEN_FINANCE"
  expect_deny "FINANCE创建合同应拒绝(仅ADMIN/BUSINESS)"

  ctid=$(fx_contract "${fid:-0}" "${oid:-0}")
  api PATCH "/contracts/${ctid:-0}/push" '' "$TOKEN_FINANCE"
  expect_deny "FINANCE推送合同应拒绝(仅ADMIN/BUSINESS)"

  # —— PATCH status：ADMIN 正向 + 回读验证(对照已有 BUSINESS 403) ——
  api PATCH "/contracts/${ctid:-0}/status" '{"status":"COMPLETED"}'
  expect_ok "ADMIN更新合同状态为COMPLETED"
  api GET "/contracts/${ctid:-0}"
  expect_eq data.status COMPLETED "状态更新后GET回读=COMPLETED"

  api DELETE "/contracts/${ctid:-0}" '' "$TOKEN_BUSINESS"
  expect_deny "BUSINESS删除合同应拒绝(仅ADMIN)"

  # —— 软删除 CRUD 完整性：DRAFT 删除→详情404→重复删除404 ——
  ctdel=$(fx_contract "${fid:-0}" "${oid:-0}")
  api DELETE "/contracts/${ctdel:-0}"
  expect_ok "删除草稿合同(逻辑删除)"
  api GET "/contracts/${ctdel:-0}"
  expect_code 404 "软删除后查询详情应404"
  api DELETE "/contracts/${ctdel:-0}"
  expect_code 404 "重复删除已删除合同应404"

  # —— 次要状态机：推送后(非DRAFT)删除应400 ——
  ctpush=$(fx_contract "${fid:-0}" "${oid:-0}")
  api PATCH "/contracts/${ctpush:-0}/push" ''
  api DELETE "/contracts/${ctpush:-0}"
  expect_code 400 "推送后删除应400(仅DRAFT可删)"

  # —— 类型枚举：PROCESS(账期默认45) / SUPPLEMENT(补料独立编号) ——
  api POST /contracts "{\"type\":\"PROCESS\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"materials\":[{\"item_name\":\"加工\",\"unit_price\":3,\"qty\":100}]}"
  expect_ok "创建PROCESS类型合同"
  expect_num data.account_period_days 45 "加工合同账期默认=发货日+45天"
  # 补料合同必须带 parent_id，否则 400
  api POST /contracts "{\"type\":\"SUPPLEMENT\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"materials\":[{\"item_name\":\"补充料\",\"unit_price\":2,\"qty\":50}]}"
  expect_code 400 "补料合同缺parent_id应400"
  # 补料合同用「补料-原合同号-序号」独立标识，不占 HT 主序号
  api POST /contracts "{\"type\":\"SUPPLEMENT\",\"parent_id\":${ctid:-0},\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"materials\":[{\"item_name\":\"补充料\",\"unit_price\":2,\"qty\":50}]}"
  expect_ok "创建SUPPLEMENT补充合同"
  expect_eq data.type SUPPLEMENT "补充合同type=SUPPLEMENT"
  expect_num data.parent_id "${ctid:-0}" "补充合同parent_id指向母合同"
  expect_match data.contract_no '^补料-' "补料合同编号=补料-原合同号-序号(不占HT主序号)"
  # —— 材料合同账期默认 90 天 ——
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":100}]}"
  expect_num data.account_period_days 90 "材料合同账期默认=发货日+90天"

  # —— 比例组合 & 边界值 ——
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"deposit_ratio\":20,\"mid_ratio\":30,\"final_ratio\":50,\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":100}]}"
  expect_num data.deposit_ratio 20 "自定义定金比例20生效"
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"mid_ratio\":-1,\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":100}]}"
  expect_code 400 "中期付款比例负数应400"
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"account_period_days\":-1,\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":100}]}"
  expect_code 400 "账期天数负数应400"
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"currency\":\"ABCDEF\",\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":100}]}"
  expect_code 400 "货币代码超5字符应400"

  # —— 材料金额合计 & 明细金额 ——
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"materials\":[{\"item_name\":\"面料A\",\"unit_price\":10,\"qty\":100},{\"item_name\":\"面料B\",\"unit_price\":5,\"qty\":200}]}"
  ctm=$(echo "$RESP" | jval data.id)
  expect_num data.total_amount 2000 "合同金额合计=10*100+5*200"
  api GET "/contracts/${ctm:-0}"
  no=$(echo "$RESP" | jval data.contract_no)
  expect_num data.materials.0.amount 1000 "首条材料金额=10*100"

  # —— 空材料数组：PROCESS类型不做快照自动带出，无明细应拒绝(Phase 3新规则，没有材料明细的合同没有业务意义) ——
  api POST /contracts "{\"type\":\"PROCESS\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"materials\":[]}"
  expect_code 400 "PROCESS类型空材料数组应400(不支持自动带出)"
  # —— MATERIAL类型空数组会触发快照自动带出，非空(该订单有order_material) ——
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${oid:-0},\"materials\":[]}"
  expect_ok "MATERIAL类型空数组触发自动带出应2xx"
  if [[ "$(echo "$RESP" | jval data.total_amount)" != "0" ]]; then ok "自动带出后合计非0(来自order_material)"; else bad "自动带出后合计不应为0"; fi

  # —— 列表分页 & keyword 筛选 & 大id 404 ——
  api GET "/contracts?page=1&size=2"
  expect_num size 2 "分页size=2生效"
  expect_num page 1 "分页page=1生效"
  api GET "/contracts?keyword=${no:-NOPE}&size=5"
  expect_eq data.0.contract_no "${no:-x}" "按合同号keyword筛选命中"
  api GET "/contracts/999999999"
  expect_code 404 "查询不存在的大id合同应404"
}

test_reconciliation_ext() {
  local fid cid oid ctid fid2 rid ridok rid2 rid3 knOid knCtid knSfx
  fid=$(fx_factory); cid=$(fx_customer); oid=$(fx_order_producing "$cid"); ctid=$(fx_contract "$fid" "$oid")

  # ── 明细/税额/发票差额 计算校验（FINANCE 建含明细对账）──
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"tax_rate\":10,\"invoice_no\":\"INV-${SFX}\",\"invoice_amount\":100,\"shipments\":[{\"shipment_id\":1,\"item_name\":\"SHIPA\",\"snapshot_unit_price\":10,\"qty\":5},{\"shipment_id\":2,\"item_name\":\"SHIPB\",\"snapshot_unit_price\":20,\"qty\":2}]}" "$TOKEN_FINANCE"
  expect_ok "FINANCE建对账(含明细/税/发票)"
  rid=$(echo "$RESP" | jval data.id)
  expect_num data.total_amount 90 "总额=Σ单价×数量(10*5+20*2)"
  expect_num data.tax_amount 9 "税额=总额×税率÷100"
  expect_num data.invoice_diff 10 "发票差额=发票额−总额"
  expect_num data.has_invoice 1 "含发票号→has_invoice=1"

  # ── 详情返回明细行金额快照 ──
  api GET "/reconciliations/${rid:-0}" '' "$TOKEN_FINANCE"
  expect_ok "对账详情(含出货明细)"
  expect_num data.shipments.0.amount 50 "明细行金额=单价×数量快照"

  # ── 发票=对账金额校验（设计稿 G3/门户D2）：发票100≠对账90(差10)确认应拦截，不进付款 ──
  api PATCH "/reconciliations/${rid:-0}/confirm" '' "$TOKEN_FINANCE"
  expect_code 400 "发票≠对账金额(差10)确认应400"
  api GET "/reconciliations/${rid:-0}" '' "$TOKEN_FINANCE"
  expect_eq data.status DRAFT "发票不符拦截后仍为DRAFT"

  # ── 发票=对账金额(±0.01容差内)→确认放行并复查状态 ──
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"invoice_no\":\"INVOK-${SFX}\",\"invoice_amount\":90.005,\"shipments\":[{\"shipment_id\":1,\"item_name\":\"OK\",\"snapshot_unit_price\":10,\"qty\":9}]}" "$TOKEN_FINANCE"
  ridok=$(echo "$RESP" | jval data.id)
  api PATCH "/reconciliations/${ridok:-0}/confirm" '' "$TOKEN_FINANCE"
  expect_ok "发票=对账金额(±0.01容差)确认放行"
  api GET "/reconciliations/${ridok:-0}" '' "$TOKEN_FINANCE"
  expect_eq data.status CONFIRMED "确认后详情状态复查为CONFIRMED"

  # ── 非法转移：已确认(终态)删除应拒 ──
  api DELETE "/reconciliations/${ridok:-0}"
  expect_code 400 "已确认对账删除应400(仅DRAFT可删)"

  # ── CONTRACT 类型带合同+明细创建（枚举各合法值可建）──
  api POST /reconciliations "{\"type\":\"CONTRACT\",\"contract_id\":${ctid:-0},\"factory_id\":${fid:-0},\"shipments\":[{\"shipment_id\":9,\"item_name\":\"C1\",\"snapshot_unit_price\":8,\"qty\":10}]}" "$TOKEN_FINANCE"
  expect_ok "CONTRACT类型带合同+明细创建"
  expect_num data.total_amount 80 "CONTRACT对账总额=8*10"

  # ── 款号检索：对账单从合同→订单带出款号，可按款号搜索（设计稿 对账 A2）──
  knSfx="KN${SFX}${RANDOM}"
  api POST /orders "{\"customer_id\":${cid:-0},\"qty_total\":100,\"style_no\":\"${knSfx}\",\"materials\":[{\"item_name\":\"面料\",\"net_usage\":1,\"loss_rate\":3,\"unit_price\":8}]}"
  knOid=$(echo "$RESP" | jval data.id)
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fid:-0},\"order_id\":${knOid:-0},\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":100}]}"
  knCtid=$(echo "$RESP" | jval data.id)
  api POST /reconciliations "{\"type\":\"CONTRACT\",\"contract_id\":${knCtid:-0},\"factory_id\":${fid:-0},\"shipments\":[{\"shipment_id\":1,\"item_name\":\"面料\",\"snapshot_unit_price\":8,\"qty\":100}]}" "$TOKEN_FINANCE"
  expect_eq data.style_no "${knSfx}" "对账单从合同→订单带出款号"
  api GET "/reconciliations?keyword=${knSfx}" '' "$TOKEN_FINANCE"
  expect_num total 1 "按款号检索对账单命中1条"

  # ── 发票号查重：同一发票号不可重复对账（防重复付，设计稿 G3）──
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"invoice_no\":\"DUP-${SFX}\",\"invoice_amount\":50,\"shipments\":[{\"shipment_id\":1,\"item_name\":\"D\",\"snapshot_unit_price\":10,\"qty\":5}]}" "$TOKEN_FINANCE"
  expect_ok "首次用发票号DUP建对账"
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"invoice_no\":\"DUP-${SFX}\",\"shipments\":[]}" "$TOKEN_FINANCE"
  expect_code 400 "重复发票号对账应400(防重复付)"

  # ── 边界：空明细数组可建且总额0 ──
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"shipments\":[]}" "$TOKEN_FINANCE"
  expect_ok "空明细数组可建"
  expect_num data.total_amount 0 "空明细总额=0"

  # ── 边界：明细单价负数 / 税率负数 → 400 ──
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"shipments\":[{\"shipment_id\":1,\"item_name\":\"X\",\"snapshot_unit_price\":-1,\"qty\":1}]}" "$TOKEN_FINANCE"
  expect_code 400 "明细单价负数应400(@Min0)"
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"tax_rate\":-5}" "$TOKEN_FINANCE"
  expect_code 400 "税率负数应400(@Min0)"

  # ── 软删除：草稿删除成功，删后详情404 ──
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0}}"
  rid2=$(echo "$RESP" | jval data.id)
  api DELETE "/reconciliations/${rid2:-0}"
  expect_ok "草稿对账软删除(ADMIN)"
  api GET "/reconciliations/${rid2:-0}" '' "$TOKEN_FINANCE"
  expect_code 404 "软删后查详情应404"

  # ── 权限矩阵：PM建/ FINANCE删/ BUSINESS确认 → 拒绝 ──
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0}}" "$TOKEN_PM"
  expect_deny "PM建对账应拒绝(仅FINANCE/ADMIN)"
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0}}" "$TOKEN_FINANCE"
  rid3=$(echo "$RESP" | jval data.id)
  api DELETE "/reconciliations/${rid3:-0}" '' "$TOKEN_FINANCE"
  expect_deny "FINANCE删除对账应拒绝(仅ADMIN)"
  api PATCH "/reconciliations/${rid3:-0}/confirm" '' "$TOKEN_BUSINESS"
  expect_deny "BUSINESS确认对账应拒绝"

  # ── 列表筛选：status+分页 / factory_id命中 / 非法status ──
  api GET "/reconciliations?page=1&size=2&status=DRAFT" '' "$TOKEN_FINANCE"
  expect_ok "列表status+分页筛选"
  expect_num size 2 "分页size=2生效"
  fid2=$(fx_factory)
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid2:-0}}" "$TOKEN_FINANCE"
  api GET "/reconciliations?factory_id=${fid2:-0}&type=NO_CONTRACT" '' "$TOKEN_FINANCE"
  expect_eq data.0.factory_id "${fid2:-0}" "factory_id筛选命中本厂"
  api GET "/reconciliations?status=BADX" '' "$TOKEN_FINANCE"
  expect_code 400 "非法status筛选枚举应400"

  # ── 写接口 not-found：确认不存在大id → 404 ──
  api PATCH "/reconciliations/99999999/confirm" '' "$TOKEN_FINANCE"
  expect_code 404 "确认不存在对账应404"
}

test_payment_ext() {
  local fid fid0 pidA pidB pidC slip501 rid_pay
  fid=$(fx_factory); fid0=$(fx_factory)

  # ——— 预付款：创建 / 零额边界 / 权限 / 按工厂筛选 / 分页 ———
  api POST /payments/prepayments "{\"factory_id\":${fid:-0},\"amount\":1000,\"pay_date\":\"2026-08-01\"}" "$TOKEN_FINANCE"
  expect_ok "预付款创建2xx"
  api POST /payments/prepayments "{\"factory_id\":${fid:-0},\"amount\":1000,\"pay_date\":\"2026-08-02\"}" "$TOKEN_FINANCE"
  api POST /payments/prepayments "{\"factory_id\":${fid:-0},\"amount\":0,\"pay_date\":\"2026-08-01\"}" "$TOKEN_FINANCE"
  expect_code 400 "预付款金额0应400"
  api POST /payments/prepayments "{\"factory_id\":${fid:-0},\"amount\":500,\"pay_date\":\"2026-08-01\"}" "$TOKEN_BUSINESS"
  expect_deny "BUSINESS建预付款应拒绝"
  api GET "/payments/prepayments?factory_id=${fid:-0}"
  expect_num total 2 "按工厂筛选预付款total=2"
  api GET "/payments/prepayments?page=1&size=1"
  expect_num size 1 "预付款分页size=1生效"

  # ——— 付款申请：冲抵两分支校验(读service) + 枚举合法值 ———
  api POST /payments/requests "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"amount\":100,\"prepay_offset\":200}" "$TOKEN_FINANCE"
  expect_code 400 "预付冲抵>申请金额应400"
  api POST /payments/requests "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid0:-0},\"amount\":1000,\"prepay_offset\":500}" "$TOKEN_FINANCE"
  expect_code 400 "预付冲抵超可用余额应400"
  api POST /payments/requests "{\"type\":\"CONTRACT\",\"factory_id\":${fid:-0},\"amount\":600}" "$TOKEN_FINANCE"
  expect_ok "type=CONTRACT建付款申请2xx"

  # ——— 分批付款·超付拦截：同一对账单累计申请额≤对账应付（设计稿 G4）———
  api POST /reconciliations "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"shipments\":[{\"shipment_id\":1,\"item_name\":\"料\",\"snapshot_unit_price\":10,\"qty\":100}]}" "$TOKEN_FINANCE"
  rid_pay=$(echo "$RESP" | jval data.id)  # 对账应付=10×100=1000
  api POST /payments/requests "{\"type\":\"CONTRACT\",\"factory_id\":${fid:-0},\"reconcile_id\":${rid_pay:-0},\"amount\":600}" "$TOKEN_FINANCE"
  expect_ok "分批付款1:申请600(≤应付1000)放行"
  api POST /payments/requests "{\"type\":\"CONTRACT\",\"factory_id\":${fid:-0},\"reconcile_id\":${rid_pay:-0},\"amount\":500}" "$TOKEN_FINANCE"
  expect_code 400 "分批付款超付:累计1100>应付1000应400"
  api POST /payments/requests "{\"type\":\"CONTRACT\",\"factory_id\":${fid:-0},\"reconcile_id\":${rid_pay:-0},\"amount\":400}" "$TOKEN_FINANCE"
  expect_ok "分批付款2:申请400(累计1000=应付)放行"

  # ——— 状态机补充：APPROVED→submit / 水单MaxLength500 / 终态PAID→approve ———
  api POST /payments/requests "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"amount\":500}" "$TOKEN_FINANCE"
  pidA=$(echo "$RESP" | jval data.id)
  api PATCH "/payments/requests/${pidA:-0}/submit" '' "$TOKEN_ADMIN"
  api PATCH "/payments/requests/${pidA:-0}/approve" '' "$TOKEN_ADMIN"
  api PATCH "/payments/requests/${pidA:-0}/submit" '' "$TOKEN_ADMIN"
  expect_code 400 "已审批再提交应400"
  slip501=$(printf 'u%.0s' {1..501})
  api PATCH "/payments/requests/${pidA:-0}/paid" "{\"slip_url\":\"${slip501}\"}" "$TOKEN_ADMIN"
  expect_code 400 "水单URL超500字应400"
  api PATCH "/payments/requests/${pidA:-0}/paid" '{"slip_url":"https://ex.com/ok.pdf"}' "$TOKEN_ADMIN"
  expect_ok "标记已付款2xx"
  api PATCH "/payments/requests/${pidA:-0}/approve" '' "$TOKEN_ADMIN"
  expect_code 400 "已付款再审批应400"

  # ——— 驳回：reason 非必填(@Body('reason') 无校验器) ———
  api POST /payments/requests "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"amount\":300}" "$TOKEN_FINANCE"
  pidB=$(echo "$RESP" | jval data.id)
  api PATCH "/payments/requests/${pidB:-0}/submit" '' "$TOKEN_ADMIN"
  api PATCH "/payments/requests/${pidB:-0}/reject" '{}' "$TOKEN_ADMIN"
  expect_ok "驳回不强制reason(2xx)"

  # ——— 软删除：删除权限 + 删除后再操作失效(404) ———
  api POST /payments/requests "{\"type\":\"NO_CONTRACT\",\"factory_id\":${fid:-0},\"amount\":200}" "$TOKEN_FINANCE"
  pidC=$(echo "$RESP" | jval data.id)
  api DELETE "/payments/requests/${pidC:-0}" '' "$TOKEN_FINANCE"
  expect_deny "FINANCE删除付款申请应拒绝"
  api DELETE "/payments/requests/${pidC:-0}" '' "$TOKEN_ADMIN"
  expect_ok "删除草稿付款申请2xx"
  api PATCH "/payments/requests/${pidC:-0}/submit" '' "$TOKEN_ADMIN"
  expect_code 404 "删除后再提交应404(软删生效)"

  # ——— 不存在的大 id → 404 ———
  api PATCH "/payments/requests/999999999/submit" '' "$TOKEN_ADMIN"
  expect_code 404 "提交不存在付款申请应404"
}

test_settlement_ext() {
  local cid oid sid sid2 sid3

  cid=$(fx_customer); oid=$(fx_order_producing "$cid")

  # ── 多明细·无票计税：有票÷1.13进不含税、无票按含税全额进不含税 ──
  api POST /settlements "{\"order_id\":${oid:-0},\"receipt_usd\":3000,\"exchange_rate\":7,\"costs\":[{\"cost_name\":\"面料\",\"amount\":11300,\"has_invoice\":1},{\"cost_name\":\"加工\",\"amount\":3000,\"has_invoice\":0},{\"cost_name\":\"物流\",\"amount\":2260}]}" "$TOKEN_FINANCE"
  sid=$(echo "$RESP" | jval data.id)
  [[ -n "$sid" ]] && ok "FINANCE多明细结算创建 id=$sid" || bad "多明细结算创建失败 ${RESP:0:120}"
  expect_num data.goods_amount_tax 16560 "总货款含税=11300+3000+2260"
  expect_num data.goods_amount_extax 15000 "不含税=10000(票)+3000(无票全额)+2000(票)"
  expect_num data.net_profit_ex_refund 4530 "不含退税净利=毛利(21000-15000)-财务费(21000×7%=1470)=4530"

  # ── 登记回款→累计驱动结算金额重算；POST后再GET详情验证回款已落库 ──
  api POST "/settlements/${sid:-0}/receipts" '{"amount":8000,"receipt_date":"2026-06-15","remark":"首款"}' "$TOKEN_FINANCE"
  expect_ok "FINANCE登记回款应2xx"
  api GET "/settlements/${sid:-0}"
  expect_num data.receipts.0.amount 8000 "GET详情回款记录已落库=8000"
  expect_num data.receipt_usd 8000 "实际收汇=逐笔累计=8000"
  expect_num data.settle_amount 56000 "结算金额随收汇重算=8000×7"

  # ── 按order_id筛选 + 分页结构(data即items数组, size顶层回显) ──
  api GET "/settlements?order_id=${oid:-0}&page=1&size=2"
  expect_ok "按order_id分页查询应2xx"
  expect_num size 2 "分页size顶层回显=2(结构含分页)"
  expect_eq data.0.order_id "${oid:-0}" "筛选结果首条order_id匹配"

  # ── 无收汇/汇率(草稿)允许, 结算金额=0、净利可为负 ──
  oid=$(fx_order_producing "$cid")  # 一订单仅一结算(uk_order)，每个结算换新订单
  api POST /settlements "{\"order_id\":${oid:-0},\"costs\":[{\"cost_name\":\"样品费\",\"amount\":565}]}" "$TOKEN_FINANCE"
  expect_ok "无收汇/汇率草稿应允许创建"
  expect_num data.settle_amount 0 "无收汇→结算金额=0"
  expect_num data.goods_amount_extax 500 "样品费565÷1.13=500"
  expect_num data.net_profit_ex_refund -500 "净利=毛利(0-500)-0-0=-500"

  # ── 边界:成本amount=0违反@IsPositive→400 ──
  api POST /settlements "{\"order_id\":${oid:-0},\"costs\":[{\"cost_name\":\"零费\",\"amount\":0}]}" "$TOKEN_FINANCE"
  expect_code 400 "成本amount=0违反@IsPositive应400"

  # ── 权限矩阵:写接口换无权角色 ──
  api POST "/settlements/${sid:-0}/costs" '{"cost_name":"越权","amount":100}' "$TOKEN_BUSINESS"
  expect_deny "BUSINESS追加成本应被拒(仅ADMIN/FINANCE)"
  api DELETE "/settlements/${sid:-0}" '' "$TOKEN_FINANCE"
  expect_deny "FINANCE删除结算应被拒(DELETE仅ADMIN)"

  # ── 次要状态机:确认后的受限/放行操作 ──
  oid=$(fx_order_producing "$cid")
  api POST /settlements "{\"order_id\":${oid:-0},\"receipt_usd\":1200,\"exchange_rate\":7,\"costs\":[{\"cost_name\":\"面料\",\"amount\":4000}]}" "$TOKEN_FINANCE"
  sid2=$(echo "$RESP" | jval data.id)
  api PATCH "/settlements/${sid2:-0}/confirm" '' "$TOKEN_FINANCE"
  expect_ok "FINANCE确认草稿结算应2xx"
  api DELETE "/settlements/${sid2:-0}"
  expect_code 400 "已确认结算删除应400(DELETE仅DRAFT)"
  api POST "/settlements/${sid2:-0}/receipts" '{"amount":9000,"receipt_date":"2026-06-20"}' "$TOKEN_FINANCE"
  expect_code 400 "确认后登记回款应400(addReceipt仅DRAFT，已修复)"

  # ── 软删除DRAFT + 删除后GET详情→404 ──
  oid=$(fx_order_producing "$cid")
  api POST /settlements "{\"order_id\":${oid:-0},\"goods_amount_tax\":1130}" "$TOKEN_FINANCE"
  sid3=$(echo "$RESP" | jval data.id)
  api DELETE "/settlements/${sid3:-0}"
  expect_ok "ADMIN删除草稿结算应2xx"
  api GET "/settlements/${sid3:-0}"
  expect_code 404 "软删除后GET详情应404"

  # ── GET不存在的大id→404 ──
  api GET "/settlements/99999999"
  expect_code 404 "GET不存在结算(大id)应404"
}

test_portal_ext() {
  local cid oidA oidB fidOther ctA ctB rcidB
  cid=$(fx_customer)
  oidA=$(fx_order_producing "$cid")
  oidB=$(fx_order_producing "$cid")

  # ── 数据隔离：admin 建“另一个工厂”的合同并 push，supplier1(绑定工厂1)不可见/不可操作 ──
  fidOther=$(fx_factory)
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":${fidOther:-0},\"order_id\":${oidA:-0},\"currency\":\"CNY\",\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":100}]}"
  ctA=$(echo "$RESP" | jval data.id)
  api PATCH "/contracts/${ctA:-0}/push" ''
  api GET "/portal/contracts/${ctA:-0}" '' "$TOKEN_SUP"
  expect_code 404 "供应商无法查看其它工厂合同详情(数据隔离)"
  api PATCH "/portal/contracts/${ctA:-0}/stamp" '' "$TOKEN_SUP"
  expect_code 404 "供应商无法盖章其它工厂合同(数据隔离)"

  # ── 工厂1合同：状态机非法/次要转移 ──
  api POST /contracts "{\"type\":\"MATERIAL\",\"factory_id\":1,\"order_id\":${oidB:-0},\"currency\":\"CNY\",\"materials\":[{\"item_name\":\"面料\",\"unit_price\":8,\"qty\":100}]}"
  ctB=$(echo "$RESP" | jval data.id)
  api PATCH "/contracts/${ctB:-0}/push" ''
  # PUSHED 未盖章 → 直接确认发货应400
  api PATCH "/portal/contracts/${ctB:-0}/ship" '{"remark":"x"}' "$TOKEN_SUP"
  expect_code 400 "未盖章直接确认发货应400"
  # PUSHED 未盖章 → 直接开票应400(发票状态机不含PUSHED)
  api PATCH "/portal/contracts/${ctB:-0}/invoice" '{"invoice_no":"INV-EXT-0"}' "$TOKEN_SUP"
  expect_code 400 "未盖章直接开票应400"
  # 盖章 → STAMPED(setup)
  api PATCH "/portal/contracts/${ctB:-0}/stamp" '' "$TOKEN_SUP"
  # STAMPED 未对账 → 开票应400(开票须对账后)
  api PATCH "/portal/contracts/${ctB:-0}/invoice" '{"invoice_no":"INV-EXT-1"}' "$TOKEN_SUP"
  expect_code 400 "已盖章未对账开票应400(开票须对账后)"
  # 确认发货 → SHIPPING(setup)
  api PATCH "/portal/contracts/${ctB:-0}/ship" '{"remark":"发货"}' "$TOKEN_SUP"
  # SHIPPING 已发货 → 再盖章应400
  api PATCH "/portal/contracts/${ctB:-0}/stamp" '' "$TOKEN_SUP"
  expect_code 400 "已发货后再盖章应400"
  # SHIPPING 已发货 → 重复确认发货应400
  api PATCH "/portal/contracts/${ctB:-0}/ship" '{"remark":"再发货"}' "$TOKEN_SUP"
  expect_code 400 "已发货后重复确认发货应400"
  # SHIPPING 未对账 → 开票仍应400
  api PATCH "/portal/contracts/${ctB:-0}/invoice" '{"invoice_no":"INV-EXT-2"}' "$TOKEN_SUP"
  expect_code 400 "已发货未对账开票应400(开票须对账后)"
  # 内部对账确认 → RECONCILED，解锁开票
  api POST /reconciliations "{\"type\":\"CONTRACT\",\"contract_id\":${ctB:-0},\"factory_id\":1,\"shipments\":[{\"shipment_id\":1,\"item_name\":\"面料\",\"snapshot_unit_price\":8,\"qty\":100}]}" "$TOKEN_FINANCE"
  rcidB=$(echo "$RESP" | jval data.id)
  api PATCH "/reconciliations/${rcidB:-0}/confirm" '' "$TOKEN_FINANCE"
  expect_ok "内部对账确认(ctB→RECONCILED)"
  # RECONCILED → 开票放行，且可重复开票(仅追加日志)
  api PATCH "/portal/contracts/${ctB:-0}/invoice" '{"invoice_no":"INV-EXT-3"}' "$TOKEN_SUP"
  expect_ok "对账后开票放行"
  api PATCH "/portal/contracts/${ctB:-0}/invoice" '{"invoice_no":"INV-EXT-3"}' "$TOKEN_SUP"
  expect_ok "重复开票应放行(仅记录日志)"

  # ── 不存在的大 id → 404 ──
  api GET "/portal/contracts/999999999" '' "$TOKEN_SUP"
  expect_code 404 "查看不存在合同详情应404"
  api PATCH "/portal/contracts/999999999/stamp" '' "$TOKEN_SUP"
  expect_code 404 "盖章不存在合同应404"

  # ── 列表查询：分页与状态筛选 ──
  api GET "/portal/contracts?page=1&size=2" '' "$TOKEN_SUP"
  expect_ok "门户合同分页查询"
  expect_eq size 2 "分页size回显=2"
  api GET "/portal/contracts?portal_status=STAMPED" '' "$TOKEN_SUP"
  expect_ok "门户按portal_status筛选查询"

  # ── 权限矩阵：跨端拒绝 ──
  api GET /customers '' "$TOKEN_SUP"
  expect_deny "供应商token访问管理端/customers应拒绝"
  api GET /portal/contracts '' "$TOKEN_ADMIN"
  expect_deny "管理员token访问供应商门户应拒绝"
}


test_upload() {
  local origin="${BASE_URL%/api/v1}" code resp url tmpf
  # 未鉴权上传应 401
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/uploads" -F "file=@/etc/hostname;type=image/png" 2>/dev/null)
  [[ "$code" == "401" ]] && ok "未鉴权上传应401 [$code]" || bad "未鉴权上传应401 实得$code"
  # 鉴权上传临时图片，返回 url
  tmpf=$(mktemp /tmp/up_XXXXXX.png); printf 'PNGDATA' > "$tmpf"
  resp=$(curl -s -X POST "$BASE_URL/uploads" -H "Authorization: Bearer $TOKEN_ADMIN" -F "file=@$tmpf;type=image/png" 2>/dev/null)
  url=$(echo "$resp" | jval data.url)
  [[ -n "$url" ]] && ok "鉴权上传返回 url" || bad "上传失败 ${resp:0:120}"
  # 读取已上传文件应 200（能力URL，公开可读）
  if [[ -n "$url" ]]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' "${origin}${url}" 2>/dev/null)
    [[ "$code" == "200" ]] && ok "读取已上传文件应200 [$code]" || bad "读取文件应200 实得$code"
  fi
  rm -f "$tmpf"
  # 读取不存在文件应 404
  code=$(curl -s -o /dev/null -w '%{http_code}' "${origin}/api/v1/uploads/file?p=misc/1900/01/nope.png" 2>/dev/null)
  [[ "$code" == "404" ]] && ok "读取不存在文件应404 [$code]" || bad "读取不存在应404 实得$code"
}

# ── 执行所有模块（基础 + 扩展）────────────────────────────────
group "1. 鉴权与权限基线";        test_auth;           test_auth_ext
group "2. 客户";                  test_customer;       test_customer_ext
group "3. 工厂";                  test_factory;        test_factory_ext
group "4. 样衣状态机";            test_sample;         test_sample_ext
group "5. 报价 · 业务计算";        test_quote;          test_quote_ext
group "6. 订单 · 状态机/用料";     test_order;          test_order_ext
group "7. 合同";                  test_contract;       test_contract_ext
group "8. 对账";                  test_reconciliation; test_reconciliation_ext
group "9. 付款 · 审批流";          test_payment;        test_payment_ext
group "10. 结算 · 业务计算";       test_settlement;     test_settlement_ext
group "11. 供应商门户 · 端到端";   test_portal;         test_portal_ext
group "12. 文件上传";              test_upload

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

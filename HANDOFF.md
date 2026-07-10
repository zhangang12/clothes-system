# HANDOFF · 会话交接文档

> **用途**：新会话/新接手人**先读这份**，30 秒还原"现在到哪了、下一步做什么"。
> **维护约定（强制）**：**每次变更（commit）都必须同步更新本文件**——至少更新「一句话现状」「立即待办」「最近变更」。仓库已配 `.githooks/pre-commit` 拦截未更新本文件的提交（确无需更新时用 `git commit --no-verify` 跳过）。
> 纵深阅读：红线与操作规范看 [`CLAUDE.md`](CLAUDE.md)；项目全貌/业务规则/事故复盘看 [`docs/项目记忆.md`](docs/项目记忆.md)。

---

## 一句话现状（最后更新 2026-07-09）

准出审查所有**可短平快做的 P0/P1/P2 + 两个新功能 + 大项「合同两类编辑页」已全部完成、真栈验证、并进 `main`**。已交付:阶段0(列表响应契约/编辑页size/客户银行子表/首建撞S001 + macOS免Docker本地栈+Playwright)、阶段1(上传XSS/审批绕过/超付加锁/分页钳制/结算双重扣减/发票唯一索引)、审计补口(样衣状态机守卫+编辑丢字段/订单状态机/报价门槛A7/报价权限F1/工厂阻删/登录提示/菜单角色门控/Dashboard计数/脱敏显示/批量删确认)、**新功能**(用户反馈悬浮件+管理+HTML导出;系统报错自动记录去重+上下文+HTML导出)、**门户对账→开票→付款闭环**、**合同两类编辑页**(设计稿04 v1.3:材料/加工全字段编辑页+条款模板+价格包含项+担保人+落款盖章+从订单带入+补料/复制+PATCH编辑接口+E5锁定+两套PDF模板;schema +17列走红线一真库验证:升级✓/diff空✓/幂等✓;浏览器E2E 20/20)。
大项②**订单尺码PO矩阵+Excel导入+分色分码**也已完成:PO列矩阵(行=款·色·码,列=PO号/目的地/收货人,TOTAL QTY/各PO合计/总计回填大货总数)+总搭配汇总+CSV模板导入(4步:模板→上传→校验异常行→确认入库)+材料分色/分码出量预览+合同生成按矩阵拆行(分色→各色行/分码→各码行,UT-CON-21~23)+**修复订单编辑从不落库matrix_data的存量洞**;浏览器E2E 14/14。
大项③**门户「我要对账」步**也已完成(设计稿05 v2.2 §C 四步顺序锁定补全):发货批次业务审批(web合同详情通过/驳回)→门户H5勾选已审批批次自动算(合同单价×发货数量)生成DZ单直推PENDING→业务复核确认(已有)→RECONCILED解锁开票;批次被对账占用防重复、删单释放;发货步补快递公司/单号/附件。contract_shipment +7列(走生成器)。真栈全链E2E:推送→盖章→发货→B2拒未审批→批批次→对账250→拒重复→确认→RECONCILED→开票→自动付款申请✓。顺带修:**订单编辑保存清零材料单价**(web不传unit_price,合同价格上游丢失)。
大项④**付款申请账期/到期日+分批付款+结算搜款号**也已完成(设计稿06 v1.1/v1.4):payment_request +账期/到期日/已付总额(创建时从合同带入,应付列表逾期高亮);新表 payment_record 分批付款(方式/日期/金额/水单/备注),多次付款自动累计已付/未付,悲观锁防并发超付,余额=0 整单转已付清并联动对账单 PAID;web 付款弹窗改「财务付款(可分批)」含历史记录表;结算新建改搜款号选订单(选中按款号自动聚合成本)。真栈E2E:批准→付100(余150)→超付200被拦→付150转PAID→再付被拒→记录留痕→对账单PAID✓。
大项⑤**客户机密授权体系**也已完成(设计稿01 v1.3:客户属机密单据):新表 customer_grant(客户×用户,查看/修改两级);行级可见=创建人+被授权人+管理员,覆盖 列表/详情(未授权404防探测)/下拉(下游选客户同样不可见);新建自动为创建人登记权限;批量授权(多客户×多用户,仅管理员,POST /customers/grants)+单客户授权清单/撤销;GET /auth/users 选人端点(仅管理员);web 列表🔒机密列+批量授权对话框+行级「授权」管理。真栈E2E 8步:未授权不可见→授权仅查看(改名403)→升级可改→撤销复隐→非管理员授权被拒→自建自见✓。
**报价行级过滤已补齐**(设计稿「非授权用户在报价中不可见该客户」):quote findAll/findOne 对非管理员按可见客户集过滤——中间商(customer_id)或最终买家(buyer_id)任一指向不可见客户即整单隐藏,详情 404 防探测;真栈E2E:未授权(列表隐/详情404)→授权可见→admin全量✓。合同列表不含客户列(天然不泄露);订单/样衣列表仅显示中间商名称快照(不含联系方式/条款等核心机密),如需彻底遮蔽可按 quote 同法接入(已知边界)。
**审计清单至此全部完成**——所有设计稿大项(合同编辑页/订单矩阵/门户对账/付款分批/客户机密+报价行级)均已交付并真栈验证。
**基建待办三连清(2026-07-10)**:①Redis 硬单点消除——sys_sequence DB 兜底发号(挂了降速不阻断/恢复自动追平切回,真栈杀 Redis 实测五号连续无重号);②GitHub Actions 合并即发版 workflow 模板就位于 infra/ci/deploy.yml(**待用户**:复制到 .github/workflows/ 提交——当前 PAT 无 workflow scope,需网页端建;并配 DEPLOY_SSH_HOST/USER/KEY secrets);③backup.sh 补上传文件打包(uploads_*.tar.gz)。剩余基建:migration 体系(gen-column-sync 已等效缓解)/deep-test CI 门禁/异地备份+HTTPS+告警(需服务器侧凭据与操作)。

## 系统当前活动状态

| 组件 | 状态 |
|---|---|
| 业务功能 | 8 单据 + 基础资料 + 审计补口 14 项，已上线 |
| 数据库结构 | 生产已用 `upgrade-db.sh` 补齐；`deploy.sh` 已内置幂等升级 |
| 发版 | ✅ 一键 `bash infra/scripts/deploy.sh`（备份+结构升级+就绪自愈+回滚提示）|
| Redis | ✅ 目标 ECS 上**已运行**（`health.sh` 兼容 Docker/原生两种探测）|
| 测试 | 真机 `deep-test.sh` 493/0；API 单测 183/183 |

## 立即待办（按优先级）

1. **🟠 用户操作·上线验收**：服务器 `bash infra/scripts/deploy.sh`（会自动补齐生产缺列并上线全部新功能）→ `health.sh` 全绿 → 网站验收 → 系统报错页把 8 条历史报错标「已处理」。
2. 🟡 用户操作·启用合并即发版：把 `infra/ci/deploy.yml` 复制为 `.github/workflows/deploy.yml`（网页端建，当前 PAT 无 workflow scope）+ 配 `DEPLOY_SSH_HOST/USER/KEY` secrets。
3. 🟡 剩余基建：正式 migration 体系（`gen-column-sync.py` 已等效缓解）；`deep-test.sh` CI 门禁；异地备份推送（OSS/rclone）+ HTTPS + 告警（需服务器侧凭据）。

**近期已完成**：审计清单全清 ✅；生产缺列事故根治（结构自动同步）✅；Redis 单点消除（DB 兜底发号）✅；backup.sh 含上传文件 ✅；一键 `deploy.sh` ✅。

## 本次会话关键决策（用户已拍板）

- 币种/汇率主数据字典 **不做**；本司主体档案 **做**；出口发票子模块 + 多汇率收汇 **不做**（需求未写）。
- 字段级角色脱敏 **按推荐走**；⑧大货生产 / ⑨船务资料模块 **暂缓**。
- 验收审计：**小+中项全做（14 项）、大项缓做**——已完成。

## 如何接手工作（速查）

- **先读**：本文件 →`CLAUDE.md`（红线）→`docs/项目记忆.md`（全貌）。
- **开发分支**：`claude/code-pull-7brvqy`；同时推 `main`。推送凭据在 `.env.local`（**已 gitignore，切勿入库/勿写进任何文档**）。
- **发版**：`bash infra/scripts/deploy.sh`（一条命令）。回滚：`rollback.sh <commit>`。体检：`health.sh`。
- **真机测**（改了 DB/集成必做）：容器内 `apt-get install -y mariadb-server redis-server` 起隔离实例 → HEAD `init.sql` 建库 → `NODE_ENV=production` 起 `node dist/main.js` → `bash infra/scripts/deep-test.sh`（应 0 失败）。
- **改 schema**：delta 同时进 `init.sql` + `hotfix-schema.sql`，并用真库验证（红线一）。

## 最近变更（新→旧，保留最近若干条）

- （本次·P1-A项三连）`feat(sample/order/contract)` 总览走查 #11/#17/#18(用户已拍板):**A1 样衣改材料→同步未成单报价**——QuoteService.syncFromSample:按品名匹配保留议价(人民币单价/损耗率/单位/备注沿用),耗用/颜色/供应商随样衣刷新,已成单(ORDERED)不动,金额变化清审批;业务编辑材料与版师实测耗用两条路径均触发。**A2 机密名称遮蔽**——订单/样衣列表与详情,未授权用户看到的中间商/买家名称快照显示「🔒 机密」(行级可见性=创建人+被授权人+管理员,复用 customer_grant);OrderModule/SampleModule 接入 CustomerService。**A3 电子章体系**——company_profile/factory +seal_url(基础资料页可传章图);合同 PDF 落款自动贴双方电子章(供应商电子盖章后);门户盖章支持「纸质盖章照片」上传二选一,contract +stamp_mode/stamp_paper_url 留痕(上传人/时间沿用 stamped_by/at),web 详情显示盖章方式+照片。schema 4列(gen-column-sync 重跑,真库升级✓)。jest 221/221(order/sample spec 补 mock) vitest 85/85;真栈E2E 15/15✓

- （本次·P1订单一致性）`fix(order)` 总览走查 #10/#12/#13:①客户改名 C1 同步补齐订单快照——middleman_name/buyer_name 在 草稿/已下单 同步,已生成合同(CONTRACTED)起冻结;②报价转销售合同自动建订单不再带入报价数量(qty_total=0,留空强制补尺码矩阵,矩阵合计回填);③订单材料供应商下拉去 allow-create(只可从工厂库点选)+限面/辅料(factories/select 支持逗号分隔多类型,主/附身份均命中)。jest 221/221(factory spec 适配+新增多类型用例) vitest 85/85;真栈E2E 8/8:三态订单改名同步/冻结、转单qty=0、多类型下拉✓

- （本次·P1门户闭环）`feat(portal)` 总览走查 #8/#9/#16:①**对账退回闭环**——整单退回时自动释放占用批次(供应商可重勾重发起),退回留痕单不可再提交(防同批次双计费);门户详情回显对账单列表+退回批注红条;②**发货完成→已完成**——新门户动作「发货完成」(SHIPPING/RECONCILED 可宣布,ship_done_at 留痕);开票后 已宣布→COMPLETED(新枚举值,门户「已完成」tab/标签),未宣布→回 SHIPPING 允许续批再对账(顺带修复"开票后停在RECONCILED无法续批"断链);③**撤回发货批次**——未被对账占用前门户可撤,累计发货量回退+日志;④**发货必填**——实发数量+快递公司/单号 DTO+服务端+H5三层必填;web 批次审批表补附件列。schema:contract +ship_done_at, portal_status 枚举+COMPLETED(gen-column-sync 重跑,本地真库枚举扩值✓)。jest 220/220(改3处spec适配) vitest 85/85;真栈E2E 22/22:必填拦截/两批发货/撤回回退/审批→对账占用→退回释放→批注回显→留痕单拒提→重发起→确认→发货完成→开票→COMPLETED✓

- （本次·P0#6 订单生成合同入口）`feat(order)` 订单列表操作列+订单编辑页工具栏均加「生成合同」下拉(已下单/已生成合同/生产中可用):①材料合同——调既有 generate-from-order 按供应商拆单批量建草稿,弹窗确认+未匹配供应商清单提示+跳合同列表;②加工合同——跳 /contracts/new?type=PROCESS&order_id= 带入订单明细(复用既有从订单带入)。web contractApi +generateFromOrder。真栈验证:2供应商(1入库/1未入库)→created:1+unmatched:['某供应商']✓;vue-tsc/构建绿

- （本次·P0安全包）`fix(security)` 总览走查 #5/#7:①**门户不泄露采购单价**——加工合同 orderDetail.materials API 层剥离 unit_price/budget(工厂只见品名/耗用/尺寸等工艺字段);②**敏感附件访问控制**——上传带 ?sensitive=1 落 uploads/private/ 子目录,读取须 HMAC 短时令牌(5分钟);新端点 GET /uploads/sign(JWT)签发带令牌链接;web FileUpload +sensitive 属性(缩略图/预览自动换签名链接,v-model 始终存原始URL)+utils/secureFile.ts(openFile/signedUrl);已接入四处敏感上传:担保人身份证/付款水单/结算收汇水单/门户发票。存量公共文件不受影响(能力URL不变);历史已传敏感件仍在公共目录(已知边界,未迁移)。真栈E2E 12/12:公共可读/敏感403/伪造令牌403/签名端点401门禁/带令牌200/门户材料无单价字段✓

- （本次·P0结算包+P1结算三项）`feat(settlement)` 总览走查待办 #1-4+#14/15/19 一体落地:①**编辑通道**——PATCH /settlements/:id(草稿限定,财务两步走:建单→收汇后补汇率/发票/费用)+成本行/收汇行删除端点+web编辑弹窗;②**刷新付款汇总**前端按钮(重取出货件数随船务更新+AUTO成本快照行整组重建);③**总货款仅计已付款(PAID)**——已确认未付单独落 unpaid_goods_tax/unpaid_count,成本行灰显「未付·不计入」(结算Q8);④**同款多订单不再重复背成本**——按【订单→合同→对账】圈定聚合(无合同历史数据按款号兜底),期间费用同款多单按出货份额分摊(结算Q1);⑤**逐笔收汇×各自汇率**——settlement_receipt +exchange_rate/slip_url,各笔齐备时结算金额=Σ(金额×汇率)、头上汇率=加权平均(结算Q2/Q13);⑥**必填闸门**——收汇/汇率不齐 profit_ready=0:不出误导性负毛利、不可确认(结算稿C/E);⑦refreshCost 按各行税率换算不含税(弃一刀切÷1.13,结算Q10),财务费率 7%→SysConfig(finance_fee_rate)。schema:settlement +3列/settlement_cost +5列/settlement_receipt +2列(init.sql+gen-column-sync 重跑,红线一:本地真库升级✓幂等✓);jest 220/220✓ vitest 85/85✓ 真栈E2E冒烟22/22✓(建单PAID口径/闸门400/编辑重算/逐笔汇率/覆盖拦截/刷新重聚/删行回落/确认通过)

- （本次·总览全量走查)以《总览v1.0》内嵌17份文档为基准,四路核对~340条(三模块/订单/合同120题我方核+门户对账48题+结算稿57条首次专项+总纲修订115条,全部代码实证):主线九大主题全通;产出 docs/待办清单-总览走查.html——P0×7(结算无编辑通道/总货款计未付/同款多单成本重复背/门户泄露采购价/订单缺生成合同按钮/敏感附件无访问控制等)+P1×12+P2×9组+P3×15组+3项决议矛盾待拍板;走查中揪出并已修 HEAD 编译不过(53e5048)

- 9c872f7 三份稿差异全量清零(~40项):通用字典模块(自填累积)+报价14项(转合同自动建订单等)+样衣13项(意见附件/自动推送等)+基础资料19项(覆盖更新导入/授权有效期/C1改名同步/信用列/到期日筛选/交期偏移参数化);不修6项有据。门禁全绿+红线一diff空+E2E抽查✓

- （本次·样衣模块对齐设计稿 13 项）`feat(sample)` ①保存时填材料寄出单号自动推送版师(待派单→打样中);②制版师文本框改用户下拉(GET /auth/users?role= 扩 BUSINESS 可调,失败降级文本);③新增列 `sample_garment.feedback_attachments` VARCHAR(500) 样衣意见附件(init.sql+gen-column-sync 已重跑,业务/版师视图均可传);④版师视图隐藏材料「参考价格」+实际耗用全空保存软确认;⑤categories 后端必填;⑥版师列表默认只看自己名下+未指派;⑦列表加制单人列;⑧编辑页管理员删除按钮;⑨样衣制作单 A4 打印(`utils/samplePrint.ts`,脱敏不含参考价格,编辑页+列表入口);⑩变更记录全覆盖 CREATE/UPDATE/SHIP/COMPLETE/COPY;⑪高级筛选(款号/中间商/类别/制版师/制单人/制单·寄出日期范围);⑫历史样衣 CSV 导入(POST /samples/import,中间商按名精确匹配+材料分号拆行);⑬列表全列排序。web typecheck✓ vitest 85/85✓ api build✓ jest 213/213✓(**真库端到端未跑**,发版走 deploy.sh 幂等升级即补列)
- （本次·生产缺列事故根治）线上 8 张表大面积 `Unknown column` 500(报错记录功能抓到,`Customer.type`/`OrderMain.style_no`/`Factory.can_invoice` 等)——根因:`hotfix-schema.sql` 手工 delta 清单覆盖不全,生产库基线比清单更老。根治:新增 `infra/scripts/gen-column-sync.py` 从 HEAD init.sql 自动生成「全表补表+541列补齐+类型同步」AUTO 段 + 手工「枚举语义迁移」块(旧值→新值映射,BOTH 双身份回填 extra_types)。真库验证:**最老基线(8c46b21,23表)→hotfix→与 HEAD 全新库 diff(表/列/类型)为空 + 旧枚举数据迁移正确 + 二次幂等 + 对已是 HEAD 的库无害**;8 个生产报错请求本地全部 200。**服务器执行 `bash infra/scripts/deploy.sh` 即修复**。

- （本次·闭环+润色)`feat(portal)` 开票→自动生成付款申请(PENDING,幂等),打通 对账→开票→付款;`fix(web)` 脱敏字段显示「—」非0.00、5列表批量删二次确认。真栈验证,均已进 main(0abee64)
- （本次·新功能+审计补口）`feat` 用户反馈(悬浮件+提交+图片+admin管理/HTML导出)+ 系统报错自动记录(全局异常过滤器 APP_FILTER 自动归档、指纹去重、输入/输出上下文、admin专属、HTML导出排除已处理);`fix(api)` 审计补口:样衣状态机守卫/编辑丢字段、订单状态机(D1)/报价门槛(A7)、报价权限(F1)、工厂阻删补全下游、结算双重扣减、发票唯一索引;`fix(web)` 登录报错提示、菜单角色门控、Dashboard待审批计数。均真栈验证,单测 186/186
- （本次·阶段2起)`feat(portal)` 门户开票加财务管控:校验发票=对账金额(±0.01)+ 发票号查重 + 落到对账单(此前只写日志,金额拦截失效)。真栈验(supplier1)不一致拒/一致落库/重复拒;单测 186/186。**后续同闭环:开票→自动生成付款申请、门户「我要对账」步**
- （本次·阶段1续）数据/schema:`fix(api)` 结算总货款只计合同对账(消除无合同费用双重扣减致净利偏低,真栈验 goods=1000 非 1200);发票号唯一索引 uk_invoice_no(init.sql+hotfix `_i9_add_unique` 幂等迁移,真库验重复拒/多NULL放行/二次幂等)。单测 185/185
- （本次·阶段1）安全/数据 P0:`fix(api)` 上传端点 magic-bytes 校验+安全响应头(阻断存储型 XSS)；审批后改金额清 approval_status 防绕过；超付拦截事务内 pessimistic_write；reconciliation/settlement/payment/portal 分页钳制。均真栈验证,单测 185/185
- （本次·阶段0）准出审查 + P0 修复：`fix(api)` 编号从库取基线消除撞 S001；`fix(web)` 列表响应契约对齐+编辑页 size+客户银行子表映射（全站列表恒空/编辑页 400 已解）；`chore(devtools)` macOS 免 Docker 本地全栈 + Playwright 冒烟。分支 `claude/fix-stage0-p0`
- `30e70d1` docs：新增 HANDOFF.md + pre-commit 钩子（每次变更强制更新交接文档）
- `30e70d1` docs：新增 HANDOFF.md + pre-commit 钩子（每次变更强制更新交接文档）
- `860a0c3` docs：落盘全量项目记忆 `docs/项目记忆.md`
- `009d4c8` docs：CLAUDE.md 落盘发版结论（一键发版/Redis 退路/待办）
- `8ed94cb` feat(ops)：`deploy.sh` 改一键部署（备份+幂等结构升级+就绪自愈+回滚提示）
- `4c0a40c` fix：真机深测修复——补料合同号超列宽致 500 + deep-test 断言纠偏
- `3409dc4` fix(ops)：存量库结构热修复 `hotfix-schema.sql` + `upgrade-db.sh`（止血 Unknown column）
- `eedf30c`…`55bd3b5` 验收审计补口 14 项（结算串流程/合同·对账/合同·门户/付款）

> 追加变更时在最前面加一行 `<commit> <一句话>`，并同步「一句话现状/立即待办」。

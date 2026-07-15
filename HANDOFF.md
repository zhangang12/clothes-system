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

0. **🔴 待发版·两处生产修复**（同一次 `push main → deploy.sh` 一起上）：
   - **建样衣 500**：生产 `sample_garment` 残留重构前孤儿列 `style_name NOT NULL 无默认值` → 建样衣(POST /samples)必 500（线上已 16 次）。修复已进 `hotfix-schema.sql`（放宽为可空，守卫幂等）。验收=新建一张样衣成功。（本机无 MySQL 未本地真跑，经 deploy.sh 备份+应用+校验落地验证。）
   - **反馈 Ctrl+V 粘贴**：`FileUpload` 加 `globalPaste` 兜底监听 + `FeedbackWidget` 启用。web `vue-tsc`+vitest 86/86 过；deploy.sh 会重建 web 静态包生效。验收=反馈弹窗里 Ctrl+V 粘截图能上传。
   - **样衣附件/下载/尺码数量**：`sample_garment` +3 列（走 hotfix，红线一）+ 前端。验收=样衣新建页「资料附件」能传 PDF/Excel 多个、点文件能下载、基本信息有尺码/数量。（多轮寄样子表下一批）
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

- （本次·Excel 在线预览）`feat(web)` 用户追加诉求「Excel 也要支持在线预览」。浏览器原生渲染不了 xlsx(本质是装 XML 的 zip)，必须解析——**三条路都要破「零新增依赖」约定**，已把取舍摆给用户并由其拍板走「前端解析 exceljs」：①`xlsx`(SheetJS) npm 停在 0.18.5 且带**两个高危**(原型污染 GHSA-4r6h-8v6p-xvw6 / ReDoS GHSA-5pgg-2g8v-p4x9，官方新版已挪去自家 CDN，npm 版等于弃养)；②`exceljs` 4.4.0 在维护但解包 20.8MB、9 个传递依赖；③第三方在线预览器(微软/Google)**已排除**——要把客户机密文件公网可达并上传第三方，与本系统的 customer_grant 机密授权体系直接冲突。落地：新 `utils/sheetPreview.ts`(**一律动态 import**，实测 exceljs 切成独立 chunk 917KB/gzip271KB，**入口零引用**，不点预览不加载)；FileUpload 预览弹窗支持多工作表页签、公式取缓存值、空行跳过、>200 行截断、>15MB 拒绝；**只认 .xlsx**——`.xls` 是 BIFF 二进制老格式 exceljs 读不了，明确提示后降级下载。单测 4 例(造真 xlsx 再解析回来)。验证：vitest 104/104、build✓。
- （多页签 + PDF 在线预览 + 洗标号/Article）`feat(web)` 用户反馈三连:①**多页签**(用户拍板"全盘考虑直接做多页签"):顶栏下页签栏,点菜单累积、点页签切换、× 关闭、右键关闭其他/全部;工作台固定不可关;同一编辑页不同单据是独立页签(标题带 `#id`);上限 12 超出挤最早;退出登录清空。新 `stores/tabs.ts` + `components/TabsBar.vue`;**37 条路由补 `meta.title`**,页签与面包屑同源(原布局里另有一份 titleMap 只覆盖列表页,已删)。**踩坑**:页签存 Pinia 内存 → **F5 全丢**,改存 `sessionStorage`(浏览器标签页关掉即清)+脏数据兜底;单测 9 例。②**上传资料不能在线看**(反馈②前半):`FileUpload.onPreview` 里 `if (!isImageName) download()` ——**只有图片能预览,PDF 也被强制下载**(后端对 image/*+pdf 本就发 `Content-Disposition: inline`,前端根本没给机会)。改为 PDF 走 `window.open` 浏览器直接看,图片仍弹窗,Excel/Word 才下载。订单「附件档案」5 类槽位(彩稿/大货尺寸表/大货纸板/包装资料/填充量)直接受益。③**数量搭配加洗标号/Article**(反馈①,用户确认 Article=洗标号,且选"加列不改结构"):矩阵行加 `article`(`matrix_data` 是 JSON 列,**无 schema 改动**);贯通 读取(含旧格式)/保存/空行过滤/汇总/导入预览;**生产通知单打印带出洗标号**(工厂据此区分标类——反馈的真正诉求),整列为空则不占版面;CSV 模板加「洗标号」列并**兼容旧模板**(据表头 `head[2]==='洗标号'` 自适应固定列数,已发出去的旧模板不作废)。验证:web build✓ vitest 100/100、api 221/221、portal✓。**待发版后真库验**:`matrix_data` 里 article 的 JSON 透传(DTO 无嵌套校验,理论穿透,须实测)。
- （反馈导出内联图片 + 表格操作列样式）`fix(feedback/ui)` ①**反馈导出 HTML 图片裂图**(用户反馈):`images` 存的是 `/api/v1/uploads/file?p=<相对路径>`——**相对地址 + 要 JWT 的接口**,导出件下载到本地用 `file://` 打开必然裂(解析成 `file:///api/v1/...`),改绝对地址也过不了鉴权。改为**读盘转 base64 内联**(复用 `FileService.resolvePath` 的防目录穿越),导出件自包含离线可看;单图 >2MB 或读不到**退回可点链接**不让整个导出失败,非图片(pdf/xlsx)保持链接。`FeedbackModule` 新 import `FileModule`。②**表格操作列排布**(用户截图反馈"太丑"):病根是 `el-dropdown`/`el-popconfirm` 包装元素打断了 Element Plus 的 `.el-button + .el-button` 边距选择器 → 间距忽有忽无 + inline-block 基线错位;theme.css 加 `.table-ops`(flex + gap 接管排布),订单/工厂/客户三个列表页套用;**颜色收归设计系统**:日常操作(编辑/查看/打印/复制/授权/生成合同)统一主色靛蓝,色彩只留语义(删除=危险红、审批=成功绿)——原先复制=info、授权/生成合同=warning 是拿警示色当装饰。无 schema 改动。验证:api build✓ jest 221/221、web build✓ vitest 91/91。
- （生产浏览器验收 E2E）`test(e2e)` 新增**打已部署环境的只读 Playwright 验收**:`packages/e2e/playwright.prod.config.ts`(testDir `./prod`,baseURL 取 `BASE_URL` 默认生产,**不拉本地 api/web、不走 global-setup 造数**)+ `prod/prod-01-picker-and-export.spec.ts` 4 例:①对账新建搜款号→选合同→断言带出**工厂名称**而非 `工厂#<id>` 回退;②付款新建工厂项**不存在 el-input-number**(裸 ID 已消灭)且下拉给的是名称;③样衣列表导出 Excel **真实下载**并校验 BOM/`mso-number-format`/款号/无乱码哨兵/旧数据不渲染寄样跟踪表;④**多轮分支用 `page.route` 拦截注入轮次**(生产样衣未填轮次,真 UI 无从触发;跑的仍是线上 bundle,**不往生产写任何数据**)校验轮次明细+件数合计 5+工价合计 150+单号回落首轮。跑法:`cd packages/e2e && npx playwright test -c playwright.prod.config.ts`(4/4 通过,对 `2957052` 生产实测)。踩坑:el-select 的 placeholder 渲染成独立 span 而非 input 属性,须用 `getByRole('combobox',{name})` 定位。**注:Claude in Chrome 扩展当时连不上(native host 挂在桌面 App 那条管道),故改用 Playwright——这条路不依赖扩展,更适合当发版门禁。**
- （修复导出 Excel 丢寄样多轮）`fix(sample)` 发版后端到端体检发现:#5 把寄样改多轮子表后 `summarizeRounds` **只回填 piece_count/labor_amount/labor_unit_price,不回填 `material_ship_no`/`return_no`/`ship_sample_date`**,而当晚新加的导出 Excel 只读这些旧单值列 → **走多轮流程录的样衣,导出的寄出单号/寄回单号/寄样日期全空,各轮尺码/单号/工价一条不出**(两功能相隔 18h 上线,中间没接上;生产现存 3 条样衣尚未填轮次,故未爆发)。修法:导出加「寄样跟踪」表(轮次/尺码/件数/寄出日期/寄出单号/寄回日期/工价单价/工价金额/备注 + 件数与工价合计);基本信息的寄样日期/寄出单号在旧列为空时回落首轮(单轮样衣观感与改版前一致);无轮次的旧数据仍走原单值列且不出该表。纯前端。**该工具此前零单测覆盖(bug 因此漏网)——补 `sampleExcel.spec.ts` 5 例**(BOM/款号防截断、多轮明细+合计、回落首轮、旧数据兼容、无材料占位)。验证:vitest 91/91(86→91)、vue-tsc✓。
- （付款新建两者都要 + 样衣导出 Excel）`feat(payment/sample)` ①**付款「两者都要」**(用户拍板):预付款/付款申请新建的「工厂」改 `FactorySelect`(无合同/通用路径)+ 新增可复用 `ContractPicker`(搜款号→选合同、带出工厂,有合同路径),两条路都能建单;两弹窗加 `destroy-on-close` 使选择器每次打开都刷新。②**样衣导出 Excel**(用户反馈):无第三方依赖生成 Excel 可打开的 HTML 表格(`.xls`;UTF-8 BOM 防乱码、`mso-number-format` 文本格式防款号被当数字截断),含基本信息+材料明细;样衣**列表每行** + **编辑/查看页**均加「导出Excel」。纯前端。验证:web vue-tsc✓ vitest 86/86。**至此对账/付款「工厂ID 搜不到」+ 样衣「Excel/文件下载」两组反馈全部落地**。

- （本次·对账单款号→选合同 + 对账/付款工厂改名称选择器）`feat(reconciliation/payment)` 用户反馈:对账/付款「工厂ID」是裸数字(用户不知道 ID→搜不到、建不了单)。①新增可复用组件 `FactorySelect`(按名称/编号搜工厂、存 ID);对账/付款列表筛选、对账「非合同」建单工厂均改用它。②对账「合同对账」建单改**款号驱动**(用户要求):输入款号→`GET /contracts/by-style`(新端点,复用 priceHint 的款号匹配:`style_nos LIKE` 或材料 `style_no`)列出该款所有合同→选中自动带出工厂+合同ID;出货明细行合同也从该款合同下拉选。验证:types+api 构建✓ jest 221/221 web vue-tsc✓ vitest 86/86。**`by-style` 查询本机无真库未实跑,经 deploy 落地验证**。**下一批**:付款新建「两者都要」(有合同走款号→合同/无合同走工厂选择器) + 样衣导出 Excel。

- （本次·样衣反馈第一步:附件/下载/尺码数量）`feat(sample)` 用户反馈两条(样衣管理),按用户「分两步」先做小改:①「图片信息」新增「资料附件」多文件字段(保留图1/2/3——下游报价/订单继承依赖;accept 图片/PDF/Excel、可多个;上传端点已放行 png/jpg/webp/pdf/xls/xlsx,**不含 Word**);②文件可下载:`FileUpload` 非图片点击直接下载、图片预览框加「下载」按钮(按文件名判类型,`<a download>` 同源强制下载);③样衣加「尺码/数量」字段(如 38 码 2 件)。schema:`sample_garment` +3 列(`sample_size`/`sample_qty`/`attachments`),`init.sql` + `gen-column-sync` 重生成(44 表/650 列,红线一);**本机无真库未实跑,经 `deploy.sh` 落地验证**。验证:types+api 构建✓ jest 221/221 web vue-tsc✓ vitest 86/86。反馈②的「多轮寄样追踪子表」(较大、且改「版师填件数+工价→自动生成对账单」计费逻辑)下一批做。

- （本次·生产反馈修复:问题反馈 Ctrl+V 粘不了截图）`fix(web)` 反馈悬浮件里 Ctrl+V 粘贴截图无效。根因:`FileUpload` 的 paste 绑在需先聚焦的 `.fu-wrap`(tabindex=0),而反馈弹窗焦点天然在「问题描述」文本框,粘贴事件到不了上传框。修复:`FileUpload` 加可选 `globalPaste` 模式(挂载时在 `document` 兜底监听 paste、不依赖焦点;事件标记去重防 wrap/document 双触发;加限额守卫);`FeedbackWidget` 启用 `global-paste` + 弹窗 `destroy-on-close`(监听随弹窗开关自动挂/卸,关掉后不再全局抢粘贴)。未启用该 prop 的其它上传处零回归。验证:web `vue-tsc --noEmit` 0 报错 + vitest 86/86;真实浏览器粘贴动作未自动化(图片剪贴板难自动化),建议部署后手工点一下或本地 dev 验。

- （本次·生产事故修复:建样衣 500）`fix(db)` 生产库 `sample_garment` 残留重构前(`e5f6e21`)孤儿列 `style_name VARCHAR(100) NOT NULL 无默认值`,现行代码 INSERT 只给 `style_no` → 建样衣(POST /samples)必 500(系统报错记录已抓到 16 次)。根因:`gen-column-sync.py` 只按 HEAD `init.sql` 补列、看不见「生产有、HEAD 无」的反向漂移孤儿列,故从未触及。修复:`hotfix-schema.sql` 手工迁移块加 `_i9_modify_col('sample_garment','style_name', 放宽为可空)`(仅列存在时执行/全新装机 no-op/幂等可重放);`init.sql` 不动(HEAD 本无此列)。git diff 重构前基线↔HEAD 核实:`style_name` 是 `sample_garment` 唯一 NOT-NULL 孤儿列(其余被删列均可空+有默认)、子表 `sample_material` 无孤儿列 → 放宽本列即彻底解锁建样衣。**本机无 MySQL/docker,真库未本地实跑;经 `deploy.sh`(升级前备份+应用 hotfix+关键列校验)落地验证**。系统性缺口:gen-column-sync 对反向漂移是盲的,待补(deep-test 回归用例 + 全表孤儿 NOT-NULL 列扫描)。

- （本次·业务规则灰提示 + 交互优化）①新增全局组件 RuleHint(浅灰信息条,关键短语加粗)+全局注册+components.d.ts 类型声明,把隐性业务规则显式呈现在界面:订单(数量不导入/供应商限库内/草稿才可改)、报价(样衣导入/超阈值审批/成单不可改)、样衣(品名不导入/参考价脱敏/寄出单号推版师)、合同(推送后锁定/三金=100%/敏感附件限授权/首次推送自动开门户+待定占位)、对账(同类型合同/补料并入/发票=对账额/超发复核填因)、付款(分批/水单必填/无合同银行款号)、结算(仅计已付/收汇汇率齐才出毛利/分批结算/红冲)、出口发票(一票多款/占比分摊)共12处;②MainLayout 内容区加路由淡入过渡(reduce-motion 降级)。web 构建绿 vitest 全通

- （本次·动态封面）登录页左侧品牌区升级为**服装制造主题动态封面**:Canvas 绘制会起伏的织物经纬网格 + 沿对角缝道 dash 位移的动态针脚(模拟缝纫走针,带走针高亮点)+ 缓缓上浮的线头微粒;叠加 logo 入场+浮动动效、6阶段流程(样衣→报价→订单→合同→对账→结算)药丸节点带脉冲墨绿点、标语「从一片布,到一张单,全程可控」;含 prefers-reduced-motion 降级(静态一帧)、resize 自适应、onBeforeUnmount 清理 RAF。web 构建绿 vitest 登录7/7

- （本次·DATEX 品牌化）客户提供真实品牌 DATEX(服装公司)——重新设计登录封面与全站标题:①从品牌图裁出全彩 logo(datex-logo.png)+方形标记(datex-mark.png)放两端 public;②登录页重设计:墨绿(#2E8B78)→炭黑(#23343A)渐变品牌区+织物经纬纹理+白卡承载真实logo+墨绿渐变登录按钮+DATEX字标,输入聚焦墨绿;③浏览器标题 web「DATEX 服装智造管理系统」/门户「DATEX 供应商门户」+favicon 换 datex-mark;④侧栏品牌 I9→DATEX标记+字标;⑤门户登录页加DATEX品牌头;⑥仪表盘/打印兜底公司名/登录测试文案同步。web/portal 双构建绿 vitest 登录7/7

- （本次·清库脚本）新增 `infra/scripts/clean-db.sh`——交付前清空业务/测试数据:保留 sys_user/sys_config/sys_dict/company_profile,清空其余39张业务+主数据表(客户/工厂/样衣/报价/订单/合同/对账/付款/结算/发票…),重置 sys_sequence(单据号重头);安全三重:①执行前强制整库备份到 /opt/i9/backups ②须输入 CLEAN 或 --yes 确认 ③动态"全表减保留表"防漏。用法 `bash infra/scripts/clean-db.sh [--yes] [--clear-dicts]`。已部署生产(未执行,待用户交付前自行运行)

- （本次·前端深度测试后修复7项,已上线 fb8a049）真 Chromium 打生产全按钮/全流程/全逻辑测试(A按钮事件31/32+B黄金主流程真点按钮走通报价转合同→订单下单→生成材料合同+待定占位→推送门户+自动开门户账号s000+C业务逻辑守卫5/6,零JS报错),修复7问题:①本司主体名称乱码(生产DB双编码→utf8mb4+hex 修为「I9 服装制造有限公司」;init.sql seed 本正确);②错误提示双弹+误导(新增全局 errToast 800ms同文案去重,14视图 .response.data.message→.msg 并统一走 errToast);③时间未格式化(新增 utils/format.ts fmtDateTime/fmtDate,付款/对账/结算 创建时间 UTC→本地);④裸ID换名称(对账/付款列表后端补 factory_name/contract_no);⑤状态列被横滚埋没(订单/样衣/结算/对账 状态列 fixed=right);⑥非草稿订单只读(编辑页强制readonly+列表隐藏编辑);⑦报价列表加查看按钮。jest 221/221 vitest 86/86 双构建绿;真栈验证:公司名/工厂名/时间格式 UI 生效。生产测试数据(客户103/报价33/订单110/合同67/门户s000)+全库种子数据待清库

- （本次·样衣行级生成采购,最后悬案清零）`feat(sample)` 用户拍板 B 方案:样衣稿🟠「生成材料订单」行级按钮落地为**无合同费用对账单**(打样材料采购小额零星,不走合同/门户盖章全套):POST /samples/:id/materials/:materialId/purchase——金额=数量×参考价,供应商带入(须落工厂库),生成 NO_CONTRACT/EXPENSE 对账单(DZ-款号-序号)+费用明细行,直接进 对账→付款 链;缺 数量/参考价/供应商 各自拦截(400);样衣变更记录 PURCHASE 留痕。web 样衣编辑材料表加「🟠生成采购」行操作列(业务视图/已存行可用,弹窗确认金额)。jest 221/221 vitest 86/86;真栈E2E:1.2×28.5→对账单34.2/费用行落库/缺价行400✓。**至此总览走查全部条目(含结算深水区 Q3/Q12/Q18 + 三项决议矛盾)全部清零,无功能遗留**(仅费用阶梯计费待费率表)

- （本次·结算深水区全按推荐项）`feat(invoice/settlement)` 用户拍板"全部按推荐项开发"(结算清单 Q3/Q12/Q18+补料并入):①**Q12 出口发票/收汇子模块**——新表 export_invoice(票头)/export_invoice_item(款项行,一票多款)/invoice_receipt(逐笔收汇,多汇率+水单);/export-invoices CRUD+收汇登记+票号查重;web 新菜单页「出口发票」(登记/款项行占比/逐笔收汇/待收汇差额);②**Q3 拼柜分摊**——结算「同步发票收汇」:按本订单在各发票款项行金额占比,把逐笔收汇分摊成结算收汇行(source=INVOICE+票号留痕,汇率随笔;重拉整组重建不翻倍,手录行保留);③**Q18 分批结算**——settlement 唯一键 uk_order 删除(hotfix 手工段幂等迁移,允许一单多结算)+新列 shipment_ids 圈定出货批(建单勾选批次,件数=所选批合计,刷新尊重圈定)+「款号累计视图」(GET /settlements/aggregate:累计出货/货款/收汇/毛利净利+待齐备单数+逐单列表);④**补料对账并入原合同**——CreateReconciliationDto+merge_into_parent(仅 SUPPLEMENT 且有母合同可勾,对账挂母合同名下),web 建单勾选框。schema:3新表+3列+1索引迁移(44表/647列,真库升级+幂等✓);jest 221/221 vitest 86/86;真栈E2E 15/15:一票两款1000/两笔多汇率/60%分摊600→结算4260加权7.1/重拉幂等/同单两结算/累计视图/并入母合同/非补料拒✓。阶梯计费仍待费率表(唯一遗留)

- （本次·待办清单收官）docs/待办清单-总览走查.html 升 **v2.0**:顶部新增「施工结果」节——43组全清零×11提交对照表、遗留边界如实声明(拼柜分摊/出口发票子模块/结算-出货批关联/补料并入/阶梯计费/利润率规划表/锁汇留痕/盖章撤销审批/门户二次验证/供应商分级——深水细则;通知渠道/CA 外部依赖)、三项决议矛盾的施工取向(1:N+占用中/不回写+源订单已变更标记/行级材料订单待澄清)、三个审批触发器默认关闭说明与门户初始密码提示

- （本次·P3长尾包）`feat(全模块)` 总览走查 #36-43 落地:①**佣金**——customer +commission_rate(客户档案字段),建单自动带出;下单审批扩展:佣金>阈值(approval.order.commission_threshold)或USD单(approval.order.usd_required)触发,系统参数默认0=不启用;②**尺码/颜色字典**——订单矩阵行改 DictSelect(color/size 自填累积);**字典维护管理页**(/dicts,管理员菜单,14类含收货人/目的地台账);③**结算深水**——期间费用归集四项分列(运杂/快邮/打样/其它按关键词入列,不再整笔落其它);退税「到账确认」端点+UI(可实到金额覆盖+留痕);成本行允许负数(退运/索赔冲减);④**付款补齐**——无合同付款+收款银行/账号/相关款号,BUSINESS 可发起,FINANCE 可审批,付款水单强制必填(登记/标记两路),「付款日」检索维度,预付登记+款号;⑤**合同小项**——未匹配供应商自动挂「待定供应商」占位合同(不再丢行);历史同款价提示端点+编辑页🕘按钮带入;首次推送自动开通门户账号(工厂编号做用户名,初始密码 Factory@123);报价明细列序品名在前;⑥**治理**——报价利润率下限审批(quote.min_profit_rate,默认0);⑦**迁移**——order_main +external_no;在产订单导入(POST /orders/import,CSV粘贴,状态可指定)+报价历史导入(POST /quotes/import),列表页管理员「历史导入」弹窗。schema:4列(41表/623列,真库升级+幂等✓);jest 221/221(contract/order/payment spec 适配) vitest 86/86;真栈E2E 16/16✓。**未竟边界(如实)**:拼柜分摊/出口发票子模块/结算-出货批关联/补料并入原合同/阶梯计费/利润率规划表/锁汇留痕/盖章撤销审批/门户二次验证/供应商分级显示——深水区细则,见待办清单 v2.0 遗留节

- （本次·P3打印/附件链/订单增强）`feat(order/quote/stats)` 总览走查 #32-35:①**订单三套脱敏打印**(ORD E2)——utils/orderPrint.ts:对客确认单(无成本/供应商)/生产通知单(无客户/价格)/内部单据(全量),列表+编辑页打印下拉;**报价PDF增强**(rev G1-G3)——打印内容勾选对话框(内部留档/含款图/含费用明细),对外口径默认去客户信息与利润率行,含款图嵌样衣图;②**附件图片随单继承链**(qc I4)——样衣款图→报价 image1/2(importFromSample,已有不覆盖)→订单彩稿候选 att_artwork(importFromQuote);合同材料照片无上游源(已知边界);③**订单复制**(qc I5)——POST /orders/:id/copy 主表+用料+矩阵复制为新草稿(新单号/清审批/清同步标);**列表金额列**(ORD E6)+**订单维度统计**(ORD D8)——GET /stats/orders?dimension=po|customer|factory|currency,报表页新卡(单数/数量/金额);④**收货台账消费**(ORD B6)——订单 PO 列目的地/收货人改 DictSelect(destination/consignee 字典,自填累积复用带出)。jest 221/221 vitest 86/86(quotePrint spec 适配对外默认+新增 internal 用例);真栈验证:复制草稿✓/按币种聚合✓/样衣图→报价✓

- （本次·P3发货增强包）`feat(portal/contract)` 总览走查 #29/#30/#31:①**跨合同合并发货**(唯一整题未实现清零/门户C2/qc G1)——门户列表「合并发货」入口:勾多张已盖章/发货中合同+逐合同数量+一套物流,POST /portal/contracts/merge-ship 生成同 merge_no 组号批次(明细分摊到各合同,各批独立走审批/对账),web/门户批次均显合并组号;②**逐物料行发货**——新表 contract_shipment_item:门户发货可切「按物料行填写」,分行填实发数,批次数量=Σ行、金额=Σ(行单价×实发数)(比整单加权更准),批次行明细 web/门户回显;③**发货地址链**——contract_shipment +ship_address:合同编辑选厂自动带工厂地址(为空时),门户发货弹窗预填合同发货地址可临时改并留痕(与默认地址不同时日志注记)。发货核心重构为 createShipmentBatch 共用(单发/合并同一路径)。schema:2列+1新表(41表/617列,真库✓);jest 221/221 vitest 85/85;真栈E2E 10/10:逐行130件/金额500精确/临时地址/默认地址/合并组两合同分摊/少于2张拒✓

- （本次·P2列表体验包）`feat(settlement/portal)` 总览走查 #26/#27:**结算列表**——「待收汇N/亏损预警N/待重算N」徽标(GET /settlements/stats)+品名/订单数/出货数/不含税货款/收汇$/毛利毛利率列+「亏损」红标+「尚有N笔未付」「待船务出货」行内提示+高级筛选(仅看亏损/仅看待重算,DTO白名单);结算单建单快照 style_name/order_qty;成本明细行补实发数(对账批次合计)+加权单价。**门户列表**——卡片显款号(style_nos)+「进入处理/查看」按钮区分;列表按待办优先排序(待盖章>待发货>待对账>待开票>已完成,FIELD 排序);**门户详情**——渲染数量搭配尺码矩阵(色/码/PO表格,横向滚动)+包装资料/彩稿附件入口(后端早已返回,门户A2补渲染)。schema:settlement +style_name/order_qty,settlement_cost +qty/unit_price(40表/608列,真库✓)。jest 221/221(settlement/portal spec 适配 qb/query mock) vitest 85/85;真栈验证:stats徽标/loss筛选/排序生效/快照带出/成本行500×10✓

- （本次·P2标记留痕包）`feat(全模块)` 总览走查 #20-25/#28:①**变更标记5类**——报价内容改→订单「源报价已变更」黄条(content_updated_at vs quote_synced_at);订单内容改→合同「源订单已变更」;草稿订单引用→报价「占用中」+被引用订单号列表(可点跳转);报价行耗用≠样衣实测→「已偏离样衣」;样衣未实测→报价行「单耗为预估」+订单页黄条;②**改值留痕**——新全局表 change_log(原值X→改为Y)+GET /change-logs:报价(汇率/利润率/数量)、合同(数量/总额微调)、结算(汇率/发票/收汇/费用/退税)全挂钩,结算详情有变更记录区;③**软锁+版本+红冲**——settlement.needs_recalc:上游对账确认/付款PAID后自动标「待重算」(列表标签+详情横幅),刷新付款汇总清标;红冲重开 PATCH /settlements/:id/reopen(仅管理员,版本快照留 REOPEN 痕,回草稿重算);④**对账细节**——列表+发货批次N批列,详情头+款号,超发放行原因展示;⑤**样衣废弃态**——SampleStatus+ABANDONED(不删改废弃,下游留快照,已成单不可废,废弃后状态守卫禁编辑);⑥**超发确认移到对账**——门户发货超合同量直接放行(日志注记),对账复核确认时超发须业务填原因(rec.over_reason 留痕,web 弹窗引导);客户调整状态转单提示后放行。schema:change_log 新表+5列+样衣枚举扩值(40表/604列,真库验证✓);jest 221/221(5个spec适配) vitest 85/85;真栈E2E 25/25✓

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

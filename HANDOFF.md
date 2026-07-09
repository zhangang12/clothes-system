# HANDOFF · 会话交接文档

> **用途**：新会话/新接手人**先读这份**，30 秒还原"现在到哪了、下一步做什么"。
> **维护约定（强制）**：**每次变更（commit）都必须同步更新本文件**——至少更新「一句话现状」「立即待办」「最近变更」。仓库已配 `.githooks/pre-commit` 拦截未更新本文件的提交（确无需更新时用 `git commit --no-verify` 跳过）。
> 纵深阅读：红线与操作规范看 [`CLAUDE.md`](CLAUDE.md)；项目全貌/业务规则/事故复盘看 [`docs/项目记忆.md`](docs/项目记忆.md)。

---

## 一句话现状（最后更新 2026-07-09）

准出审查所有**可短平快做的 P0/P1/P2 + 两个新功能 + 大项「合同两类编辑页」已全部完成、真栈验证、并进 `main`**。已交付:阶段0(列表响应契约/编辑页size/客户银行子表/首建撞S001 + macOS免Docker本地栈+Playwright)、阶段1(上传XSS/审批绕过/超付加锁/分页钳制/结算双重扣减/发票唯一索引)、审计补口(样衣状态机守卫+编辑丢字段/订单状态机/报价门槛A7/报价权限F1/工厂阻删/登录提示/菜单角色门控/Dashboard计数/脱敏显示/批量删确认)、**新功能**(用户反馈悬浮件+管理+HTML导出;系统报错自动记录去重+上下文+HTML导出)、**门户对账→开票→付款闭环**、**合同两类编辑页**(设计稿04 v1.3:材料/加工全字段编辑页+条款模板+价格包含项+担保人+落款盖章+从订单带入+补料/复制+PATCH编辑接口+E5锁定+两套PDF模板;schema +17列走红线一真库验证:升级✓/diff空✓/幂等✓;浏览器E2E 20/20)。
大项②**订单尺码PO矩阵+Excel导入+分色分码**也已完成:PO列矩阵(行=款·色·码,列=PO号/目的地/收货人,TOTAL QTY/各PO合计/总计回填大货总数)+总搭配汇总+CSV模板导入(4步:模板→上传→校验异常行→确认入库)+材料分色/分码出量预览+合同生成按矩阵拆行(分色→各色行/分码→各码行,UT-CON-21~23)+**修复订单编辑从不落库matrix_data的存量洞**;浏览器E2E 14/14。
大项③**门户「我要对账」步**也已完成(设计稿05 v2.2 §C 四步顺序锁定补全):发货批次业务审批(web合同详情通过/驳回)→门户H5勾选已审批批次自动算(合同单价×发货数量)生成DZ单直推PENDING→业务复核确认(已有)→RECONCILED解锁开票;批次被对账占用防重复、删单释放;发货步补快递公司/单号/附件。contract_shipment +7列(走生成器)。真栈全链E2E:推送→盖章→发货→B2拒未审批→批批次→对账250→拒重复→确认→RECONCILED→开票→自动付款申请✓。顺带修:**订单编辑保存清零材料单价**(web不传unit_price,合同价格上游丢失)。
**剩余=大功能块(各需专门一轮)**:①客户机密授权体系(行级) ②付款申请数据模型(账期/到期日/分批)+结算搜款号带入UI。

## 系统当前活动状态

| 组件 | 状态 |
|---|---|
| 业务功能 | 8 单据 + 基础资料 + 审计补口 14 项，已上线 |
| 数据库结构 | 生产已用 `upgrade-db.sh` 补齐；`deploy.sh` 已内置幂等升级 |
| 发版 | ✅ 一键 `bash infra/scripts/deploy.sh`（备份+结构升级+就绪自愈+回滚提示）|
| Redis | ✅ 目标 ECS 上**已运行**（`health.sh` 兼容 Docker/原生两种探测）|
| 测试 | 真机 `deep-test.sh` 493/0；API 单测 183/183 |

## 立即待办（按优先级）

1. **🟠 `NumberingService` 加 DB 兜底**：拔掉 Redis 硬单点（`sys_sequence` 行锁发号，Redis 恢复自动切回），使 Redis 挂了只降速不阻断建单。
2. 🟡 正式 migration 体系替掉临时 `hotfix-schema.sql`；`deep-test.sh` 真机门禁接入部署/CI。
3. 🟡 GitHub Actions **merge→deploy**（合并即发版）；运维 P0：异地备份（含 `/data/uploads`）+ HTTPS + 告警。

**近期已完成**：起 Redis（目标 ECS）✅ ；schema 漂移止血 ✅ ；一键 `deploy.sh` ✅ 。

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

# HANDOFF · 会话交接文档

> **用途**：新会话/新接手人**先读这份**，30 秒还原"现在到哪了、下一步做什么"。
> **维护约定（强制）**：**每次变更（commit）都必须同步更新本文件**——至少更新「一句话现状」「立即待办」「最近变更」。仓库已配 `.githooks/pre-commit` 拦截未更新本文件的提交（确无需更新时用 `git commit --no-verify` 跳过）。
> 纵深阅读：红线与操作规范看 [`CLAUDE.md`](CLAUDE.md)；项目全貌/业务规则/事故复盘看 [`docs/项目记忆.md`](docs/项目记忆.md)。

---

## 一句话现状（最后更新 2026-07-08）

准出审查:**阶段0(前端系统性阻断)+ 阶段1(安全/数据)P0 已修复并端到端验证**,分支 `claude/fix-stage0-p0`(已推 origin)。阶段0:列表响应契约对齐(全站列表恒空)、编辑页 size 上限(加载 400)、客户银行子表清空、首建撞种子 S001;新增 macOS 免 Docker 本地全栈 + Playwright 冒烟。阶段1:上传端点安全(magic bytes + 安全响应头,阻断存储型 XSS)、审批后改金额绕过、超付并发加锁、分页钳制。下一步:**结算无合同费用双重扣减**(需费用类别字段区分货款/期间费用)+ **发票号唯一索引**(schema 变更,走红线一);再往后阶段2 设计符合大项(合同两类编辑页、门户对账步/开票链、订单分色分码)。

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

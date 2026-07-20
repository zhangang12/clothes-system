# AGENTS.md — I9（DATEX）服装制造管理系统 · AI 协作指南

> 面向在本仓库工作的 AI 编码代理。读者对本项目一无所知，请从本文件开始。
> **接手任务前先读 [`HANDOFF.md`](HANDOFF.md)**（一句话现状 / 立即待办 / 最近变更，每次 commit 强制同步更新，`.githooks/pre-commit` 会拦截未同步的提交）；
> 红线与运维权威版见 [`CLAUDE.md`](CLAUDE.md)；业务全貌 / 事故复盘见 [`docs/项目记忆.md`](docs/项目记忆.md)；各模块业务规则见 `docs/handbook/*.md`。
> 新 clone 仓库请先执行一次：`git config core.hooksPath .githooks`。

## 一、项目概述

面向服装外贸/制造企业（品牌 DATEX）的全流程数字化协同系统，覆盖 **基础资料 → 样衣 → 报价 → 订单 → 合同 → 供应商门户 → 对账 → 付款 → 结算（+出口发票）** 的完整业务闭环，共 8 张核心单据，按业务流严格对齐 UI 设计稿（根目录与 `UI设计稿汇总/` 下的 `0X-*.html` 即需求/设计权威来源）。

- 角色体系：内部用户 `sys_user`（ADMIN / BUSINESS / FINANCE / PATTERNMAKER / SUPERVISOR / SAMPLE_MAKER）+ 供应商门户账号 `supplier_account`（仅见自己工厂的合同）。
- 关键业务机制：单号自动发号（Redis + `sys_sequence` DB 兜底）、上游→下游**快照锁定**（报价→合同→对账→结算）、门户四步顺序锁定（盖章→发货→对账→开票）、客户机密行级授权（`customer_grant`）、幂等分批付款防超付、多状态机单据流转。
- 种子账号（密码均 `Admin@123`，供应商门户初始 `Factory@123`，**交付前必须改**）：`admin` / `business_user` / `finance_user` / `pm_user` / `supervisor_user`；门户 `supplier1`。

## 二、仓库结构与技术栈

pnpm workspace monorepo（Node ≥ 20，pnpm ≥ 9）：

| 路径 | 说明 |
|---|---|
| `packages/types` (`@i9/types`) | 全模块共享 TS 类型/枚举（单文件 `src/index.ts`）。**改动后必须先 `pnpm --filter @i9/types build`**，api/web/portal 依赖其 `dist` |
| `packages/api` (`@i9/api`) | 后端 NestJS 10 + TypeORM + MySQL 8 + Redis 7。全局前缀 `api/v1`，JWT 双类型鉴权（`req.user.type` = admin\|supplier）、`@Roles`+`RolesGuard`、Swagger 仅非生产（`/api-docs`）、限流、文件上传（`multer`，≤20MB，日期分目录+UUID） |
| `packages/web` (`@i9/web`) | PC 管理端 Vue 3 + Vite + Element Plus + Pinia + vue-router + exceljs（动态 import 做 Excel 预览）。端口 5173 |
| `packages/portal` (`@i9/portal`) | 供应商门户 H5：Vue 3 + Vant 4（移动端）。端口 5174 |
| `packages/e2e` (`@i9/e2e`) | Playwright 浏览器 E2E（`tests/` 打本地全栈，`prod/` 打生产只读验收） |
| `infra/` | 部署运维：`docker-compose.yml`（MySQL+Redis，仅绑 127.0.0.1）、`nginx.conf`、`mysql/init.sql`（权威 DDL+种子，45 表）、`systemd/i9-api.service`、`ci/deploy.yml`（GitHub Actions 模板）、`scripts/`（全部运维脚本） |
| `docs/` | `项目记忆.md`（全貌/复盘）、`handbook/`（01~07 分模块架构与业务规则）、用户操作手册 |
| `system/`、`UI设计稿汇总/`、根目录 `0X-*设计稿*.html` | 需求书与设计稿（业务字段/公式/状态机的权威依据） |
| 根目录 | `README.md`（项目介绍）、`HANDOFF.md`（交接）、`CLAUDE.md`（红线）、`开发计划.html`、`测试计划.html`、`研发待办.html` |

部署形态：**单机 All-in-One**（单台 ECS）——nginx 反代 `/api`→:3000、静态托管 web（`/`）与 portal（`/portal/`）；MySQL/Redis 走 docker-compose（仅 127.0.0.1）；API 走 systemd `i9-api`。

## 三、构建与常用命令

```bash
pnpm install
pnpm --filter @i9/types build        # 先构建共享类型（其它包依赖它）
pnpm build:all                       # types → api → web → portal

pnpm dev:api                         # http://localhost:3000/api/v1（Swagger: /api-docs）
pnpm dev:web                         # 5173，/api 代理到 3000（可用 VITE_API_TARGET 改指生产）
pnpm dev:portal                      # 5174

pnpm lint && pnpm typecheck          # eslint + tsc/vue-tsc
pnpm db:up / db:down                 # docker-compose MySQL+Redis（仅 127.0.0.1）
pnpm db:seed                         # 种子数据
```

macOS 本地免 Docker 全栈（原生 MySQL8+Redis+API:3001+web+portal，装在 `~/.i9-localdev`）：
`bash infra/scripts/local-dev-macos.sh setup|up|smoke|status|down|reload-db`

## 四、测试策略（分层，各有盲区）

| 层 | 命令 | 覆盖 | 盲区 |
|---|---|---|---|
| API 单测 | `cd packages/api && npx jest -c jest.unit.config.js`（18 个 `__tests__/*.spec.ts`，mock 仓储） | 业务逻辑/公式/状态机分支 | **不连真库**——看不见 schema 漂移、SQL 方言、列宽 |
| API 集成 e2e | `cd packages/api && npm run test:e2e`（`test/*.e2e-spec.ts`，真 NestJS 应用+真库，maxWorkers=1 共享单库） | 接口链路 | 需真 MySQL/Redis |
| web/portal 单测 | `pnpm --filter @i9/web test` / `@i9/portal test`（vitest，10 个 spec，mock API） | 组件/工具/store | 看不见后端错误 |
| **真栈深测（权威）** | `bash infra/scripts/deep-test.sh`（连真 API+真 MySQL 的端到端业务回归，公式/状态机/权限/上传/导入） | 全链路 | 需真实环境 |
| 浏览器 E2E | `cd packages/e2e && npx playwright test`（本地全栈）；`npx playwright test -c playwright.prod.config.ts`（打生产只读验收） | 真浏览器 UI | — |

**🔴 红线二：mock 单测通过 ≠ 测过了。** 凡改 DB / 集成路径，发版前必须对**真实数据库**跑通 `deep-test.sh`，并如实汇报测了什么、没测什么；不得用「构建通过 / mock 单测通过」冒充端到端验证。本机无真库时可用 `apt-get install mariadb-server redis-server`（Linux 容器）或 `local-dev-macos.sh`（macOS）起隔离实例实测。

发版前必做清单（详版见 `CLAUDE.md`）：四包构建 → API 单测 + web/portal 单测 + tsc → 若动过实体/`init.sql` 按红线一处理 → 部署后 `health.sh` 全绿、`journalctl -u i9-api` 无 `Unknown column|doesn't exist`。

## 五、🔴 红线一：数据库结构变更，必须给存量库升级路径

- 生产 `NODE_ENV=production` → TypeORM `synchronize:false`，运行时**绝不**自动建表/加列；仓库**没有正式 migration 体系**。
- `infra/mysql/init.sql` 只在数据卷为空的全新装机时执行一次，对已上线的库**永不重跑**——改它只服务新装机。

**因此任何新增/修改实体、列、表、枚举值的改动，必须三处同步：**
1. 改 `infra/mysql/init.sql`（全新装机用）；
2. 跑 `python3 infra/scripts/gen-column-sync.py` 重新生成 `infra/scripts/hotfix-schema.sql` 的 AUTO 段（任意历史版本存量库跑一遍即补到 HEAD；枚举**值重命名**须在其前的手工块写「并集→映射旧值」迁移）；
3. **用真 MySQL 实测**：旧结构库 → 应用升级 → 与全新 `init.sql` 做完整性 diff（应为空）→ 二次执行验证幂等。

历史教训（2026-07-09 生产事故）：手工维护 delta 清单必漏，曾 8 张表大面积 `Unknown column`。另注意：拼接单号（如补料号）易超列宽——新增带前缀+段的单号时核对列宽。

## 六、发版与运维

- **发版（服务器上一条命令）**：`cd /opt/i9/clothes-system && bash infra/scripts/deploy.sh`。内置顺序：拉 main → 构建 → 整库备份+幂等结构升级+校验关键列（都在重启前）→ 保证 MySQL/Redis 就绪 → 重启 i9-api → 健康检查 → reload nginx。开关：`--skip-pull`、`--skip-backup`、`--skip-build`。
- **本地构建发版**（服务器仅 2GB 内存、曾因连续构建 OOM 杀过 mysqld——服务器不再承担构建）：开发机 `bash infra/scripts/deploy-local.sh`（本地构建+单测→rsync dist→ssh 调 `deploy.sh --skip-pull --skip-build`）。
- 首次装机：`bash infra/scripts/setup.sh`；回滚：`rollback.sh <commit>`（只回代码，结构只增不减）；体检：`health.sh`；备份：`backup.sh`（含 uploads 打包）；清库：`clean-db.sh`（交付前清业务数据）。
- 运维脚本全在 `infra/scripts/`。已知坑（勿回退）：探活别用 `curl -f`（`/api/v1` 无根路由返回 404）；Redis 探活用 `redis-cli --no-auth-warning`；systemd 判定用 `systemctl cat`。
- 环境变量模板 `.env.example` → 复制为 `.env.production`：`DB_* / REDIS_* / JWT_SECRET(≥32位) / UPLOAD_ROOT(默认/data/uploads) / WEB_ORIGIN / PORTAL_ORIGIN`。生产强制要求 `WEB_ORIGIN`。上传文件须挂持久卷。
- CI：`infra/ci/deploy.yml` 是 GitHub Actions 合并即发版模板（merge main → SSH 跑 deploy+health），待用户复制为 `.github/workflows/deploy.yml` 并配 `DEPLOY_SSH_HOST/USER/KEY` secrets。

## 七、代码组织与开发约定

### 后端 `packages/api/src`
- 按业务域分模块 `modules/{auth,company,contract,customer,dict,error-log,factory,feedback,invoice,ops,order,payment,portal,quote,reconciliation,sample,settlement,stats,upload}`，每模块标准结构：`*.module.ts / *.controller.ts / *.service.ts / dto/ / *.entity.ts / __tests__/`。
- 横切层 `common/`：guards（JwtAuthGuard/RolesGuard）、interceptors（ResponseInterceptor）、filters（全局异常→error-log 归档）、decorators（`@Roles` 等）、masking（字段脱敏）、services（NumberingService 发号等）。
- 全局约定：
  - `ValidationPipe({whitelist:true, forbidNonWhitelisted:true, transform:true})`——**DTO 一律 camelCase**，snake_case 未知字段会被 400 拒绝；前端 body 必须对齐 DTO。
  - 响应封装：列表返回 `{items,total,page,size}` 会被 `ResponseInterceptor` 展开为顶层 `total/page/size` + `data=items`——断言分页用**顶层 `total`**。
  - **`bigint` 主键经 mysql2 出来是字符串**：前端 el-select 选项值/回传值/find 比较三者类型必须统一（选项数据加载时就 `Number()` 规范化，否则下拉回显裸 ID——真实踩过的 bug）。
  - 实体用 snake_case 列名 + DECIMAL(15,4) 金额；时间 DATETIME；字符集 utf8mb4。
  - 新增状态流转走既有状态机守卫模式；被引用数据阻止删除；机密客户行级过滤（列表/详情 404 防探测/下拉）。

### 前端 `packages/web`、`packages/portal`
- `src/{api,components,router,stores,styles,utils,views}`，views 按业务域分目录；全局组件（RuleHint/DocLinks/FactorySelect/ContractPicker/FileUpload/TopProgress 等）在 `main.ts` 注册并在 `components.d.ts` 声明。
- 设计系统：web 靛蓝 #1E3A5F + 亚麻米 #F5EDDC + 铁锈橙 #D17A40（主题收口在 `styles/theme.css`）；portal 墨绿 #2E8B78 + 炭黑 #23343A（`styles/theme.css` 覆盖 Vant 变量）。颜色只留语义（删除=红、审批=绿），日常操作统一主色。
- 单据级 Excel 导出：零新增依赖的「HTML 伪装 .xls」手法（公共层 `utils/docExcel.ts`：BOM 防乱码 / `mso-number-format` 防款号被当数字截断）；Excel 在线预览走 `utils/sheetPreview.ts` 动态 import exceljs（仅 .xlsx）。
- 约定：列表/详情显示**名称/单号，不显示裸 ID**；表格状态列 `fixed="right"`；时间用 `utils/format.ts` 本地化；错误提示统一走 errToast 去重。

### 文档与协作约定（强制）
- **每次 commit 必须同步更新 `HANDOFF.md`**（一句话现状/立即待办/最近变更），否则 `.githooks/pre-commit` 拦截；确无需更新用 `git commit --no-verify`。
- 业务字段/公式/状态机以设计稿 HTML 为准；业务规则改动同步更新 `docs/handbook/` 相应章节。
- 提交署名尾注等提交规范见 `CLAUDE.md`；勿把模型标识符写进入库产物。
- 推送凭据在 `.env.local`（已 gitignore，**切勿入库/写进文档**）。

## 八、安全考虑

- 生产 `synchronize:false`；CORS 生产收紧到 `WEB_ORIGIN`/`PORTAL_ORIGIN`；Swagger 生产关闭；`@nestjs/throttler` 限流；bcrypt 存密码；JWT 8h。
- 权限双层保险：后端 `@Roles` + 前端 `v-if=isAdmin`（仅 UI）；供应商门户接口按 token `type=supplier` 分流且只能见自己工厂数据。
- 客户机密：`customer_grant` 行级授权，未授权用户列表不可见、详情 404 防探测；导出件含成本/银行账号等敏感信息，仅内部流转。
- 上传：白名单类型（图片/PDF/Excel，不含 Word）、≤20MB、UUID 命名、路径解析防目录穿越（`FileService.resolvePath`）。
- 并发金额安全：分批付款悲观锁防超付；发票唯一索引；发号 Redis+DB 行锁兜底防重号。
- 机密文件：`.env*`、`.env.local` 严禁入库；种子弱密码交付前必改。

# CLAUDE.md — 项目工作准则与经验教训

> 面向在本仓库工作的 AI/工程师。**红线部分务必先读**——违反过、真出过生产事故。
> 📌 **接手先读 [`HANDOFF.md`](HANDOFF.md)**（现状/待办/最近变更）；本文是"红线/发版/运维/待办"权威版；完整建设记录/业务规则/事故复盘见 [`docs/项目记忆.md`](docs/项目记忆.md)。
> ⚙️ 新 clone 各配一次交接文档钩子：`git config core.hooksPath .githooks`（**每次变更须同步更新 `HANDOFF.md`**，否则 `pre-commit` 拦截）。

## 🔴 红线一：数据库结构变更，必须给存量库升级路径

**背景（务必理解，否则会再炸生产）**
- 生产 `NODE_ENV=production` → TypeORM `synchronize:false`（`packages/api/src/config/database.config.ts`）：**运行时绝不自动建表/加列**。
- 仓库**没有 migration 体系**（截至本文）。
- `infra/mysql/init.sql` 由 MySQL 容器的 `/docker-entrypoint-initdb.d` 加载，**只在数据卷为空（全新装机）时执行一次**，对已有数据的生产库**永不重跑**。

**结论：改 `init.sql` 只服务"全新装机"，对已上线的库毫无作用。**
任何新增/修改 **实体（entity）、列、表、枚举值** 的改动，除了同步 `init.sql`，**必须同时提供存量库升级**，否则发版后接口大面积 `Unknown column` / `Table doesn't exist`（合同/对账/结算/工厂等全线报错）。

**怎么做**
1. 改 `init.sql`（供全新装机）后，**跑 `python3 infra/scripts/gen-column-sync.py`** 重新生成 `hotfix-schema.sql` 的 AUTO 段——它从 HEAD `init.sql` 生成「全表 CREATE TABLE IF NOT EXISTS + 逐列补齐 + 类型不一致才 MODIFY」，**任意历史版本的存量库跑一遍即补到 HEAD**（2026-07-09 生产事故教训：手工维护 delta 清单必漏——当时 8 张表大面积 `Unknown column`，其中 7 列根本不在手工清单里）。枚举**值语义重命名**（如 SHIPPED→DONE）无法自动生成，须在 AUTO 段之前的「枚举语义迁移」手工块里：先 MODIFY 为旧∪新并集 → UPDATE 映射旧值 → AUTO 段自动收敛到 HEAD 定义。
2. **发版就一条命令 `bash infra/scripts/deploy.sh`**：它已把"升级前备份 → 应用幂等 `hotfix-schema.sql` → 校验关键列 → 再重启 API"**内置**在 API 重启之前，无需再手动区分"有没有动 schema"。（`upgrade-db.sh` 保留作单独/应急的结构升级工具。）
3. **本地必须用真 MySQL/MariaDB 实测**：加载"旧结构"→应用升级→与全新 `init.sql` 结构做**完整性 diff（应为空）**→**二次执行验证幂等**。（本仓库容器可 `apt-get install mariadb-server` 起一个隔离实例验证。）
4. 待办（尚未做）：引入正式 migration 体系（全新装机走 init.sql，存量升级走 migration），并把 `deep-test.sh` 真机门禁接入部署——**连真库没跑通不许发版**。

## 🔴 红线二：DB/集成类改动，mock 单测通过 ≠ 测过了

- `packages/api` 的单测用 **mock 仓储**（`getRepositoryToken → mock`），**不连真库**，天生看不见 schema 漂移、SQL 方言、索引、约束问题。
- Web/Portal 单测 **mock 了 API**，看不见后端错误。构建只证明"能编译"。
- **唯一**能抓真问题的是 `infra/scripts/deep-test.sh`（连真 API + 真 MySQL 的端到端）。
- **诚实原则**：不得用"构建通过 / mock 单测通过"冒充"端到端验证过"。凡改 DB / 集成路径，发版前必须**对真实数据库**跑通，并在汇报中如实说明测了什么、没测什么。

## ✅ 发版前必做清单
1. `pnpm --filter @i9/types build`（先于 api）+ api / web / portal 全部构建。
2. API 单测（`cd packages/api && npx jest -c jest.unit.config.js`）+ Web/Portal 单测（`vitest run`）+ tsc。
3. **若本次动了实体/`init.sql`**：把 delta 补进 `hotfix-schema.sql` 并**用真库验证**（见红线一）；`bash -n infra/scripts/deep-test.sh` 至少过语法，能连真机则实跑。
4. 部署后 `bash infra/scripts/health.sh` 确认全绿；`journalctl -u i9-api --since "2 min ago" | grep -iE "Unknown column|doesn't exist"` 应为空。

## 🚀 发版（登服务器后一条命令）
- **发版**：`cd /opt/i9/clothes-system && bash infra/scripts/deploy.sh`。内部顺序：拉 `main` → 构建四包 → **升级前整库备份 + 幂等结构升级（`hotfix-schema.sql`）+ 校验关键列**（都在 API 重启【之前】）→ 保证 MySQL/Redis 就绪（停了自动 `docker start`）→ 重启 `i9-api` → 健康检查 + 残留报错自检 → reload nginx。**不再区分"有没有动 schema"**；任一步失败会打印 `rollback.sh <上一版commit>`。
- 开关：`--skip-pull`（代码已就位）、`--skip-backup`（急，跳过备份）。
- **首次装机**（仅一次）：`bash infra/scripts/setup.sh`；随后改 `.env.production` 域名、`certbot` 配 HTTPS、crontab 加每日 `backup.sh`。
- **回滚**：`bash infra/scripts/rollback.sh <commit>`（只回代码；幂等结构升级只增不减，不回退列）。
- **验收**：`bash infra/scripts/health.sh` 全绿 + 新建一张测试单据（能出单号=Redis 通）。

## 🛠 运维脚本的坑（已修，勿回退）
- **探活别用 `curl -f`**：`/api/v1` 无根路由，正常返回 404；`-f` 会让 curl 非零退出触发 `|| echo 000` 拼出 `404000`。用 `curl -s`，接受 `2xx/3xx/4xx` 视为存活。
- **Redis 探活**用 `redis-cli --no-auth-warning`，并区分「容器未运行 / 密码不一致（WRONGPASS/NOAUTH）/ 无响应」。
  - 故障①「密码不一致」：`✗ redis` 多为 **`.env.production` 的 `REDIS_PASSWORD` 与运行中容器不一致**。修复：`docker compose --env-file .env.production up -d redis` 重建后 `health.sh` 复核。
  - 故障②「容器/镜像都没有 + Docker Hub 被墙」（国内 ECS 常见，`docker pull` 撞 `registry-1.docker.io` 超时）：**别跟 Docker Hub 死磕，改用原生 redis**——`dnf install -y redis` → 配 `requirepass`(与 env 一致)/`appendonly yes` → `systemctl enable --now redis`。App 连 `127.0.0.1:6379`，容器/原生皆可；`health.sh` 已兼容两种探测。（或用阿里云专属加速器 / `docker save|load` 离线搬运镜像。）
- **systemd 单元判定用 `systemctl cat <unit>.service`**，别用 `grep list-unit-files`（名称格式/分页易误判）。结构升级**不依赖**重启 API。

## 🔎 真机深测发现的典型坑（mock 永远测不出）
- **组合单号列宽**：`补料-母合同号-序号`、`JS-款号-序号`、`FH-款号-序号` 这类拼接单号很容易超过列宽（`contract_no` 曾为 `VARCHAR(20)`，补料号 21 字符 → 插入 `Data too long` → 建补料合同必 500）。新增/改动带前缀+段的单号时，核对列宽；`nextWithSegment` 已对段限长 20，`contract_no` 已放宽到 40。
- **响应分页封装**：列表接口返回 `{items,total,page,size}` 会被 `ResponseInterceptor` 展开为顶层 `total/page/size` + `data=items`。断言分页数量用**顶层 `total`**，不是 `data.total`。
- **DTO 字段命名**：DTO 用 camelCase（`shortName/extraTypes/canInvoice`），`forbidNonWhitelisted` 会拒绝 snake_case 未知字段。写脚本/前端 body 要对齐 DTO。
- **本地跑真机深测的姿势**（本仓库容器已验证可行）：`apt-get install -y mariadb-server redis-server` 起隔离实例 → 用 HEAD `init.sql` 建库 → `NODE_ENV=production`（synchronize:false，走 init.sql 真结构）起 `node dist/main.js` → `bash infra/scripts/deep-test.sh`。**这一趟能抓到 mock 单测全部漏掉的 schema/列宽/封装/校验问题。**

## 提交规范
- 提交署名尾注（每次都加）：
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  `Claude-Session: <会话链接>`
- **切勿**把模型标识符写进提交/PR/代码/任何入库产物。
- 已推送的提交**不重写历史**（stop-hook 若报 "Unverified" 多为本机缺 `allowedSignersFile` 的误报——提交实际已 SSH 签名，GitHub 会校验通过）。

## 架构速记
- monorepo（pnpm）：`packages/{types,api,web,portal}`；`types` 改动后先构建。
- 后端 NestJS + TypeORM + MySQL8 + Redis7；`api/v1` 前缀；JWT（`req.user.role` + `req.user.type` admin|supplier）；`@Roles`+`RolesGuard`。
- 单机 All-in-One 部署（单台 ECS）：nginx 反代 `/api`→:3000；web/portal 静态；MySQL/Redis 走 docker-compose（仅绑 127.0.0.1）；API 走 systemd `i9-api`。
- 运维脚本全在 `infra/scripts/`：`setup / deploy / rollback / backup / health / logs / upgrade-db / hotfix-schema / deep-test`。

## 📋 待办（认领后从此清单勾掉）
- **Redis 是硬单点**：单号生成（`NumberingService`）依赖 Redis 且**无兜底**，Redis 一挂 → 所有"新建单据"失败（读取不受影响）。计划加 DB 兜底（`sys_sequence` 行锁发号，Redis 恢复自动切回），使 Redis 挂了只降速、不阻断建单。
- 引入正式 **migration 体系**（全新装机走 `init.sql`，存量升级走 migration），替掉临时的 `hotfix-schema.sql`。
- 把 `deep-test.sh` **真机门禁接进部署/CI**——连真库没跑通不许发版。
- **GitHub Actions merge→deploy**：合并 `main` 自动 SSH 上服务器跑 `deploy.sh`（需在 GitHub 存部署 SSH 密钥），实现"合并即发版"。
- 运维 P0：**异地备份（含 `/data/uploads`）+ HTTPS + 恢复演练 + 告警**。当前 `backup.sh` 仅 `mysqldump`、**不含上传文件**，且备份只在本机（实例挂了陪葬）。

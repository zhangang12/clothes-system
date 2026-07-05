# CLAUDE.md — 项目工作准则与经验教训

> 面向在本仓库工作的 AI/工程师。**红线部分务必先读**——违反过、真出过生产事故。

## 🔴 红线一：数据库结构变更，必须给存量库升级路径

**背景（务必理解，否则会再炸生产）**
- 生产 `NODE_ENV=production` → TypeORM `synchronize:false`（`packages/api/src/config/database.config.ts`）：**运行时绝不自动建表/加列**。
- 仓库**没有 migration 体系**（截至本文）。
- `infra/mysql/init.sql` 由 MySQL 容器的 `/docker-entrypoint-initdb.d` 加载，**只在数据卷为空（全新装机）时执行一次**，对已有数据的生产库**永不重跑**。

**结论：改 `init.sql` 只服务"全新装机"，对已上线的库毫无作用。**
任何新增/修改 **实体（entity）、列、表、枚举值** 的改动，除了同步 `init.sql`，**必须同时提供存量库升级**，否则发版后接口大面积 `Unknown column` / `Table doesn't exist`（合同/对账/结算/工厂等全线报错）。

**怎么做**
1. 把本次 schema delta 追加进幂等升级脚本 `infra/scripts/hotfix-schema.sql`（存储过程守卫：逐列/逐表判断 `information_schema`，已存在即跳过；`MODIFY` 用于扩枚举/放宽约束/加宽长度，可等价重放）。
2. 生产执行 `bash infra/scripts/upgrade-db.sh`：**先整库备份 → 应用幂等 SQL → 校验关键表/列 → 重启 API → 健康检查 + 残留报错自检**。
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

## 🛠 运维脚本的坑（已修，勿回退）
- **探活别用 `curl -f`**：`/api/v1` 无根路由，正常返回 404；`-f` 会让 curl 非零退出触发 `|| echo 000` 拼出 `404000`。用 `curl -s`，接受 `2xx/3xx/4xx` 视为存活。
- **Redis 探活**用 `redis-cli --no-auth-warning`，并区分「容器未运行 / 密码不一致（WRONGPASS/NOAUTH）/ 无响应」。
  - 常见故障：`✗ redis (no PONG)` 多为 **`.env.production` 的 `REDIS_PASSWORD` 与运行中容器不一致**（容器起于旧密码）。排查：
    `docker ps | grep i9_redis` 看是否在跑；`docker exec i9_redis redis-cli -a <env里的密码> --no-auth-warning ping`。
    修复：使容器与 env 一致（`docker compose --env-file .env.production up -d redis` 重建），再 `health.sh` 复核。
- **systemd 单元判定用 `systemctl cat <unit>.service`**，别用 `grep list-unit-files`（名称格式/分页易误判）。结构升级**不依赖**重启 API。

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

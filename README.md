# I9 服装制造管理系统

面向服装外贸/制造企业的全流程数字化协同系统。覆盖 **样衣 → 报价 → 订单 → 合同 → 供应商门户 → 对账 → 付款 → 结算** 的完整业务闭环，实现字段级、公式级、状态机级对齐业务设计稿的产品级实现。

## 业务模块（8 张单据，业务流顺序）

| 模块 | 关键能力 |
|---|---|
| **基础资料**（工厂/客户） | 工厂 35 字段+联系人子表；客户 47 字段+联系人/开户银行/快件三子表；编号自动生成（厂商 S001 / 客户 CN001）；联系人自动回填、名称唯一、被引用阻止删除、客户机密授权 |
| **样衣管理** | 状态机 待派单→打样中→已寄出→已寄回→已对账→已完成→已成单；材料明细子表（17列）+寄样跟踪；业务/版师双视图；工时金额=件数×单价 |
| **客户报价** | 状态机 草稿→已报价→客户调整→已成单；报价明细+费用明细双子表；**含损金额=人民币单价×报价耗用×(1+损耗)**；费用自动带 6 行；从样衣一键导入；转销售合同联动 |
| **订单管理** | 状态机 草稿→已下单→已生成合同→生产中→已完成；**采购量=大货总数×单件耗用×(1+损耗)**，整数类材料进 1；尺码数量搭配汇总；佣金/生产工厂；从报价一键导入 |
| **合同管理** | 材料/加工/补充合同；付款条款（定金+中期+尾款=100%）；账期（材料45/加工30天）；材料合同自动从订单用料核算带出快照 |
| **供应商门户（H5）** | 四步顺序锁定 🔖盖章→📦发货→🧾对账→💵开票；供应商仅见自己的合同；快照锁定单价 |
| **对账付款** | 合同/非合同对账；发票=对账金额（±¥0.01）校验；超付拦截；付款申请审批流 |
| **结算清单** | 成本单价/毛利/毛利率；退税=含税采购额×税率差；含退税净利/不含退税净利 |

## 技术栈

- **Monorepo**（pnpm workspace）：`packages/{types,api,web,portal}`
- **后端** `api`：NestJS 10 + TypeORM + MySQL 8 + Redis 7（JWT 鉴权、角色守卫、全局校验/异常/响应拦截、限流）
- **PC 管理端** `web`：Vue 3 + Element Plus（服装制造业风：靛蓝 #1E3A5F + 亚麻米 #F5EDDC + 铁锈橙 #D17A40）
- **供应商门户** `portal`：Vue 3 + Vant（H5 移动端）
- **共享契约** `types`：全模块 TS 类型/枚举

## 产品级能力

- **文件上传**：图片/PDF/Excel（≤20MB），日期分目录 + UUID 命名，经 `/api/v1/uploads` 端点上传与读取（无需改 nginx）；已接入样衣图、订单附件 5 类、报价图。
- **批量导入**：工厂/客户 CSV 导入向导（下载模板→上传或粘贴→数据校验→逐行入库结果）。
- **快照锁定**：报价→合同、供应商盖章、对账、结算创建时锁定上游值，下游不受上游后续修改影响。

## 本地开发

```bash
pnpm install
pnpm --filter @i9/types build     # 先构建共享类型
# 准备 MySQL/Redis（可用 infra/docker-compose.yml）并导入 infra/mysql/init.sql
pnpm dev:api      # http://localhost:3000/api/v1  (Swagger: /api-docs)
pnpm dev:web      # PC 管理端
pnpm dev:portal   # H5 供应商门户
```

默认种子账号（密码均 `Admin@123`）：`admin` / `business_user` / `finance_user` / `pm_user`；供应商门户 `supplier1`。

## 生产部署（单台 ECS + Docker）

```bash
cp .env.example .env.production      # 填写 DB/Redis/JWT/CORS/UPLOAD_ROOT
bash infra/scripts/setup.sh          # 生成密钥、装依赖
docker compose -f infra/docker-compose.yml up -d   # MySQL + Redis
bash infra/scripts/reset-db.sh       # 建表 + 种子（结构变更后必跑）
bash infra/scripts/deploy.sh         # 构建四包 + 启动 API + 发布静态站
bash infra/scripts/health.sh         # 健康检查
```

关键环境变量见 `.env.example`：`DB_* / REDIS_* / JWT_SECRET / UPLOAD_ROOT / WEB_ORIGIN / PORTAL_ORIGIN`。
上传文件持久化在 `UPLOAD_ROOT`（默认 `/data/uploads`），生产请挂载持久卷。

## 测试与验收

```bash
pnpm --filter @i9/api test:unit      # 后端单元测试（147）
pnpm --filter @i9/web test           # 前端单元测试（82）
bash infra/scripts/deep-test.sh      # 端到端业务回归（12 组，含公式/状态机/权限/上传/导入）
```

> 服务器验收：`git reset --hard origin/main && reset-db.sh && deploy.sh --skip-pull && deep-test.sh`

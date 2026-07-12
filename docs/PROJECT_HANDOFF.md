# AgentShop 项目移交说明

更新时间：2026-07-12  
主题：The Empty Store - 当所有顾客都是 Agent

## 1. 项目目标

AgentShop 是一个面向黑客松现场演示的 Agent Commerce 原型，展示买家完全由 Buyer Agent 代理后，Buyer Agent、Seller Agent、供应链 Agent、Intent Router、LLM 与 RepChain 如何完成：

```text
需求表达
-> 意图结构化
-> 卖家发现与排名
-> 机器询价和证据核验
-> 自动议价与订单
-> 履约鉴证
-> 信用和排名回流
```

项目不是生产级电商系统，也不声称已经接入真实支付、物流、认证机构或区块链。演示重点是让 Agent 间的商业协作过程可执行、可观察、可回放和可审计。

## 2. 当前代码状态

- 仓库：`https://github.com/cedar-cli/agentshop`
- 主分支：`main`
- 前端入口：`http://127.0.0.1:5173`
- 后端入口：`http://127.0.0.1:3000`
- Node.js：`>= 20`
- 前后端为两个独立 npm 项目。
- 浏览器只访问 5173，Vite 将 `/api` 和 `/health` 代理到 3000。

## 3. 技术架构

```text
React 18 + TypeScript + Vite + Zustand
                |
                | HTTP / SSE
                v
Fastify + OpenAI SDK + Zod
                |
                v
TransactionService + EventRouter
                |
                v
SQLite EventStore + Hash Chain
```

### 3.1 前端

- React 18
- TypeScript
- Vite 5
- Zustand
- Lucide React
- Canvas 2D / SVG
- Vitest + Testing Library
- Playwright

### 3.2 后端

- Node.js 20+
- Fastify 5
- OpenAI SDK
- Zod Structured Output
- better-sqlite3
- Vitest

### 3.3 两套状态来源

项目目前同时存在两套状态系统：

1. 后端真实 transaction
   - 用于真实 LLM 调用、Router、SSE、事件存储和 Hash Chain。
   - 买家真实采购、主动销售、需求网络和意图增长均使用此链路。

2. 前端 Zustand 模拟世界
   - 用于网络拓扑、信用树、生态演化和规模化 Agent 世界展示。
   - 当前尚未完全订阅后端真实 transaction。

## 4. 目录结构

```text
agentshop/
|- src/
|  |- components/
|  |  |- consumer/       买家端
|  |  |- merchant/       商家端
|  |  |- topology/       网络拓扑
|  |  `- shared/         顶栏、回放、信用链等公共组件
|  |- core/              Zustand 模拟世界、交易引擎和信用模型
|  |- demo/              前端 Fixture 与 transaction 适配器
|  |- hooks/             后端 API/SSE hooks
|  `- styles/            全局设计令牌
|- server/
|  |- src/
|  |  |- agents/         Buyer/Seller 等 Agent
|  |  |- app/            TransactionService、Inbox、卖家投影
|  |  |- llm/            OpenAI Agent 与 fallback
|  |  |- protocol/       事件类型和 Zod Schema
|  |  |- router/         EventRouter
|  |  |- scenario/       各演示工作流
|  |  |- server/         Fastify 路由与 SSE
|  |  `- store/          SQLite EventStore
|  `- tests/             后端、协议和工作流测试
|- e2e/                  Playwright 桌面与移动端测试
|- docs/                 项目说明文档
`- README.md
```

## 5. 买家端功能

### 5.1 消费 Agent

- 展示购买历史和当前委托。
- 展示约束、候选卖家、评分、议价、订单、履约和鉴证事件。
- 支持记录回放。
- 支持价格、时效、品质、售后权重的反事实推演。

### 5.2 出差轻薄本采购

这是普通的“人提出需求，Buyer Agent 代为采购”场景。

真实执行内容：

- 用户提交自然语言需求。
- LLM 提取预算、重量、续航、交期和全国联保条件。
- 三个 Seller Agent 生成报价。
- 确定性规则校验硬约束并计算排名。
- LLM 参与议价。
- 高值订单等待人工确认。
- 确认后生成订单事件。

模拟内容：

- 外部物流。
- 商品序列号和质检。
- 最终履约鉴证结果。

### 5.3 家庭日用品补库

这是“无需人类采购指令”的主动购买场景。

- 库存预测触发采购。
- 校验长期授权、单笔限额、月度额度和冷却期。
- 自动比较卖家报价。
- 自动完成组合议价。
- 自动下单并更新库存。
- 人类交互次数为 0。
- 完成摘要进入买家 Inbox。

### 5.4 主动服务

目前展示四种主动服务：

- 家庭日用品补库。
- 稀缺资源抢购。
- 高值商品蹲低价。
- 二手商品寻源与托管验机。

家庭补库已接真实后端，其余场景保留 Fixture 作为演示案例。

### 5.5 Inbox

- 接收主动服务结果和卖家提案。
- 展示事实核验、价值评分和 Agent 判断。
- 支持自动完成、待决策和拦截分类。
- 支持长期记忆建议。
- 可从 Inbox 打开共享 transaction，查看买家端和商家端共同使用的事件链。

## 6. 商家端功能

### 6.1 交易战情

- 合并后端真实 transaction 与静态 Fixture。
- 实时 transaction 排在历史案例前面。
- 支持查看买卖双方沟通、订单结果、胜负依据和编队影响。
- 通过 `/api/merchant/transactions` 获取初始数据。
- 通过 `/api/merchant/transactions/events` 接收 SSE 更新。

以下场景完成后会进入交易战情：

- 轻薄本采购。
- 家庭补库。
- 主动销售。
- 新生儿床品采购。
- 意图增长。

### 6.2 需求网络

用于表达“需求反向组织供给和分销”。

- 接收买家端产生的真实 Intent。
- 真实买家 Intent 标记为 `LIVE C-AGENT`。
- LLM 将自然语言需求转换为结构化 Intent。
- 展示市场聚合、选品预测、供应协商、模拟工厂、分销合约和规模成交。

当前限制：

- 买家 Intent 可以进入网络，但最终选品候选仍是确定性 Fixture。
- 市场需求规模、工厂批次、分销网络和 GMV 是模拟数据。

### 6.3 主动销售

用于表达“商品主动找到授权买家”。

- Seller Agent 读取商品并构建 Product Passport。
- LLM 生成结构化商品摘要和提案。
- Consent Router 区分 Open、Limited、Closed Inbox。
- Closed Inbox 不向 Seller Agent 暴露画像字段。
- Consumer Agent 自动比较候选商品。
- 满足长期授权时自动成交，人类点击 0 次。
- 提案和成交状态实时进入买家 Inbox。

### 6.4 意图增长

用于表达“卖家的商品能力从输掉的 Agent 交易中生长”。

完整演示链路：

1. 生成首次 Buyer Intent 排行榜。
2. Buyer Agent 选择前三个 Seller Agent 沟通。
3. 三组 Buyer/Seller 对话产生 12 条实时事件。
4. LumaCalm 因字段覆盖不足首次落选。
5. LLM 从对话中提取四个 Intent：
   - `wash_temperature`
   - `use_context`
   - `wash_cycles`
   - `bulk_terms`
6. Product Output 从 `v2.1` 升级为 `v2.2`。
7. Intent Coverage 从 `61%` 提升到 `91%`。
8. 新 Buyer Intent 重新匹配，评分从 `78` 提升到 `96`。
9. A2A 自动议价形成 80 套、单价 `$112`、总额 `$8,960` 的订单。
10. 订单包含 9 天 SLA 和延期 3% 赔付。
11. 模拟履约写入 RepChain，展示 `+12 TRUST`。
12. Intent Rank 从 `#3` 提升到 `#1`。

该场景共生成 32 条 Hash Chain 事件，并会进入卖家交易战情。

### 6.5 销售机制

- 约束锚定式精准推销。
- 合约裂变式分销。
- 履约声誉排序竞争。
- 许可广播推销。

### 6.6 编队与履约

- 员工 Agent 编队。
- 上下游供应链拓扑。
- 履约信用树。
- 策略沙盒。
- 生态演化。

## 7. 网络拓扑功能

网络拓扑包含两个视图：

### 7.1 剧情演示

跟随一笔模拟交易走完：

```text
需求
-> 竞价
-> 信用择优
-> 供应链递归采购
-> 履约
-> 鉴证上链
-> 信用回写
```

### 7.2 全网全景

- 展示买家、卖家、供应链和工厂 Agent。
- 展示活跃交易链路。
- 支持信用热力和供应链聚焦。
- 支持刷分、伪造交易和违约风控演示。

当前限制：网络拓扑读取前端 Zustand 模拟世界，尚未直接订阅后端 transaction/SSE。

## 8. 后端核心设计

### 8.1 TransactionService

`server/src/app/transaction-service.ts` 是当前后端编排中心，负责：

- 创建 transaction。
- 调度不同场景 workflow。
- 管理状态：`queued / running / awaiting-approval / completed / failed`。
- 将事件发布到 SSE。
- 投影卖家交易列表。
- 投影买家 Inbox。
- 捕获买家 Intent 并注入需求网络。

### 8.2 EventRouter

- 所有 Agent 事件统一经过 Router。
- Router 校验事件 Schema。
- Router 写入 EventStore。
- Router 通知 Agent handler 和观察者。
- 支持逐事件播放节奏。

### 8.3 EventStore 与 Hash Chain

- 使用 SQLite 保存事件。
- 每个 transaction 单独形成 Hash Chain。
- 每条事件保存 `previousHash` 和当前 `hash`。
- `/api/transactions/:id` 返回事件和 `chainValid`。

### 8.4 LLM 与 fallback

- 默认模型由 `OPENAI_MODEL` 指定。
- 未指定时使用 `gpt-5.6-luna`。
- 所有关键 LLM 工作流都有确定性 fallback。
- LLM 输出使用 Zod Structured Output 校验。
- 排名、硬约束和经营护栏不直接交给 LLM 决定。

## 9. 主要 API

```text
GET  /health
GET  /api/runtime
GET  /api/transactions
GET  /api/transactions/:id
GET  /api/transactions/:id/events

GET  /api/merchant/transactions
GET  /api/merchant/transactions/events

GET  /api/active-services
POST /api/active-services/:id/trigger

GET  /api/inbox
GET  /api/inbox/events
POST /api/inbox/:id/memory
POST /api/inbox/:id/archive

GET  /api/seller/products
POST /api/seller/products/:id/activate
POST /api/seller/demand-network
POST /api/seller/intent-growth

POST /api/demo/newborn-bedding
POST /api/demo/laptop-purchase
POST /api/demo/household-restock
POST /api/transactions/:id/approve
```

## 10. 真实与模拟边界

### 10.1 真实运行

- OpenAI SDK 请求与结构化输出。
- LLM fallback。
- Transaction 状态机。
- Router 和 SSE。
- Zod 协议校验。
- SQLite 事件存储。
- Hash Chain 计算和验证。
- 买家与卖家共享 transaction。
- 买家 Intent 注入需求网络。
- Intent 提取和商品字段更新事件。
- 订单与排名计算事件。

### 10.2 模拟数据

- 数万 Buyer Agent 和市场规模。
- 286 轮历史对话、219 条历史信号。
- 外部认证机构。
- 真实支付、物流和工厂。
- Orders/day、Shortlist Rate 和市场 GMV。
- 网络拓扑中的规模化交易世界。

UI 中的规模数据、工厂、分销和外部履约必须继续明确显示 `SIMULATED` 或 `SIMULATED PROJECTION`。

## 11. 启动方式

### 11.1 启动前端

```powershell
cd C:\Aproject\黑客松2\agentshop
npm install
npm run dev
```

访问：`http://127.0.0.1:5173`

### 11.2 启动后端

```powershell
cd C:\Aproject\黑客松2\agentshop\server
npm install
npm run dev
```

健康检查：`http://127.0.0.1:3000/health`

### 11.3 环境变量

参考 `server/.env.example`：

```dotenv
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5.6-luna
OPENAI_REASONING_EFFORT=low
DEMO_LLM_ENABLED=true
DEMO_STEP_DELAY_MS=500
```

真实配置保存在 `server/.env`。禁止提交真实 API Key。

### 11.4 LLM 连通性检查

```powershell
cd server
npm run llm:smoke
```

## 12. 测试与构建

### 12.1 前端

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

最近一次验证结果：

- 11 个 Vitest 测试文件通过。
- 38 项前端测试通过。
- Playwright 桌面与移动端 15 项通过。
- 1 项移动端反事实面板测试按设计跳过。

### 12.2 后端

```powershell
cd server
npm run typecheck
npm test
npm run build
```

最近一次验证结果：

- 15 个测试文件通过。
- 129 项后端测试通过。

## 13. 关键文件

```text
server/src/app/transaction-service.ts
server/src/router/event-router.ts
server/src/store/event-store.ts
server/src/protocol/events.ts
server/src/protocol/schemas.ts

server/src/scenario/laptop-purchase-workflow.ts
server/src/scenario/household-restock-workflow.ts
server/src/scenario/active-sales-workflow.ts
server/src/scenario/demand-network-workflow.ts
server/src/scenario/intent-growth-workflow.ts

src/components/consumer/ConsumerModule.tsx
src/components/consumer/ConsumerInbox.tsx
src/components/merchant/MerchantModule.tsx
src/components/merchant/MerchantDealRoom.tsx
src/components/merchant/ActiveSalesRouter.tsx
src/components/merchant/DemandNetwork.tsx
src/components/merchant/IntentGrowthField.tsx
src/components/topology/TopologyModule.tsx
```

## 14. 已知缺口与后续优先级

### P1：商品更新尚未持久化到共享目录

意图增长会产生 Product Output `v2.2` 事件，但主动销售仍读取固定商品 Fixture。下一步应增加共享 Product Catalog，让主动销售和需求网络读取更新后的商品版本。

### P1：意图增长输入仍是预设对话

买家 Intent 已进入需求网络，但意图增长尚未直接消费需求网络和真实买家 transaction。下一步应让 workflow 接收已有 Intent 或 transactionId。

### P1：信用和排名没有回写网络拓扑

`+12 TRUST` 和 `#1` 当前存在于后端事件和卖家页面中，但未改变 Zustand 模拟世界中的卖家节点。

### P2：需求网络选品候选仍为 Fixture

真实 Intent 会被展示和结构化，但最终选品候选暂时由固定规则返回。

### P2：前端模拟世界和后端世界尚未统一

短期可以继续并存用于黑客松演示；长期应让拓扑和信用树订阅后端 transaction 与 attestation 投影。

## 15. 演示建议

推荐现场演示顺序：

1. 买家端运行轻薄本真实 LLM 采购。
2. 切换卖家交易战情，展示同一 transaction。
3. 运行主动销售，展示买家 Inbox 自动收到并成交。
4. 运行需求网络，展示 `LIVE C-AGENT` Intent。
5. 运行意图增长，展示落选、学习、商品升级、二次赢单和升榜。
6. 最后进入网络拓扑，解释规模化 Agent 世界和 RepChain 信用机制。

对外说明建议：

> 我们模拟了市场规模和外部履约，但 LLM 意图提取、Agent Router、订单事件、买家/卖家共享 transaction 和 Hash Chain 都在现场真实运行。

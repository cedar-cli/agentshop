# 新建委托「真实商品搜索」改造方案

> 目标：新建委托（消费者输入购物意图）时，**真的按输入内容做一次搜索**，
> 从数据集 `fine_items_eval_train_all.json` 召回真实商品作为候选，
> 让后续「比较 / 议价 / 下单 / 上链」基于真实商品跑，而不是永远那三台写死的笔记本。
>
> 技术选型（已确认）：
> - 检索：**SQLite + FTS5 全文检索**（项目已装 `better-sqlite3`，零新依赖）
> - 工作流：**复用现有骨架，只换货架**（不重写 laptop 工作流，只把候选来源从写死卖家换成搜索结果）
> - 交付：先出本文档，评审通过后再动代码

---

## 一、数据集摸底结论

| 项目 | 结论 |
|---|---|
| 文件 | 根目录 `fine_items_eval_train_all.json` |
| 体积 | **133.8 MB / 4,169,969 行** |
| 格式 | 单个大 JSON 数组 `[ {...}, {...} ]` |
| 品类 | 9 大域：家居家装 / 家用电器数码 / 美妆个护健康 / 母婴儿童 / 服饰鞋包饰品 / 食品饮品 / 运动户外交通 / 休闲娱乐文教 / 生产材料农用品 |
| 字段稳定性 | 采样多条，顶层 key 完全一致 |

### 单条记录结构（真实样例，字段稳定）

```jsonc
{
  "asin": "747848614498",              // 商品唯一 id
  "domain_zh": "家居家装",             // 一级域（9 类）
  "title": "梦洁宝贝泰国乳胶枕头…",     // 商品标题（搜索主字段）
  "sub_title": "",
  "shop_name": "梦洁宝贝旗舰店",        // ★ 可直接当「卖家/店铺」
  "category": "床上用品›枕头›乳胶枕",   // 类目路径（搜索字段）
  "full_description": "…",             // 描述
  "attribute": ["泰国","进口","天然","护颈椎","枕芯"],  // ★ 属性标签（搜索/匹配字段）
  "pricing": [999],                    // ★ 价格区间 [min] 或 [min,max]
  "customization_options": {           // SKU 变体，每个含独立 price
    "颜色分类": [ { "value":"…","price":999,"asin":"…","image":"…" }, … ]
  },
  "images": ["https://…"],             // 商品图
  "instructions": [ {                  // ★ 数据集自带的「用户购买指令」
     "instruction": "帮我推荐一款适合5岁小孩的乳胶枕…预算1000以下。",
     "instruction_simple": "给我推荐一款天然乳胶枕，1000以内。",
     "options": ["【推荐4-6岁】…"],     // 该指令期望命中的 SKU（可做 eval 对照）
     "attributes": ["泰国","进口",…]
  } ],
  "user_persona": { … }                // 用户画像（本期不用，未来可做个性化）
}
```

### 关键可用性判断

1. **`instructions[].instruction` 就是天然的「委托意图」语料** —— 可以直接拿来做示例意图、做 eval 对照（数据集本身是「指令 → 期望商品」的评测集）。
2. **`shop_name` 可直接映射成「卖家」**，`pricing` / `attribute` / `category` 可映射成现有 `LaptopSellerFact` 需要的字段。
3. 每条记录只有 1 条 instruction、1 个店铺 —— 所以「一次委托召回 N 个候选」= **召回 N 条不同的商品记录**（每条来自不同商品/店铺），拼成候选卖家列表。

### 店铺（卖家）从哪来 —— 已核实并定案

采样 2285 条商品 → **2134 家不同店铺，平均每家仅 1.07 个商品**，`shop_name` 无空值。
即数据集里**店铺与商品近似一对一**，`shop_name` 是「该商品的卖家标签」，不是「一个有很多货的店铺」。

因此确定**候选语义**（已拍板）：

> **搜出的每个商品 = 一个候选卖家。**
> FTS5 按 requestText 召回 Top-N 条**相似但不同**的商品，每条商品连带它自己的 `shop_name`
> 作为一个候选卖家。「比较」= 在这批相似商品里做选品 + 比价，选综合分最高的一个。

对比现有笔记本 demo（3 家店卖**同一台**笔记本、横向比价）——本方案是「一堆相似商品挑一个」，
**更贴近真实电商搜索**。落地要点：
- 候选来源 = `searchProducts(requestText)` 的 Top-N 条商品记录，**不再是写死的 3 家**。
- 每个候选的卖家名 = 该商品的真实 `shop_name`（如「梦洁宝贝旗舰店」）。
- 每次委托的候选**随搜索内容变化**：搜枕头出枕头店，搜相机出相机店。
- 硬约束（预算/属性命中）逐个候选校验；`scoreLaptopProposal` 打分骨架复用，
  但「同款比价」语义调整为「相似商品选优」，打分维度含选品匹配度（见 §4 阶段 1.3）。

---

## 二、核心障碍与应对

| 障碍 | 说明 | 应对 |
|---|---|---|
| **文件太大不能整读** | `JSON.parse` 134MB → 内存膨胀到 GB 级，进程易 OOM、启动极慢 | 一次性预处理脚本**流式解析**灌进 SQLite，运行时**只查 db，不碰大文件** |
| **每次搜索不能全表扫** | 416 万条，全扫一次要数秒~数十秒 | FTS5 倒排索引，毫秒级返回 Top-N |
| **中文分词** | FTS5 默认 tokenizer 对中文按整串处理，召回差 | 用 FTS5 的 `trigram` tokenizer（三元组，对中文子串匹配友好，SQLite 3.34+ 内置），或预处理时把 `title/attribute/category` 拼成检索文本 |
| **价格/交期/售后等字段缺失** | 数据集只有 price/attribute，没有交期/续航/保修/信誉 | 现有工作流需要这些维度打分。用**确定性派生**：从 `attribute`/`category`/`shop_name` 规则化推导 metrics（timeliness/spec/afterSales/price）+ reputation，保证可复现、可解释 |

---

## 三、改造后的目标链路

```
消费者新建委托，输入："给5岁小孩买个天然乳胶枕，1000以内"
        │
        ▼  POST /api/demo/consumer-delegation { requestText, serviceMode }
┌─────────────────────────────────────────────────────────────┐
│ 后端 consumer-delegation 分支（transaction-service.ts）        │
│                                                               │
│  ① productSearch(requestText)  ← 新增：FTS5 全文检索           │
│      → 从 catalog.db 召回 Top-N 真实商品（乳胶枕/婴儿枕…）      │
│      → 发布事件 delegation.search.completed { hits, topN }     │
│                                                               │
│  ② 把召回商品适配成 SellerFact[]（换货架，不改骨架）           │
│      shop_name→卖家名, pricing→价, attribute→metrics 派生      │
│                                                               │
│  ③ 复用 laptop 工作流骨架：                                    │
│      LLM 解析意图 → 对真实候选报价/打分 → 议价 → 选中          │
│                                                               │
│  ④ 自动下单 → 履约 → 上链鉴证（原样保留）                     │
└─────────────────────────────────────────────────────────────┘
        │  SSE 实时推事件
        ▼
前端决策日志真实显示：
  "搜索命中 128 件 → 召回 Top-6 → 逐个比较 → 云仓乳胶枕综合分最高 → 议价 → 下单上链"
```

**「只换货架」的含义**：现有 `runLaptopPurchaseUntilApproval` 的事件序列、打分函数 `scoreLaptopProposal`、议价逻辑、前端 `EventRow` 全部复用；唯一替换的是**候选来源**——从 `laptopSellerFacts`（写死 3 家）换成 `productSearch()` 的返回值。

---

## 四、落地拆解（文件级）

> 命名遵循现有风格：`scenario/` 放工作流与领域数据，`llm/` 放模型 agent，`server/` 放路由。

### 阶段 1：数据层（预处理 + 检索）

**1.1 一次性预处理脚本** `server/scripts/build-catalog.ts`（新增）
- 用 `fs.createReadStream` + 流式 JSON 解析（自己实现顶层对象配平切分，避免整读；或引入轻量流式解析器 `stream-json`，二选一，方案里默认自己切分以零依赖）
- 每条商品抽取检索需要的字段，写入 `server/data/catalog.db`
- 建表：
  ```sql
  CREATE TABLE products(
    asin TEXT PRIMARY KEY, domain TEXT, title TEXT, shop_name TEXT,
    category TEXT, attributes TEXT,        -- JSON 数组字符串
    price_min INTEGER, price_max INTEGER,
    image TEXT, instruction TEXT           -- 保留一条示例指令
  );
  CREATE VIRTUAL TABLE products_fts USING fts5(
    title, category, attributes, shop_name,
    content='products', content_rowid='rowid',
    tokenize='trigram'                     -- 中文友好
  );
  ```
- 运行方式：`cd server && npx tsx scripts/build-catalog.ts`（一次性，产出 `catalog.db` 后即可反复用）
- **进度输出**：每 10 万条打印一次，明确总耗时与最终条数（不静默）

**1.2 检索服务** `server/src/scenario/product-catalog.ts`（新增）
- 启动时 `new Database('data/catalog.db', { readonly: true })`
- `searchProducts(query: string, opts): ProductHit[]`
  - 对 query 做轻量归一化（去标点、可选停用词），FTS5 `MATCH` 查询
  - 用 `bm25()` 排序取 Top-N（默认 N=6，够拼候选列表）
  - 返回结构化 `ProductHit[]`
- **降级**：若 `catalog.db` 不存在（没跑预处理），`searchProducts` 返回空 → 上层回退到现有写死卖家，**保证不 break 现有 demo**

**1.3 商品 → 卖家事实映射** `server/src/scenario/product-to-seller.ts`（新增）
- `toSellerFact(hit: ProductHit): SellerFact`
- 派生规则（确定性、可解释）：
  - `price` = `price_min`（或 SKU 最低价）
  - `metrics.price` = 相对候选集价格分位反推（越便宜分越高）
  - `metrics.spec` = attribute 命中意图关键词数量 × 系数
  - `metrics.afterSales` / `timeliness` = 按 `shop_name` 是否含「旗舰店/官方」、`category` 类型给基线 + 稳定 hash 抖动（可复现）
  - `reputation` = 基于 shop_name 的稳定 hash 映射到 70~95

### 阶段 2：工作流接入（换货架）

**2.1 通用意图 schema** `server/src/protocol/`（扩展，不破坏 laptop）
- 现有 `LaptopIntent` 是笔记本专用（含 maxWeightKg/minBatteryHours）。新增一个**通用意图** `DelegationIntent`：
  ```
  { product, budgetCny, priorities{timeliness,spec,price,afterSales}, mustHave: string[] }
  ```
- 或：保留 laptop 结构，仅泛化必需字段。评审时定（见「待决策」）。

**2.2 通用工作流** `server/src/scenario/delegation-purchase-workflow.ts`（新增）
- 结构**照抄** `laptop-purchase-workflow.ts` 的事件序列与函数骨架
- 差异点：
  - 开头多一步 `searchProducts(requestText)` → 发 `delegation.search.completed`
  - 候选来源 = 搜索结果映射的 `SellerFact[]`（而非 `laptopSellerFacts`）
  - 硬约束校验从「重量/续航/联保」改成「预算 + mustHave 属性命中」
  - 其余（报价/打分/议价/下单/履约/鉴证）逻辑保持一致
- 事件 `type` 前缀用 `delegation.*`（新增到协议事件枚举），前端已有的 `EventRow` 泛化渲染即可

**2.3 LLM agent 泛化** `server/src/llm/openai-delegation-agent.ts`（新增或复用）
- `parseIntent`：system prompt 从「轻薄本需求」改成「通用购物需求」，输出通用意图
- `generateProposal` / `negotiate`：把「轻薄本商家」改成「商品卖家」，其余复用

**2.4 接线** `server/src/app/transaction-service.ts`
- `consumer-delegation` 分支（第 425 行）从调用 `runLaptopPurchaseUntilApproval` 改为调用新的 `runDelegationPurchase`
- **`serviceMode` 真正生效**：目前后端丢弃了 `serviceMode`；接入后按 mode 影响搜索/打分（如 `lowprice` 抬高价格权重）。本期最小实现可先透传+日志，不强做差异化（见「待决策」）。

### 阶段 3：前端联动（最小改动）

- `useConsumerDelegations.ts` 的 `DELEGATION_EVENTS` 数组补上 `delegation.search.completed` 等新事件类型（否则 SSE 收不到）
- `delegationRuntime.ts` 的 `adaptDelegation` 适配新事件 → 决策日志新增「搜索命中」条目
- 前端**无需大改**：EventRow 已是通用渲染，主要是把新事件类型登记进去

---

## 五、改动文件清单

| 文件 | 动作 | 说明 |
|---|---|---|
| `server/scripts/build-catalog.ts` | 新增 | 一次性预处理：大 JSON → catalog.db |
| `server/data/catalog.db` | 生成物 | 预处理产出（**需加 .gitignore**） |
| `server/src/scenario/product-catalog.ts` | 新增 | FTS5 检索服务 |
| `server/src/scenario/product-to-seller.ts` | 新增 | 商品→卖家事实映射 |
| `server/src/scenario/delegation-purchase-workflow.ts` | 新增 | 通用采购工作流（照抄 laptop 骨架） |
| `server/src/llm/openai-delegation-agent.ts` | 新增 | 通用意图/报价/议价 agent |
| `server/src/protocol/events.ts` / `schemas.ts` | 扩展 | 新增 delegation.* 事件与通用意图类型 |
| `server/src/app/transaction-service.ts` | 改 | consumer-delegation 分支改走新工作流 |
| `src/hooks/useConsumerDelegations.ts` | 改 | 登记新事件类型 |
| `src/demo/delegationRuntime.ts` | 改 | 适配新事件到决策日志 |
| `.gitignore` | 改 | 忽略 `fine_items_eval_train_all.json` 和 `server/data/catalog.db` |

**laptop 相关文件全部保留不动** —— laptop-demo 和 consumer-delegation 从此走各自工作流，互不影响。

---

## 六、风险与注意

1. **`.gitignore`（重要）**：
   - `fine_items_eval_train_all.json`（134MB）**绝不能提交**，会撑爆仓库、超 GitHub 100MB 单文件上限。
   - `server/data/catalog.db`（生成物）也应忽略。
   - 目前 `.gitignore` 未覆盖，动手第一件事就是补上。
2. **预处理耗时**：416 万条流式入库预计几分钟~十几分钟（取决于磁盘/是否事务批量）。脚本用**事务批量 insert**（每 5000 条一提交）+ 关闭同步（`PRAGMA synchronous=OFF`）加速。
3. **中文检索质量**：trigram 召回率高但可能带噪。若效果不理想，退路是预处理时对 title/attribute 做简单分词后存入 FTS5 的普通 tokenizer 列。本期先用 trigram，验证后再调。
4. **LLM 成本/延迟**：候选从 3 个变成 6 个 → 报价环节 LLM 调用翻倍。可限制只对 Top-3 候选调 LLM 生成文案，其余用确定性 fallback。
5. **不改 laptop-demo**：确保现有「运行真实 LLM」笔记本 demo 完全不受影响（回归验证点）。

---

## 七、待你评审时拍板的两个细节

1. **意图结构泛化程度**：
   - (A) 新增独立的通用 `DelegationIntent`（干净，但要改协议类型）
   - (B) 复用 `LaptopIntent` 结构、忽略笔记本专用字段（改动小，但语义别扭）
   - 倾向 **A**。

2. **`serviceMode`（@补库/抢购/蹲低价…）本期做到什么程度**：
   - (A) 仅透传+日志，不做行为差异（最小可用）
   - (B) 让 mode 真正影响搜索权重/打分（如 lowprice 抬价格权重、scarce 抬时效权重）
   - 倾向本期先 **A**，B 作为后续迭代。

---

## 八、验证方式（改完怎么确认真的生效）

1. 跑预处理脚本，确认 `catalog.db` 生成、条数与源文件一致、体积合理。
2. 后端加一个临时 `GET /api/debug/search?q=乳胶枕` 或写单测，确认 FTS5 召回真实商品。
3. 前端新建委托输入「买个乳胶枕」→ 决策日志出现**乳胶枕相关真实商品**（不再是笔记本），且卖家名是数据集里的真实 `shop_name`。
4. 回归：laptop-demo「运行真实 LLM」仍正常。

---

## 九、已落地小结（实现完成后回填）

**决定**：通用 `DelegationIntent`（选 A）；`serviceMode` 本期仅透传+记录（选 A）。

**关键实现取舍**：为最小化前端改动，通用委托工作流**复用 `laptop.*` 事件类型**走完
比较/议价/下单/上链，只新增 **1 个事件** `delegation.search.completed` 表达「真实搜索」。
`DelegationIntent` 转成兼容 `LaptopIntent` 的结构（笔记本专用字段用占位值，
`maxWeightKg=999` 作为「通用委托」哨兵供前端识别、切换约束展示）。

**新增/改动文件**：
- 新增 `server/scripts/build-catalog.ts`（用 `stream-json` 流式灌库，非手写解析器）
- 新增 `server/src/scenario/product-catalog.ts`（FTS5 检索 + trigram 分词 + 滑窗召回）
- 新增 `server/src/scenario/product-to-seller.ts`（商品→卖家确定性映射 + 价格分位重算）
- 新增 `server/src/scenario/delegation-purchase-workflow.ts`（通用采购工作流）
- 新增 `server/src/llm/delegation-agent.ts` + `openai-delegation-agent.ts`
- 改 `server/src/protocol/events.ts` `schemas.ts`（+`DelegationIntent`/`delegation.search.completed`；
  `laptopPurchaseRequestSchema` 下限 8→4 与委托对齐）
- 改 `server/src/app/transaction-service.ts` `server.ts`（接线）+ `demo.ts`（事件标签）
- 改 `src/demo/laptopRuntime.ts`（新增 search case + 收紧 default + 通用约束展示）
- 改 `src/hooks/useConsumerDelegations.ts`（SSE 登记新事件）
- 改 `.gitignore`（忽略数据集 / catalog.db / .env）
- 新增依赖 `server`：`stream-json`

**实测结果**（不传 LLM 走确定性兜底）：
- catalog.db 入库 **23,421 条**真实商品（源文件为缩进美化 JSON，故行数 ≫ 条数）。
- 搜「天然乳胶枕/儿童学习椅/羽毛球拍」→ `source: catalog`，各召回 6 个**真实商品+真实店铺+真实价格**，
  选中→议价→成交→上链全 16 事件完成。
- 回归：后端 **129** 测试、前端 **40** 测试全通过；前后端 typecheck 通过。

**已知遗留 / 后续可优化**：
1. 不传 LLM 时 `DelegationIntent.product = 原文截断`，检索 query 带噪（如召回混入个别无关品），
   由 bm25 排序缓解；真实运行有 LLM 提炼后 query 更干净。
2. `serviceMode` 尚未影响搜索/打分权重（本期仅透传），后续可做差异化（如 lowprice 抬价格权重）。
3. 商品缺交期/售后/信誉真实数据，用 `shop_name` 稳定 hash + 旗舰店规则**确定性派生**，非真实指标。
4. 预处理脚本每 10 万条打印进度；本数据集实际约 2.3 万条，秒级完成。

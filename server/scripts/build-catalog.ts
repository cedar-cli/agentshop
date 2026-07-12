/**
 * 一次性预处理脚本：把根目录 134MB / 416 万条的大 JSON 商品数据集
 * `fine_items_eval_train_all.json` 流式解析后灌入 SQLite 检索库
 * `server/data/catalog.db`，并建立 FTS5(trigram) 全文索引。
 *
 * 为什么这样做：
 * - 大文件不能整读（JSON.parse 134MB 会让内存膨胀到 GB 级，进程易 OOM）。
 *   本脚本用 fs.createReadStream 分块读，配合「顶层对象括号配平切分」逐条取出
 *   JSON 对象，内存占用恒定，与文件大小无关。
 * - 运行时（后端）只读 catalog.db，绝不再碰这个大文件。
 *
 * 运行方式（一次性，产出 catalog.db 后即可反复使用）：
 *   cd server && npx tsx scripts/build-catalog.ts
 * 可选：用环境变量覆盖输入/输出路径
 *   SOURCE_JSON=../fine_items_eval_train_all.json CATALOG_DB=data/catalog.db npx tsx scripts/build-catalog.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
// 成熟的流式 JSON 解析库：正确处理 UTF-8 多字节边界与字符串转义，
// 逐个吐出大数组里的每个元素，内存占用与文件大小无关。
// withParserAsStream 把 parser()+streamArray() 合成一个 Node Duplex 流。
import { streamArray } from "stream-json/streamers/stream-array.js";

// 当前脚本所在目录（server/scripts），用于把相对路径解析成绝对路径
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
// 项目 server 根目录（scripts 的上一级）
const serverRoot = path.resolve(scriptDir, "..");
// 仓库根目录（server 的上一级），大数据集就放在这里
const repoRoot = path.resolve(serverRoot, "..");

// 输入大 JSON：默认取仓库根目录的数据集，允许用环境变量覆盖
const SOURCE_JSON = process.env.SOURCE_JSON
  ? path.resolve(process.env.SOURCE_JSON)
  : path.join(repoRoot, "fine_items_eval_train_all.json");
// 输出 SQLite 库：默认 server/data/catalog.db，允许覆盖
const CATALOG_DB = process.env.CATALOG_DB
  ? path.resolve(process.env.CATALOG_DB)
  : path.join(serverRoot, "data", "catalog.db");

// 每多少条提交一次事务（批量写显著快于逐条写）
const BATCH_SIZE = 5000;
// 每处理多少条打印一次进度（不静默，方便观察长耗时任务）
const PROGRESS_EVERY = 100_000;

/**
 * 数据集单条商品记录里我们真正需要的字段形状。
 * 只声明用到的字段，其余（images/user_persona 等）预处理阶段丢弃以缩小库体积。
 */
interface SourceItem {
  asin?: string;
  domain_zh?: string;
  title?: string;
  sub_title?: string;
  shop_name?: string;
  category?: string;
  attribute?: string[];
  pricing?: number[];
  customization_options?: Record<
    string,
    Array<{ price?: number | null; value?: string }>
  >;
  images?: string[];
  instructions?: Array<{ instruction?: string; instruction_simple?: string }>;
}

/**
 * 从一条源记录里推导出商品的最低价与最高价（分位打分时用）。
 * 优先用 SKU（customization_options）里的价格，回退到 pricing 数组。
 * 返回 [min, max]，若无任何价格信息则返回 [0, 0]。
 */
function derivePriceRange(item: SourceItem): [number, number] {
  const prices: number[] = [];
  // 收集所有 SKU 变体的价格
  if (item.customization_options) {
    for (const skus of Object.values(item.customization_options)) {
      for (const sku of skus) {
        if (typeof sku.price === "number" && sku.price > 0) prices.push(sku.price);
      }
    }
  }
  // 回退到 pricing 数组
  if (prices.length === 0 && Array.isArray(item.pricing)) {
    for (const p of item.pricing) {
      if (typeof p === "number" && p > 0) prices.push(p);
    }
  }
  if (prices.length === 0) return [0, 0];
  return [Math.min(...prices), Math.max(...prices)];
}

/**
 * 取第一张商品图（前端展示用），无图返回空串。
 */
function firstImage(item: SourceItem): string {
  return Array.isArray(item.images) && item.images.length > 0 ? String(item.images[0]) : "";
}

/**
 * 取一条示例购买指令（保留用于示例意图/未来 eval 对照），无则空串。
 */
function firstInstruction(item: SourceItem): string {
  const ins = Array.isArray(item.instructions) ? item.instructions[0] : undefined;
  return ins?.instruction ?? ins?.instruction_simple ?? "";
}

/**
 * 主流程：建库 → 流式解析大文件逐条入库 → 建 FTS5 索引。
 * 用 async 是因为读流以事件驱动，需要用 Promise 包裹等待其结束。
 */
async function main(): Promise<void> {
  if (!fs.existsSync(SOURCE_JSON)) {
    console.error(`[build-catalog] 找不到数据集文件：${SOURCE_JSON}`);
    console.error(`[build-catalog] 请确认 fine_items_eval_train_all.json 在仓库根目录，或用 SOURCE_JSON 指定路径。`);
    process.exit(1);
  }

  // 确保输出目录存在
  fs.mkdirSync(path.dirname(CATALOG_DB), { recursive: true });
  // 若已存在旧库，先删除重建，保证幂等（重复跑结果一致）
  for (const suffix of ["", "-shm", "-wal"]) {
    const f = CATALOG_DB + suffix;
    if (fs.existsSync(f)) fs.rmSync(f);
  }

  const db = new Database(CATALOG_DB);
  // 灌库期间的加速开关：关闭同步、用内存日志。仅一次性导入安全。
  db.pragma("journal_mode = MEMORY");
  db.pragma("synchronous = OFF");
  db.pragma("temp_store = MEMORY");

  // 主表：只存检索与展示需要的字段。attributes 以 JSON 数组字符串保存。
  db.exec(`
    CREATE TABLE products (
      rowid       INTEGER PRIMARY KEY,
      asin        TEXT,
      domain      TEXT,
      title       TEXT,
      shop_name   TEXT,
      category    TEXT,
      attributes  TEXT,
      price_min   INTEGER,
      price_max   INTEGER,
      image       TEXT,
      instruction TEXT
    );
    -- FTS5 全文索引：external content 指向 products，节省空间。
    -- trigram 分词器对中文子串匹配友好（SQLite 3.34+ 内置）。
    CREATE VIRTUAL TABLE products_fts USING fts5(
      title, category, attributes, shop_name,
      content='products',
      content_rowid='rowid',
      tokenize='trigram'
    );
  `);

  const insertProduct = db.prepare(`
    INSERT INTO products (rowid, asin, domain, title, shop_name, category, attributes, price_min, price_max, image, instruction)
    VALUES (@rowid, @asin, @domain, @title, @shop_name, @category, @attributes, @price_min, @price_max, @image, @instruction)
  `);
  // external content 表需要手动把同一 rowid 的可检索字段写进 FTS 影子表。
  const insertFts = db.prepare(`
    INSERT INTO products_fts (rowid, title, category, attributes, shop_name)
    VALUES (@rowid, @title, @category, @attributes, @shop_name)
  `);

  // 把一批记录包进一个事务里写入（批量比逐条快一个数量级）
  const insertBatch = db.transaction((rows: Array<Record<string, unknown>>) => {
    for (const row of rows) {
      insertProduct.run(row);
      insertFts.run(row);
    }
  });

  let rowid = 0; // 自增主键
  let processed = 0; // 已处理条数（含跳过）
  let skipped = 0; // 缺关键字段被跳过的条数
  let batch: Array<Record<string, unknown>> = [];
  const startedAt = Date.now();

  /**
   * 把一条解析好的源对象转成入库行并加入当前批次；
   * 批次满 BATCH_SIZE 时提交。缺 title 的记录跳过（无法检索）。
   */
  const pushItem = (item: SourceItem): void => {
    processed++;
    const title = (item.title ?? "").trim();
    if (!title) {
      skipped++;
      return;
    }
    rowid++;
    const [priceMin, priceMax] = derivePriceRange(item);
    batch.push({
      rowid,
      asin: item.asin ?? "",
      domain: item.domain_zh ?? "",
      title,
      shop_name: item.shop_name ?? "",
      category: item.category ?? "",
      attributes: JSON.stringify(Array.isArray(item.attribute) ? item.attribute : []),
      price_min: priceMin,
      price_max: priceMax,
      image: firstImage(item),
      instruction: firstInstruction(item),
    });
    if (batch.length >= BATCH_SIZE) {
      insertBatch(batch);
      batch = [];
    }
    if (processed % PROGRESS_EVERY === 0) {
      const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(`[build-catalog] 已处理 ${processed.toLocaleString()} 条（入库 ${rowid.toLocaleString()}，跳过 ${skipped}）· ${secs}s`);
    }
  };

  // ---- 流式解析：用 stream-json 逐个吐出大数组里的每个商品对象 ----
  // 数据集是一个大数组 [ {...}, {...}, ... ]。streamArray 会为每个元素
  // 触发一次 "data" 事件（形如 { key: 索引, value: 对象 }），全程内存恒定。
  await new Promise<void>((resolve, reject) => {
    const pipeline = fs
      .createReadStream(SOURCE_JSON)
      .pipe(streamArray.withParserAsStream());

    pipeline.on("data", ({ value }: { value: SourceItem }) => {
      try {
        pushItem(value);
      } catch {
        // 单条处理失败不应中断整体导入，记为跳过
        skipped++;
        processed++;
      }
    });
    pipeline.on("error", reject);
    pipeline.on("end", resolve);
  });

  // 冲掉最后一批不足 BATCH_SIZE 的残余
  if (batch.length > 0) insertBatch(batch);

  // 优化 FTS 索引（合并 b-tree，提升查询速度）
  db.exec(`INSERT INTO products_fts(products_fts) VALUES('optimize');`);
  // 常用过滤字段建索引（按域筛选/统计时用）
  db.exec(`CREATE INDEX products_domain ON products(domain);`);

  const total = db.prepare(`SELECT COUNT(*) AS c FROM products`).get() as { c: number };
  db.close();

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[build-catalog] 完成 ✅ 入库 ${total.c.toLocaleString()} 条商品，跳过 ${skipped}，耗时 ${secs}s`);
  console.log(`[build-catalog] 输出：${CATALOG_DB}`);
}

main().catch((err) => {
  console.error("[build-catalog] 失败：", err);
  process.exit(1);
});

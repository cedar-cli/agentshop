import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

/**
 * 商品检索服务：只读打开预处理生成的 catalog.db，对外提供 searchProducts。
 *
 * 设计要点：
 * - 数据来自 server/scripts/build-catalog.ts 灌好的 SQLite 库，运行时绝不碰 134MB 大文件。
 * - 用 FTS5(trigram) 全文索引 + bm25 排序召回 Top-N，毫秒级返回。
 * - catalog.db 不存在时（未跑预处理）返回空结果，让上层安全降级到写死卖家，不 break。
 */

// server 根目录（本文件在 server/src/scenario 下，向上三级到 server）
const scenarioDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scenarioDir, "..", "..");
const CATALOG_DB = process.env.CATALOG_DB
  ? path.resolve(process.env.CATALOG_DB)
  : path.join(serverRoot, "data", "catalog.db");

/**
 * 一条检索命中的商品（对外结构，屏蔽 DB 行细节）。
 */
export interface ProductHit {
  // 商品在数据集中的原始 id
  asin: string;
  // 一级域（家居家装 / 家用电器数码 …）
  domain: string;
  // 商品标题
  title: string;
  // 店铺名（作为候选卖家名）
  shopName: string;
  // 类目路径
  category: string;
  // 属性标签
  attributes: string[];
  // 最低价（元）
  priceMin: number;
  // 最高价（元）
  priceMax: number;
  // 首图 URL
  image: string;
  // 数据集自带的一条示例购买指令（可用于展示/eval）
  instruction: string;
  // bm25 相关性得分（越小越相关，供调试）
  relevance: number;
}

// DB 行的原始形状（与 build-catalog.ts 建表字段一致）
interface ProductRow {
  asin: string;
  domain: string;
  title: string;
  shop_name: string;
  category: string;
  attributes: string;
  price_min: number;
  price_max: number;
  image: string;
  instruction: string;
  relevance: number;
}

// 懒加载的只读数据库句柄。null 表示尚未尝试打开；false 表示打开失败（缺库）。
let db: Database.Database | null | false = null;

/**
 * 懒加载只读数据库。库不存在或打开失败时返回 null，让调用方降级。
 * 为什么懒加载：避免 server 启动时就强依赖 catalog.db，未跑预处理也能启动。
 */
function getDb(): Database.Database | null {
  if (db === false) return null;
  if (db) return db;
  if (!fs.existsSync(CATALOG_DB)) {
    console.warn(`[product-catalog] 未找到 ${CATALOG_DB}，商品检索降级为空结果。请先运行 scripts/build-catalog.ts。`);
    db = false;
    return null;
  }
  try {
    db = new Database(CATALOG_DB, { readonly: true, fileMustExist: true });
    return db;
  } catch (error) {
    console.warn(`[product-catalog] 打开 ${CATALOG_DB} 失败，检索降级为空结果：`, error);
    db = false;
    return null;
  }
}

/**
 * 把用户的自由文本查询转成 FTS5 可用的 MATCH 表达式。
 *
 * 为什么需要处理：
 * - trigram 分词要求每个检索词至少 3 个字符，且中文里标点会干扰匹配。
 * - 直接把整句丢给 MATCH 容易因为包含标点/过短词而报错或召回为空。
 *
 * 策略：抽取查询中所有连续的中文/字母数字片段。
 * - 中文块：切成重叠的 3 字滑窗子片段（trigram 分词友好）。整块直接短语匹配
 *   往往召不回（如「我想买天然乳胶枕」是一个 8 字长词），拆成「我想买/想买天/买天然/…/乳胶枕」
 *   这些 3-gram 后任意命中即可召回，再由 bm25 排序。
 * - 字母数字块：长度 ≥2 直接作为一个词（如 YY、iPhone、A4）。
 * 全部 token 去重后用 OR 连接。返回 null 表示无有效检索词。
 */
export function toFtsQuery(raw: string): string | null {
  const segments = raw.match(/[一-龥]+|[A-Za-z0-9]+/g) ?? [];
  const tokens = new Set<string>();
  for (const seg of segments) {
    const isCjk = /[一-龥]/.test(seg);
    if (isCjk) {
      if (seg.length <= 3) {
        // 3 字及以内的中文块直接作为一个 token
        if (seg.length >= 2) tokens.add(seg);
      } else {
        // 长中文块切成重叠 3 字滑窗，提高 trigram 召回
        for (let i = 0; i + 3 <= seg.length; i++) tokens.add(seg.slice(i, i + 3));
      }
    } else if (seg.length >= 2) {
      // 字母数字词整体保留
      tokens.add(seg);
    }
  }
  if (tokens.size === 0) return null;
  // 每个 token 用双引号包裹（token 内不含引号），OR 连接，任意命中即召回
  return [...tokens].map((t) => `"${t}"`).join(" OR ");
}

/**
 * 按自由文本检索商品，返回 Top-N 命中。
 *
 * @param query   用户原始购物意图文本
 * @param limit   返回条数上限（默认 6，够拼候选卖家列表）
 * @returns       命中商品数组；库缺失或无有效检索词时返回空数组
 */
export function searchProducts(query: string, limit = 6): ProductHit[] {
  const handle = getDb();
  if (!handle) return [];

  const ftsQuery = toFtsQuery(query);
  if (!ftsQuery) return [];

  try {
    const rows = handle
      .prepare(
        `SELECT p.asin, p.domain, p.title, p.shop_name, p.category, p.attributes,
                p.price_min, p.price_max, p.image, p.instruction,
                bm25(products_fts) AS relevance
         FROM products_fts
         JOIN products p ON p.rowid = products_fts.rowid
         WHERE products_fts MATCH ?
         ORDER BY relevance
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as ProductRow[];

    return rows.map(rowToHit);
  } catch (error) {
    console.warn(`[product-catalog] 检索 "${query}" 失败：`, error);
    return [];
  }
}

/**
 * 把一条 DB 行转成对外的 ProductHit。attributes 从 JSON 字符串解析回数组。
 */
function rowToHit(row: ProductRow): ProductHit {
  let attributes: string[] = [];
  try {
    const parsed = JSON.parse(row.attributes) as unknown;
    if (Array.isArray(parsed)) attributes = parsed.map(String);
  } catch {
    attributes = [];
  }
  return {
    asin: row.asin,
    domain: row.domain,
    title: row.title,
    shopName: row.shop_name,
    category: row.category,
    attributes,
    priceMin: row.price_min,
    priceMax: row.price_max,
    image: row.image,
    instruction: row.instruction,
    relevance: row.relevance,
  };
}

/**
 * 检索库是否可用（catalog.db 存在且能打开）。供上层决定是否走真实搜索。
 */
export function isCatalogAvailable(): boolean {
  return getDb() !== null;
}

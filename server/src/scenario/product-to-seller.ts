import type { DelegationIntent, LaptopProposal } from "../protocol/events.js";
import type { ProductHit } from "./product-catalog.js";

/**
 * 通用委托卖家事实：结构对齐 laptop-purchase 的 LaptopSellerFact，
 * 使其能直接喂给复用的报价 / 议价 / 打分逻辑（「只换货架」）。
 *
 * 差异：额外带上商品展示信息（title/category/image/attributes），
 * 供前端与决策日志呈现真实商品。
 */
export interface DelegationSellerFact {
  // 卖家（店铺）稳定 id，由 asin 派生
  sellerId: string;
  // 店铺名（真实 shop_name），作为卖家展示名
  displayName: string;
  // 商品标题（展示用）
  productTitle: string;
  // 类目路径（展示用）
  category: string;
  // 商品首图 URL（展示用）
  image: string;
  // 商品属性标签（打分匹配用）
  attributes: string[];
  // 挂牌价（元）
  listPriceCny: number;
  // 商家可接受的最低价（元）——议价不得跌破
  minimumPriceCny: number;
  // 商家倾向成交价（元）——报价默认值
  preferredPriceCny: number;
  // 交期（小时，确定性派生）
  deliveryHours: number;
  // 信誉分（0-100，确定性派生）
  reputation: number;
  // 四维指标（0-100），供意图偏好加权打分
  metrics: LaptopProposal["metrics"];
  // 卖家策略话术（fallback 报价理由用）
  strategy: string;
}

/**
 * 基于字符串的稳定哈希（FNV-1a 变体），返回 0-1 的确定性小数。
 *
 * 为什么用它：派生 metrics/交期需要一点差异化避免所有候选完全雷同，
 * 但又必须可复现（同一商品每次结果一致），因此用 asin/shopName 做种子，
 * 不能用 Math.random（不可复现且脚本里被禁用）。
 */
function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // 转成 0-1 区间
  return ((hash >>> 0) % 10000) / 10000;
}

/**
 * 在 [min,max] 区间内按种子取一个确定性数值，四舍五入到整数。
 */
function stableBetween(seed: string, min: number, max: number): number {
  return Math.round(min + stableUnit(seed) * (max - min));
}

/**
 * 判断店铺是否为「旗舰/官方/自营」类高信誉店，用于信誉与售后加成。
 */
function isPremiumShop(shopName: string): boolean {
  return /旗舰店|官方|自营|专卖店|天猫超市|苏宁|京东/.test(shopName);
}

/**
 * 把一条检索命中的真实商品映射成通用卖家事实。
 *
 * 价格：listPriceCny 取商品最高价（无则 100 兜底），最低价给约 92%（留议价空间），
 *       preferredPriceCny 居中。metrics.price 需候选集分位，这里先给基线，
 *       由工作流在拿到全部候选后统一重算（见 buildDelegationProposalContext）。
 *
 * @param hit    检索命中的真实商品
 * @param intent 已解析的委托意图（用于 spec 匹配度）
 */
export function toSellerFact(hit: ProductHit, intent: DelegationIntent): DelegationSellerFact {
  const sellerId = `delegation-seller-${hit.asin || stableBetween(hit.title, 1000, 9999)}`;
  // 价格：优先用最高价作挂牌，最低价兜底 100 元，避免 0 价导致 schema 报错
  const listPrice = Math.max(hit.priceMax || hit.priceMin || 100, 1);
  const minimumPrice = Math.max(1, Math.round(listPrice * 0.92));
  const preferredPrice = Math.round((listPrice + minimumPrice) / 2);

  // 交期：旗舰/官方店更快（24-48h），普通店较慢（48-120h），确定性派生
  const premium = isPremiumShop(hit.shopName);
  const deliveryHours = premium
    ? stableBetween(hit.shopName + "d", 24, 48)
    : stableBetween(hit.shopName + "d", 48, 120);

  // 信誉：旗舰/官方店 84-95，普通店 70-86
  const reputation = premium
    ? stableBetween(hit.shopName + "r", 84, 95)
    : stableBetween(hit.shopName + "r", 70, 86);

  // spec 匹配度：意图 mustHave + 商品描述关键词在「标题+属性」里的命中比例
  const spec = specMatchScore(hit, intent);
  // 时效分：由交期反推（越快分越高），48h 以内视为满分区
  const timeliness = Math.max(40, Math.min(100, Math.round(100 - (deliveryHours - 24) * 0.6)));
  // 售后分：信誉的映射，旗舰店额外加成
  const afterSales = Math.min(100, reputation + (premium ? 4 : 0));

  return {
    sellerId,
    displayName: hit.shopName || "匿名商家",
    productTitle: hit.title,
    category: hit.category,
    image: hit.image,
    attributes: hit.attributes,
    listPriceCny: listPrice,
    minimumPriceCny: minimumPrice,
    preferredPriceCny: preferredPrice,
    deliveryHours,
    reputation,
    // price 基线先给中性 60，工作流拿到全部候选后按分位重算
    metrics: { timeliness, spec, afterSales, price: 60 },
    strategy: premium
      ? `${hit.shopName}以旗舰履约与售后保障争取订单，可在底价之上适度让利。`
      : `${hit.shopName}主打价格竞争力，保留有限议价空间。`,
  };
}

/**
 * 计算商品与意图的「规格/描述匹配度」（0-100）。
 * mustHave 关键词命中权重更高，其次是意图 product 分词命中，保底 45 分。
 */
function specMatchScore(hit: ProductHit, intent: DelegationIntent): number {
  const haystack = `${hit.title} ${hit.category} ${hit.attributes.join(" ")}`.toLowerCase();
  let score = 45; // 能被检索召回本身就说明有一定相关性，给个保底
  // mustHave 命中：每个 +12
  for (const kw of intent.mustHave) {
    if (kw && haystack.includes(kw.toLowerCase())) score += 12;
  }
  // 意图 product 里的中文/字母数字片段命中：每个 +6
  const tokens = intent.product.match(/[一-龥]{2,}|[A-Za-z0-9]{2,}/g) ?? [];
  for (const token of tokens) {
    if (haystack.includes(token.toLowerCase())) score += 6;
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * 拿到全部候选后，按价格分位重算每个候选的 metrics.price（0-100，越便宜越高）。
 * 就地修改传入数组元素的 metrics.price 并返回同一数组，供工作流调用。
 *
 * 为什么要在拿到全部候选后算：价格分是相对的——同一批召回里最便宜的应得高分，
 * 单看一个商品无法定分位。
 */
export function repriceByQuantile(sellers: DelegationSellerFact[]): DelegationSellerFact[] {
  if (sellers.length === 0) return sellers;
  const prices = sellers.map((s) => s.preferredPriceCny);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min;
  for (const seller of sellers) {
    // 全部同价时给中性 70；否则最便宜 100 分、最贵 55 分线性分布
    seller.metrics.price =
      span === 0 ? 70 : Math.round(100 - ((seller.preferredPriceCny - min) / span) * 45);
  }
  return sellers;
}

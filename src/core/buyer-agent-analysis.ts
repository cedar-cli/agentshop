/* ============================================================
   买家 Agent 分析 · 意图 × 商品的「推荐 / 决策」漏斗
   ------------------------------------------------------------
   为品类内每个卖家合成一份小商品目录（每个商品有差异化的能力画像
   与推广力度），模拟买家 Agent 在不同意图下的选购：

     需求 → 推荐（进入决策集 / 被 Agent 纳入考虑）
          → 决策（在决策集中被最终选中）

   由此得到每个商品在每类意图下的「推荐率」「决策率」，产出：
     · 按意图的商品榜（一系列榜单，每个意图一张）
     · 每个商品自己的意图排行榜（跨全部意图的站位）
     · 当前卖家（me）的汇总画像

   设计要点（制造有价值的分化）：
     · 推荐率 = 进入决策集的比例，受「推广 × 匹配」驱动
       —— 高推广、低匹配的商品「常被推荐、却难被选中」
     · 决策率 = 决策集内被选中的比例，受「纯匹配」驱动
       —— 高匹配、低推广的商品「一旦入选就赢下临门一脚」

   纯函数、确定性（seeded RNG），可复现、可单测。
   ============================================================ */

import { makeRng, clamp, type Rng } from "./rng";
import { PERSONAS, expScore, type FactorKey } from "./evolution";
import type { Category } from "./types";

/** 播种输入：来自世界里的真实卖家 */
export interface SellerSeed {
  id: string;
  name: string;
  category: Category;
  credit: number;
  flagged?: boolean;
}

/** 合成商品：一个卖家名下的一个 SKU，带自己的能力画像与推广力度 */
export interface AnalyzedProduct {
  id: string;
  sellerId: string;
  sellerName: string;
  /** 商品定位名（如「性价比款」） */
  name: string;
  category: Category;
  factors: Record<FactorKey, number>;
  /** 推广力度 0-100：影响「被纳入决策集」的概率 */
  promotion: number;
  isMine: boolean;
}

/** 商品定位：决定能力画像的侧重（制造同一卖家不同商品的意图分化） */
interface ProductTilt {
  name: string;
  boost: FactorKey;
  drop: FactorKey;
  /** 推广基线相对卖家信用的偏移 */
  promoBias: number;
}

const PRODUCT_TILTS: ProductTilt[] = [
  { name: "性价比款", boost: "price", drop: "listing", promoBias: 14 },
  { name: "旗舰品质款", boost: "listing", drop: "price", promoBias: -6 },
  { name: "极速达款", boost: "fulfilment", drop: "price", promoBias: 4 },
  { name: "无忧售后款", boost: "service", drop: "fulfilment", promoBias: -2 },
  { name: "爆款走量款", boost: "promotion", drop: "service", promoBias: 26 },
];

const PRODUCTS_PER_SELLER = 3;
/** 每类意图模拟的需求笔数（越大率越稳定） */
const REQUESTS_PER_INTENT = 90;

const zeroFactors = (): Record<FactorKey, number> => ({
  listing: 0,
  service: 0,
  fulfilment: 0,
  selection: 0,
  promotion: 0,
  price: 0,
});

/** 能力画像的公共中心：让「商品定位（意图匹配）」主导，卖家信用只作温和加权 */
const QUALITY_CENTER = 58;
const CREDIT_WEIGHT = 0.42;

function buildProductFactors(
  rng: Rng,
  sellerCredit: number,
  tilt: ProductTilt,
): Record<FactorKey, number> {
  // 压缩卖家信用的绝对影响：高信用只给温和加成，不再横扫所有意图
  const center = QUALITY_CENTER + (sellerCredit - 70) * CREDIT_WEIGHT;
  const base = (): number => clamp(center + (rng() - 0.5) * 12);
  const factors = zeroFactors();
  for (const k of Object.keys(factors) as FactorKey[]) factors[k] = base();
  // 定位侧重远大于信用差 → 不同定位的商品在不同意图各擅胜场
  factors[tilt.boost] = clamp(factors[tilt.boost] + 30);
  factors[tilt.drop] = clamp(factors[tilt.drop] - 26);
  return factors;
}

/** 为品类内所有（未沉底）卖家合成商品目录 */
export function buildCatalog(
  sellers: SellerSeed[],
  meSellerId: string,
  category: Category,
  seed: number,
): AnalyzedProduct[] {
  const rng = makeRng(seed);
  const inCategory = sellers
    .filter((s) => s.category === category && !s.flagged)
    .slice()
    .sort((a, b) => b.credit - a.credit);

  const products: AnalyzedProduct[] = [];
  inCategory.forEach((seller, si) => {
    for (let pi = 0; pi < PRODUCTS_PER_SELLER; pi++) {
      // 每个卖家取一段错开的定位窗口，保证同卖家的商品彼此分化
      const tilt = PRODUCT_TILTS[(si + pi) % PRODUCT_TILTS.length];
      const factors = buildProductFactors(rng, seller.credit, tilt);
      // 推广力度以定位为主、信用温和加权 → 推广高的款「常被推荐」但未必匹配
      const promotion = clamp(
        60 + (seller.credit - 70) * 0.3 + tilt.promoBias + (rng() - 0.5) * 12,
      );
      factors.promotion = promotion;
      products.push({
        id: `${seller.id}-p${pi}`,
        sellerId: seller.id,
        sellerName: seller.name,
        name: tilt.name,
        category,
        factors,
        promotion,
        isMine: seller.id === meSellerId,
      });
    }
  });
  return products;
}

/** 单商品在单意图下的漏斗计数 */
interface Funnel {
  requests: number;
  recommended: number;
  decided: number;
}

/** 榜单/画像共用的率结构 */
export interface FunnelRates {
  requests: number;
  /** 推荐率：进入决策集的比例 0-1 */
  recommendRate: number;
  /** 决策率：决策集内被选中的比例 0-1 */
  decideRate: number;
  /** 综合胜出率：最终被选中 / 全部需求 = 推荐率 × 决策率 */
  winRate: number;
}

/** 决策集大小：随候选规模伸缩，且必须 < 候选数，推荐率才有区分度 */
function decisionSetSize(n: number): number {
  return Math.max(2, Math.min(6, Math.round(n * 0.38), n - 1));
}

const rates = (f: Funnel): FunnelRates => ({
  requests: f.requests,
  recommendRate: f.requests > 0 ? f.recommended / f.requests : 0,
  decideRate: f.recommended > 0 ? f.decided / f.recommended : 0,
  winRate: f.requests > 0 ? f.decided / f.requests : 0,
});

/**
 * 模拟买家 Agent 漏斗：返回 funnel[productId][personaId]。
 * 推荐分 = 匹配 × 可见性(推广) + 噪声 → 进决策集；
 * 决策分 = 纯匹配 + 噪声 → 决策集内选冠军。
 */
function simulateFunnels(
  products: AnalyzedProduct[],
  seed: number,
): Map<string, Map<string, Funnel>> {
  const funnels = new Map<string, Map<string, Funnel>>();
  for (const p of products) {
    const perIntent = new Map<string, Funnel>();
    for (const persona of PERSONAS)
      perIntent.set(persona.id, { requests: 0, recommended: 0, decided: 0 });
    funnels.set(p.id, perIntent);
  }
  if (products.length === 0) return funnels;

  const k = decisionSetSize(products.length);

  PERSONAS.forEach((persona, pIdx) => {
    // 每个商品对该意图的基础匹配分（确定性、与请求无关的部分）
    const fit = products.map((p) => expScore(p.factors, persona));
    const visibility = products.map((p) => 0.55 + 0.45 * (p.promotion / 100));

    for (let r = 0; r < REQUESTS_PER_INTENT; r++) {
      const rng = makeRng(seed + pIdx * 7919 + r * 104729);
      const scored = products.map((_, i) => ({
        i,
        rec: fit[i] * visibility[i] + (rng() - 0.5) * 34,
        dec: fit[i] + (rng() - 0.5) * 22,
      }));

      // 推荐：按推荐分取前 K 进入决策集
      const recommended = scored
        .slice()
        .sort((a, b) => b.rec - a.rec)
        .slice(0, k);
      // 决策：决策集内按决策分选冠军
      const winner = recommended
        .slice()
        .sort((a, b) => b.dec - a.dec)[0];

      for (const p of products)
        funnels.get(p.id)!.get(persona.id)!.requests += 1;
      for (const rec of recommended)
        funnels.get(products[rec.i].id)!.get(persona.id)!.recommended += 1;
      if (winner)
        funnels.get(products[winner.i].id)!.get(persona.id)!.decided += 1;
    }
  });

  return funnels;
}

/** 某意图商品榜的一行 */
export interface ProductBoardRow extends FunnelRates {
  productId: string;
  productName: string;
  sellerId: string;
  sellerName: string;
  isMine: boolean;
  rank: number;
}

/** 一张意图商品榜 */
export interface IntentProductBoard {
  personaId: string;
  label: string;
  strict: FactorKey;
  rows: ProductBoardRow[];
}

/** 某商品在某意图上的站位（用于「每个商品自己的意图榜」） */
export interface ProductIntentStanding extends FunnelRates {
  personaId: string;
  label: string;
  rank: number;
  total: number;
}

/** 一个商品自己的意图排行榜（跨全部意图的站位画像） */
export interface ProductProfile {
  productId: string;
  productName: string;
  sellerId: string;
  sellerName: string;
  isMine: boolean;
  promotion: number;
  /** 按名次升序（最擅长的意图在前） */
  standings: ProductIntentStanding[];
  best: ProductIntentStanding | null;
  worst: ProductIntentStanding | null;
  /** 一句可读洞察：主力意图 vs 盲区意图 */
  insight: string;
}

export interface MySummary {
  products: number;
  avgRecommendRate: number;
  avgDecideRate: number;
  bestIntentLabel: string | null;
  worstIntentLabel: string | null;
}

export interface BuyerAgentAnalysisResult {
  category: Category;
  seed: number;
  requestsPerIntent: number;
  productCount: number;
  intentBoards: IntentProductBoard[];
  productProfiles: ProductProfile[];
  mySummary: MySummary;
}

const PERSONA_LABEL = new Map(PERSONAS.map((p) => [p.id, p.label]));

function buildInsight(
  best: ProductIntentStanding | null,
  worst: ProductIntentStanding | null,
): string {
  if (!best || !worst || best.personaId === worst.personaId) {
    return "各意图站位均衡，是一款通用型商品。";
  }
  const rec = Math.round(best.recommendRate * 100);
  const dec = Math.round(best.decideRate * 100);
  return (
    `主力意图「${best.label}」推荐率 ${rec}%、决策率 ${dec}%（榜内 #${best.rank}）；` +
    `盲区意图「${worst.label}」几乎不进决策集（#${worst.rank}/${worst.total}）。`
  );
}

/**
 * 主入口：产出买家 Agent 分析结果。
 */
export function analyzeBuyerAgents(
  sellers: SellerSeed[],
  meSellerId: string,
  category: Category,
  seed = 42,
): BuyerAgentAnalysisResult {
  const products = buildCatalog(sellers, meSellerId, category, seed);
  const funnels = simulateFunnels(products, seed);
  const total = products.length;

  // 一系列按意图的商品榜
  const intentBoards: IntentProductBoard[] = PERSONAS.map((persona) => {
    const rows: ProductBoardRow[] = products
      .map((p) => {
        const r = rates(funnels.get(p.id)!.get(persona.id)!);
        return {
          productId: p.id,
          productName: p.name,
          sellerId: p.sellerId,
          sellerName: p.sellerName,
          isMine: p.isMine,
          ...r,
          rank: 0,
        };
      })
      .sort((a, b) => b.winRate - a.winRate || b.recommendRate - a.recommendRate)
      .map((row, i) => ({ ...row, rank: i + 1 }));
    return {
      personaId: persona.id,
      label: persona.label,
      strict: persona.strict,
      rows,
    };
  });

  // 每个商品自己的意图排行榜
  const rankOf = new Map<string, Map<string, number>>(); // personaId → productId → rank
  for (const board of intentBoards) {
    const m = new Map<string, number>();
    for (const row of board.rows) m.set(row.productId, row.rank);
    rankOf.set(board.personaId, m);
  }

  const productProfiles: ProductProfile[] = products.map((p) => {
    const standings: ProductIntentStanding[] = PERSONAS.map((persona) => {
      const r = rates(funnels.get(p.id)!.get(persona.id)!);
      return {
        personaId: persona.id,
        label: persona.label,
        rank: rankOf.get(persona.id)!.get(p.id)!,
        total,
        ...r,
      };
    }).sort((a, b) => a.rank - b.rank || b.winRate - a.winRate);
    const best = standings[0] ?? null;
    const worst = standings[standings.length - 1] ?? null;
    return {
      productId: p.id,
      productName: p.name,
      sellerId: p.sellerId,
      sellerName: p.sellerName,
      isMine: p.isMine,
      promotion: Math.round(p.promotion),
      standings,
      best,
      worst,
      insight: buildInsight(best, worst),
    };
  });

  // 当前卖家汇总
  const mine = productProfiles.filter((p) => p.isMine);
  const avg = (arr: number[]): number =>
    arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const myRecommend = avg(
    mine.flatMap((p) => p.standings.map((s) => s.recommendRate)),
  );
  const myDecide = avg(mine.flatMap((p) => p.standings.map((s) => s.decideRate)));

  // 我方在各意图上的平均胜出率 → 最强/最弱意图
  let bestIntentLabel: string | null = null;
  let worstIntentLabel: string | null = null;
  if (mine.length > 0) {
    const perPersona = PERSONAS.map((persona) => ({
      id: persona.id,
      win: avg(
        mine.map(
          (p) =>
            p.standings.find((s) => s.personaId === persona.id)?.winRate ?? 0,
        ),
      ),
    }));
    const sorted = perPersona.slice().sort((a, b) => b.win - a.win);
    bestIntentLabel = PERSONA_LABEL.get(sorted[0].id) ?? null;
    worstIntentLabel = PERSONA_LABEL.get(sorted[sorted.length - 1].id) ?? null;
  }

  return {
    category,
    seed,
    requestsPerIntent: REQUESTS_PER_INTENT,
    productCount: total,
    intentBoards,
    productProfiles,
    mySummary: {
      products: mine.length,
      avgRecommendRate: myRecommend,
      avgDecideRate: myDecide,
      bestIntentLabel,
      worstIntentLabel,
    },
  };
}

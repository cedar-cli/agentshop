/* ============================================================
   生态演化 · 事件驱动交易模拟「一年只需十秒」
   ------------------------------------------------------------
   买家 Agent（带 persona 画像与真实意图输入）持续向卖家发起需求，
   经匹配 → 沟通 → 成交 → 履约，产生「满意 / 差评 / 流失」结果；
   每个结果按维度归因（描述/服务/时效/选品/推广/价格），
   累计驱动卖家信誉与排名变化，并生成诊断报告与改进建议。

   纯函数、确定性（seeded RNG，按 step 派生），可复现、可单测。
   ============================================================ */

import { makeRng, pick, clamp, type Rng } from "./rng";
import type { Category } from "./types";

/** 六个可归因、可改进的能力维度 */
export type FactorKey =
  "listing" | "service" | "fulfilment" | "selection" | "promotion" | "price";

export const FACTORS: Array<{
  key: FactorKey;
  label: string;
  issue: string;
  advice: string;
}> = [
  {
    key: "listing",
    label: "商品描述",
    issue: "描述与实物不符",
    advice:
      "校准标称参数，让描述贴近实物抽检值，杜绝夸大宣传，减少参数不符差评。",
  },
  {
    key: "service",
    label: "售后服务",
    issue: "售后响应慢",
    advice: "压缩售后响应时长、增设自动分流，复杂工单 3 分钟内升级人工。",
  },
  {
    key: "fulfilment",
    label: "时效物流",
    issue: "配送延误",
    advice: "切换同城仓或更快干线，提升准时率，把承诺送达时间压到买家预期内。",
  },
  {
    key: "selection",
    label: "选品匹配",
    issue: "选品与需求不符",
    advice: "聚焦擅长品类、下架低匹配 SKU，提升商品与买家真实意图的契合度。",
  },
  {
    key: "promotion",
    label: "触达推广",
    issue: "未精准触达",
    advice: "按 persona 精准投放需求轮廓，减少无效曝光，提高进入决策集的机会。",
  },
  {
    key: "price",
    label: "价格竞争",
    issue: "价格无竞争力",
    advice: "优化成本结构或组合权益，在关键 persona 上给出有竞争力的到手价。",
  },
];

const FACTOR_MAP: Record<FactorKey, (typeof FACTORS)[number]> =
  Object.fromEntries(FACTORS.map((f) => [f.key, f])) as Record<
    FactorKey,
    (typeof FACTORS)[number]
  >;

/** 买家 persona 画像 */
export interface EcoPersona {
  id: string;
  label: string;
  /** 真实意图输入样例（自然语言） */
  intents: string[];
  /** 偏好权重（四维，和卖家能力维度映射） */
  pref: { timeliness: number; spec: number; price: number; afterSales: number };
  /** 最挑剔维度：这里不达标最容易差评/流失 */
  strict: FactorKey;
}

export const PERSONAS: EcoPersona[] = [
  {
    id: "p-stock",
    label: "囤货党",
    intents: [
      "要便宜能囤的洗衣液，牌子无所谓，量大优先",
      "纸巾家庭装，越划算越好，别玩先涨后降",
    ],
    pref: { timeliness: 15, spec: 20, price: 50, afterSales: 15 },
    strict: "price",
  },
  {
    id: "p-biz",
    label: "商务出差党",
    intents: [
      "明天出差，今天必须到的充电宝和转换头",
      "差旅要用的轻薄本，慢一天都不行",
    ],
    pref: { timeliness: 50, spec: 20, price: 10, afterSales: 20 },
    strict: "fulfilment",
  },
  {
    id: "p-picky",
    label: "挑剔品质党",
    intents: [
      "要真皮的，别拿 PU 糊弄我，参数得对得上",
      "材质成分必须和标称一致，接受贵一点",
    ],
    pref: { timeliness: 15, spec: 55, price: 10, afterSales: 20 },
    strict: "listing",
  },
  {
    id: "p-aftersales",
    label: "售后控",
    intents: [
      "买贵点没关系，坏了要能马上换",
      "要七天无理由 + 上门取件，售后响应得快",
    ],
    pref: { timeliness: 20, spec: 20, price: 10, afterSales: 50 },
    strict: "service",
  },
  {
    id: "p-explorer",
    label: "尝鲜者",
    intents: [
      "有什么新奇好玩的小家电，挑合我口味的推给我",
      "想试点没买过的品类，别给我不相干的",
    ],
    pref: { timeliness: 20, spec: 30, price: 20, afterSales: 30 },
    strict: "selection",
  },
  {
    id: "p-bargain",
    label: "精明比价党",
    intents: ["同款哪家最划算，帮我算到手价再下单", "预算卡死，超一块都不要"],
    pref: { timeliness: 20, spec: 20, price: 45, afterSales: 15 },
    strict: "price",
  },
  {
    id: "p-loyal",
    label: "稳健复购党",
    intents: ["还是上次那种，准时送到就行", "固定周期补货，别断货别延误"],
    pref: { timeliness: 45, spec: 25, price: 15, afterSales: 15 },
    strict: "fulfilment",
  },
];

/** 卖家性格：决定天生短板，制造「不同卖家不同病因」 */
export type Archetype =
  "diligent" | "overclaim" | "slow" | "careless" | "mismatch" | "pricey";

const ARCHETYPE_WEAK: Record<Archetype, FactorKey | null> = {
  diligent: null,
  overclaim: "listing",
  slow: "fulfilment",
  careless: "service",
  mismatch: "selection",
  pricey: "price",
};

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  diligent: "踏实优等生",
  overclaim: "描述夸大党",
  slow: "物流慢郎中",
  careless: "售后甩手掌柜",
  mismatch: "选品跑偏",
  pricey: "价格偏高",
};

/** 单个意图榜上的卖家表现：分数随该类买家的成交结果演化 */
export interface IntentStat {
  /** 当前意图信誉分（0-100，随成交/差评/流失演化） */
  credit: number;
  /** 初始意图信誉分（= 该卖家对这类买家的天生匹配体验分） */
  startCredit: number;
  deals: number;
  happy: number;
}

export interface EcoMerchant {
  id: string;
  name: string;
  category: Category;
  archetype: Archetype;
  factors: Record<FactorKey, number>;
  credit: number;
  startCredit: number;
  deals: number;
  happy: number;
  issues: Record<FactorKey, number>;
  flagged: boolean;
  /** 按 persona.id 索引的意图榜信誉分：同一履约，不同买家给出不同名次 */
  intent: Record<string, IntentStat>;
}

const PERSONA_MAP: Record<string, EcoPersona> = Object.fromEntries(
  PERSONAS.map((p) => [p.id, p]),
);

export type Outcome = "happy" | "unhappy" | "lost";

export interface EcoDeal {
  id: string;
  day: number;
  personaLabel: string;
  intent: string;
  merchantId: string;
  merchantName: string;
  outcome: Outcome;
  issue?: FactorKey;
  note: string;
}

export interface EcoSim {
  seed: number;
  step: number;
  day: number;
  category: Category;
  merchants: EcoMerchant[];
  deals: EcoDeal[];
}

export const ECO_YEAR_DAYS = 365;
export const DAYS_PER_STEP = 6;
export const DEALS_PER_STEP = 3;
const DEAL_CAP = 16;
const FLAG_FLOOR = 28;

/** 意图榜信誉分单笔涨跌幅（比综合信用更敏感，让意图榜名次拉开更快） */
const INTENT_HAPPY = 2.4;
const INTENT_UNHAPPY = 3.4;
const INTENT_LOST = 1.2;

const ARCHETYPE_CYCLE: Archetype[] = [
  "overclaim",
  "slow",
  "careless",
  "mismatch",
  "pricey",
];

interface SeedInput {
  id: string;
  name: string;
  category: Category;
  credit: number;
}

const zeroIssues = (): Record<FactorKey, number> => ({
  listing: 0,
  service: 0,
  fulfilment: 0,
  selection: 0,
  promotion: 0,
  price: 0,
});

/** 按天生匹配度初始化各意图榜信誉分（弱项卖家在对应意图榜天然低分） */
const seedIntents = (
  factors: Record<FactorKey, number>,
): Record<string, IntentStat> => {
  const intent: Record<string, IntentStat> = {};
  for (const p of PERSONAS) {
    const base = Math.round(clamp(expScore(factors, p)));
    intent[p.id] = { credit: base, startCredit: base, deals: 0, happy: 0 };
  }
  return intent;
};

const cloneIntents = (
  intent: Record<string, IntentStat>,
): Record<string, IntentStat> =>
  Object.fromEntries(Object.entries(intent).map(([k, v]) => [k, { ...v }]));

function buildFactors(
  rng: Rng,
  credit: number,
  weak: FactorKey | null,
): Record<FactorKey, number> {
  const base = (): number => clamp(credit + (rng() - 0.5) * 12);
  const factors: Record<FactorKey, number> = {
    listing: base(),
    service: base(),
    fulfilment: base(),
    selection: base(),
    promotion: base(),
    price: base(),
  };
  if (weak) factors[weak] = clamp(Math.min(factors[weak], credit) - 30);
  return factors;
}

/** 从世界里某品类的真实卖家播种模拟（最高信用者=优等生，其余分配不同短板） */
export function createSim(
  sellers: SeedInput[],
  category: Category,
  seed = 42,
): EcoSim {
  const rng = makeRng(seed);
  const inCategory = sellers
    .filter((s) => s.category === category)
    .slice()
    .sort((a, b) => b.credit - a.credit);

  const merchants: EcoMerchant[] = inCategory.map((seller, i) => {
    const archetype: Archetype =
      i === 0 ? "diligent" : ARCHETYPE_CYCLE[(i - 1) % ARCHETYPE_CYCLE.length];
    const weak = ARCHETYPE_WEAK[archetype];
    const factors = buildFactors(rng, seller.credit, weak);
    return {
      id: seller.id,
      name: seller.name,
      category,
      archetype,
      factors,
      credit: seller.credit,
      startCredit: seller.credit,
      deals: 0,
      happy: 0,
      issues: zeroIssues(),
      flagged: false,
      intent: seedIntents(factors),
    };
  });

  return { seed, step: 0, day: 0, category, merchants, deals: [] };
}

/** persona 偏好 → 能力维度的映射体验分（0-100，纯按 factors 计算） */
export function expScore(
  factors: Record<FactorKey, number>,
  persona: EcoPersona,
): number {
  const p = persona.pref;
  const wSum = p.timeliness + p.spec + p.price + p.afterSales || 1;
  const specAbility = (factors.listing + factors.selection) / 2;
  return (
    (p.timeliness * factors.fulfilment +
      p.spec * specAbility +
      p.price * factors.price +
      p.afterSales * factors.service) /
    wSum
  );
}

function experience(m: EcoMerchant, persona: EcoPersona): number {
  return expScore(m.factors, persona);
}

/** 匹配分：体验分 × 可见性（推广差 → 更难进决策集） */
function matchScore(m: EcoMerchant, persona: EcoPersona): number {
  if (m.flagged) return 0;
  const visibility = 0.55 + 0.45 * (m.factors.promotion / 100);
  return experience(m, persona) * visibility;
}

/** 机会流失归因门槛：低于此的差距不足以判定为「因某短板出局」 */
const LOST_GAP_THRESHOLD = 2000;

interface Deficit {
  key: FactorKey;
  gap: number;
}

/** 买家在意、而卖家最差的维度（差评/流失主因），含差距强度 */
function topDeficit(m: EcoMerchant, persona: EcoPersona): Deficit {
  const p = persona.pref;
  const candidates: Deficit[] = [
    { key: "fulfilment", gap: p.timeliness * (100 - m.factors.fulfilment) },
    { key: "service", gap: p.afterSales * (100 - m.factors.service) },
    { key: "price", gap: p.price * (100 - m.factors.price) },
    {
      key: m.factors.listing <= m.factors.selection ? "listing" : "selection",
      gap: p.spec * (100 - Math.min(m.factors.listing, m.factors.selection)),
    },
  ];
  // persona 的挑剔维度额外加权
  for (const c of candidates) if (c.key === persona.strict) c.gap *= 1.4;
  return candidates.sort((a, b) => b.gap - a.gap)[0];
}

function attributeIssue(m: EcoMerchant, persona: EcoPersona): FactorKey {
  return topDeficit(m, persona).key;
}

let dealSeq = 0;
const dealId = (): string => `ecd-${(++dealSeq).toString(36)}`;

function happyNote(persona: EcoPersona, m: EcoMerchant): string {
  return `${persona.label} 满意收货 · ${m.name} 在关注点上达标`;
}

/** 推进一步：产生若干笔交易，更新卖家信誉 */
export function stepSim(sim: EcoSim): EcoSim {
  const rng = makeRng(sim.seed + sim.step * 1013904223);
  const day = Math.min(ECO_YEAR_DAYS, sim.day + DAYS_PER_STEP);
  const merchants = sim.merchants.map((m) => ({
    ...m,
    factors: { ...m.factors },
    issues: { ...m.issues },
    intent: cloneIntents(m.intent),
  }));
  const byId = new Map(merchants.map((m) => [m.id, m]));
  const newDeals: EcoDeal[] = [];

  const alive = merchants.filter((m) => !m.flagged);
  if (alive.length === 0) return { ...sim, step: sim.step + 1, day };

  for (let i = 0; i < DEALS_PER_STEP; i++) {
    const persona = pick(rng, PERSONAS);
    const intent = pick(rng, persona.intents);

    // 匹配：算分选冠军
    const scored = alive
      .map((m) => ({ m, score: matchScore(m, persona) }))
      .sort((a, b) => b.score - a.score);
    if (scored.length === 0) continue;
    const winner = scored[0].m;

    // 结果判定
    const exp = experience(winner, persona) + (rng() - 0.5) * 16;
    const winnerIntent = winner.intent[persona.id];
    if (exp >= 60) {
      winner.credit = clamp(winner.credit + 1.3);
      winner.happy += 1;
      winner.deals += 1;
      winnerIntent.credit = clamp(winnerIntent.credit + INTENT_HAPPY);
      winnerIntent.happy += 1;
      winnerIntent.deals += 1;
      newDeals.push({
        id: dealId(),
        day,
        personaLabel: persona.label,
        intent,
        merchantId: winner.id,
        merchantName: winner.name,
        outcome: "happy",
        note: happyNote(persona, winner),
      });
    } else {
      const issue = attributeIssue(winner, persona);
      winner.credit = clamp(winner.credit - 2.7);
      winner.issues[issue] += 1;
      winner.deals += 1;
      winnerIntent.credit = clamp(winnerIntent.credit - INTENT_UNHAPPY);
      winnerIntent.deals += 1;
      newDeals.push({
        id: dealId(),
        day,
        personaLabel: persona.label,
        intent,
        merchantId: winner.id,
        merchantName: winner.name,
        outcome: "unhappy",
        issue,
        note: `${persona.label} 差评 · ${FACTOR_MAP[issue].issue}`,
      });
    }

    // 机会流失：本该拿下这个 persona、却因某项短板出局的卖家。
    // 归因到「买家在意 + 卖家最差」的维度，让每种短板都能通过流失暴露出来。
    if (scored.length > 1) {
      const laggard = scored
        .slice(1)
        .map(({ m }) => ({ m, deficit: topDeficit(m, persona) }))
        .sort((a, b) => b.deficit.gap - a.deficit.gap)[0];
      if (laggard && laggard.deficit.gap > LOST_GAP_THRESHOLD) {
        const lostIssue = laggard.deficit.key;
        laggard.m.credit = clamp(laggard.m.credit - 1.1);
        laggard.m.issues[lostIssue] += 1;
        const lagIntent = laggard.m.intent[persona.id];
        lagIntent.credit = clamp(lagIntent.credit - INTENT_LOST);
        lagIntent.deals += 1;
        newDeals.push({
          id: dealId(),
          day,
          personaLabel: persona.label,
          intent,
          merchantId: laggard.m.id,
          merchantName: laggard.m.name,
          outcome: "lost",
          issue: lostIssue,
          note: `${laggard.m.name} 因${FACTOR_MAP[lostIssue].issue}错失 ${persona.label}`,
        });
      }
    }
  }

  // 风控沉底
  for (const m of byId.values()) {
    if (!m.flagged && m.credit < FLAG_FLOOR) m.flagged = true;
  }

  const deals = [...newDeals.reverse(), ...sim.deals].slice(0, DEAL_CAP);
  return { ...sim, step: sim.step + 1, day, merchants, deals };
}

export interface RankedMerchant extends EcoMerchant {
  rank: number;
}

/** 当前排行榜（信用降序，风控沉底） */
export function ranking(sim: EcoSim): RankedMerchant[] {
  return sim.merchants
    .slice()
    .sort((a, b) => {
      if (a.flagged !== b.flagged) return a.flagged ? 1 : -1;
      return b.credit - a.credit;
    })
    .map((m, i) => ({ ...m, rank: i + 1 }));
}

/** 某意图榜上单个卖家的名次行（含相对初始的名次变化） */
export interface IntentRankRow {
  merchantId: string;
  name: string;
  archetype: Archetype;
  score: number;
  rank: number;
  startRank: number;
  /** 名次变化：>0 上升、<0 下滑（= 初始名次 − 当前名次） */
  delta: number;
  flagged: boolean;
  deals: number;
  satisfaction: number;
}

export interface IntentBoard {
  personaId: string;
  label: string;
  /** 该类买家最挑剔的维度 */
  strict: FactorKey;
  strictLabel: string;
  rows: IntentRankRow[];
}

/**
 * 多意图榜：为每类买家意图各生成一张按意图信誉分排序的榜单。
 * 同一卖家在不同榜单名次可能天差地别——这正是「按意图排序」的价值所在。
 */
export function intentBoards(sim: EcoSim): IntentBoard[] {
  return PERSONAS.map((p) => {
    const startOrder = sim.merchants
      .slice()
      .sort((a, b) => b.intent[p.id].startCredit - a.intent[p.id].startCredit);
    const startRank = new Map(startOrder.map((m, i) => [m.id, i + 1]));

    const rows: IntentRankRow[] = sim.merchants
      .slice()
      .sort((a, b) => {
        if (a.flagged !== b.flagged) return a.flagged ? 1 : -1;
        return b.intent[p.id].credit - a.intent[p.id].credit;
      })
      .map((m, i) => {
        const st = m.intent[p.id];
        const rank = i + 1;
        const sr = startRank.get(m.id) ?? rank;
        return {
          merchantId: m.id,
          name: m.name,
          archetype: m.archetype,
          score: Math.round(st.credit),
          rank,
          startRank: sr,
          delta: sr - rank,
          flagged: m.flagged,
          deals: st.deals,
          satisfaction:
            st.deals > 0 ? Math.round((st.happy / st.deals) * 100) : 0,
        };
      });

    return {
      personaId: p.id,
      label: p.label,
      strict: p.strict,
      strictLabel: FACTOR_MAP[p.strict].label,
      rows,
    };
  });
}

/** 某卖家在单张意图榜上的站位 */
export interface IntentStanding {
  personaId: string;
  label: string;
  rank: number;
  total: number;
  delta: number;
  score: number;
}

export interface IntentDiagnosis {
  standings: IntentStanding[];
  best: IntentStanding | null;
  worst: IntentStanding | null;
  /** 跨意图对比建议：点明擅长与垫底的意图榜及其归因，为空表示各榜均衡 */
  advice: string;
}

/**
 * 跨意图诊断：算出该卖家最擅长与最垫底的意图榜，
 * 生成「同一履约、不同买家名次悬殊」的对比建议——比单维度话术更有指导价值。
 */
export function intentDiagnosis(
  sim: EcoSim,
  merchantId: string,
): IntentDiagnosis {
  const boards = intentBoards(sim);
  const total = sim.merchants.length;
  const standings: IntentStanding[] = boards.map((b) => {
    const row = b.rows.find((r) => r.merchantId === merchantId);
    return {
      personaId: b.personaId,
      label: b.label,
      rank: row?.rank ?? total,
      total,
      delta: row?.delta ?? 0,
      score: row?.score ?? 0,
    };
  });

  const best = standings.reduce<IntentStanding | null>(
    (acc, s) => (!acc || s.rank < acc.rank ? s : acc),
    null,
  );
  const worst = standings.reduce<IntentStanding | null>(
    (acc, s) => (!acc || s.rank > acc.rank ? s : acc),
    null,
  );

  let advice = "";
  if (best && worst && best.rank !== worst.rank) {
    const worstStrict = FACTOR_MAP[PERSONA_MAP[worst.personaId].strict].label;
    advice =
      `在「${best.label}」意图榜位列 #${best.rank}/${total}，` +
      `却在「${worst.label}」意图榜跌到 #${worst.rank}——` +
      `这类买家最看重的「${worstStrict}」正是你的短板所在。`;
  }

  return { standings, best, worst, advice };
}

export interface EcoDiagnosis {
  merchantId: string;
  name: string;
  archetype: Archetype;
  deals: number;
  satisfaction: number; // 0-100
  creditFrom: number;
  creditNow: number;
  topIssue: FactorKey | null;
  issueShare: number; // 0-1
  issueBreakdown: Array<{ key: FactorKey; label: string; count: number }>;
  summary: string;
  advice: string;
}

/** 生成某卖家的诊断报告：结果 + 归因 + 改进建议 */
export function diagnose(m: EcoMerchant, rank?: number): EcoDiagnosis {
  const totalIssues = FACTORS.reduce((sum, f) => sum + m.issues[f.key], 0);
  const breakdown = FACTORS.map((f) => ({
    key: f.key,
    label: f.label,
    count: m.issues[f.key],
  }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);
  const top = breakdown[0] ?? null;
  const satisfaction = m.deals > 0 ? Math.round((m.happy / m.deals) * 100) : 0;
  const rankTxt = rank ? ` · 当前排名 #${rank}` : "";
  const trend = m.credit >= m.startCredit ? "信用上行" : "信用下滑";

  let summary: string;
  let advice: string;
  if (m.flagged) {
    summary = `已被信用链识别并降级沉底：成交 ${m.deals} 笔、满意率 ${satisfaction}%，信用 ${Math.round(
      m.startCredit,
    )} → ${Math.round(m.credit)}${rankTxt}。`;
    advice = top
      ? `根因集中在「${FACTOR_MAP[top.key].label}」。${FACTOR_MAP[top.key].advice}唯一修复途径是优化后续履约。`
      : "优化整体履约质量，重建可信记录。";
  } else if (!top) {
    summary = `${trend}：成交 ${m.deals} 笔、满意率 ${satisfaction}%，信用 ${Math.round(
      m.startCredit,
    )} → ${Math.round(m.credit)}${rankTxt}，无明显短板。`;
    advice = "保持履约稳定，可小幅拉高推广精度以扩大优质买家覆盖。";
  } else {
    summary = `${trend}：成交 ${m.deals} 笔、满意率 ${satisfaction}%，信用 ${Math.round(
      m.startCredit,
    )} → ${Math.round(m.credit)}${rankTxt}。主要失分来自「${FACTOR_MAP[top.key].label}」。`;
    advice = FACTOR_MAP[top.key].advice;
  }

  return {
    merchantId: m.id,
    name: m.name,
    archetype: m.archetype,
    deals: m.deals,
    satisfaction,
    creditFrom: Math.round(m.startCredit),
    creditNow: Math.round(m.credit),
    topIssue: top?.key ?? null,
    issueShare: top && totalIssues ? top.count / totalIssues : 0,
    issueBreakdown: breakdown,
    summary,
    advice,
  };
}

/** tick 天数 → 拟人化的「第 N 天 / 第 M 月」 */
export function dayLabel(day: number): string {
  const d = Math.min(ECO_YEAR_DAYS, Math.round(day));
  if (d >= ECO_YEAR_DAYS) return "整整一年";
  const month = Math.floor(d / 30);
  return month < 1 ? `第 ${d} 天` : `第 ${month} 个月`;
}

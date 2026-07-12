/* ============================================================
   决策剧场 · 固定可复现数据
   幕一「卖家海选」：几十家 S-Agent 提案飞入，Agent 逐个刷掉，留 3 家
   幕二「议价擂台」：C-Agent ↔ S-Agent 回合对弈，筹码=链上硬数据，价格收敛
   —— 是商品来面试你，不是你去逛店
   ============================================================ */

/** 本场需求（与「出差轻薄本采购」同一笔，串起买家端叙事） */
export const THEATER_DEMAND = {
  title: "出差轻薄本采购",
  product: "14 英寸 AI 轻薄本",
  budget: 9000,
  withinDays: 3,
  constraints: ["≤1.3kg", "续航 ≥12h", "3 天内送达", "全国联保"],
  note: "匿名需求轮廓 · 不暴露身份与精准底价",
} as const;

export type RejectKind =
  "credit" | "spec" | "timeliness" | "budget" | "aftersales";

export interface LineupCandidate {
  id: string;
  seller: string;
  credit: number;
  price: number;
  status: "pass" | "reject";
  /** 淘汰归因（reject）或入选理由（pass） */
  reason: string;
  rejectKind?: RejectKind;
}

const REJECT_BRANDS = [
  "特惠数码",
  "极速3C",
  "环球电子",
  "闪购优选",
  "数码岛",
  "捷创科技",
  "惠买网",
  "星链电子",
  "速达3C",
  "鼎盛数码",
  "联合优选",
  "云购商城",
  "极客仓",
  "众诚电子",
  "捷丰数码",
  "优达优选",
  "恒信3C",
  "速购网",
  "明达电子",
  "汇通数码",
  "智选优品",
  "速联科技",
  "鑫源电子",
  "捷通商城",
  "优诚数码",
  "速卖通选",
  "联采优品",
  "锐驰电子",
];

const REJECT_KINDS: RejectKind[] = [
  "credit",
  "spec",
  "timeliness",
  "budget",
  "aftersales",
];

function rejectReason(kind: RejectKind, c: LineupCandidate): string {
  switch (kind) {
    case "credit":
      return `信用 ${c.credit} · 低于准入线 70`;
    case "spec":
      return "参数抽检与标称不符 · 命中掺假记录";
    case "timeliness":
      return "最快 5 天达 · 超过 3 天时限";
    case "budget":
      return `报价 ¥${c.price.toLocaleString()} · 超出预算 ¥9,000`;
    case "aftersales":
      return "售后响应分 62 · 低于阈值 80";
  }
}

function buildRejects(): LineupCandidate[] {
  return REJECT_BRANDS.map((brand, i) => {
    const kind = REJECT_KINDS[i % REJECT_KINDS.length];
    const credit =
      kind === "credit" ? 38 + ((i * 5) % 30) : 60 + ((i * 7) % 28);
    const price =
      kind === "budget" ? 9200 + (i % 5) * 320 : 8100 + ((i * 130) % 800);
    const candidate: LineupCandidate = {
      id: `rj-${i}`,
      seller: `${brand}·数码`,
      credit,
      price,
      status: "reject",
      reason: "",
      rejectKind: kind,
    };
    candidate.reason = rejectReason(kind, candidate);
    return candidate;
  });
}

/** 3 家入选（与 demoData laptop offers 对齐，直接进入幕二擂台） */
const FINALISTS: LineupCandidate[] = [
  {
    id: "ps-yuncang",
    seller: "云仓·旗舰店",
    credit: 88,
    price: 8499,
    status: "pass",
    reason: "时效 95 · 售后 96 · 参数符合 95，综合风险最低",
  },
  {
    id: "ps-jiwu",
    seller: "极物·数码",
    credit: 82,
    price: 8299,
    status: "pass",
    reason: "价格更低 · 参数达标，售后略弱",
  },
  {
    id: "ps-ruijie",
    seller: "锐捷·数码",
    credit: 76,
    price: 8199,
    status: "pass",
    reason: "价格最低 · 勉强满足时限，售后偏弱",
  },
];

/** 海选处理顺序：把 3 家入选散布在淘汰流中，逐步浮现 */
export const LINEUP_POOL: LineupCandidate[] = (() => {
  const rejects = buildRejects();
  const pool: LineupCandidate[] = [];
  const slots = [6, 15, 24]; // 入选者出现的位置
  let f = 0;
  for (let i = 0; i < rejects.length; i++) {
    if (slots.includes(i) && f < FINALISTS.length) {
      pool.push(FINALISTS[f++]);
    }
    pool.push(rejects[i]);
  }
  while (f < FINALISTS.length) pool.push(FINALISTS[f++]);
  return pool;
})();

export const LINEUP_STATS = {
  total: LINEUP_POOL.length,
  passed: FINALISTS.length,
  rejected: LINEUP_POOL.length - FINALISTS.length,
};

/** 幕二 · 议价擂台回合 */
export type CardType = "open" | "evidence" | "counter" | "concession" | "close";

export interface DealRound {
  actor: "buyer" | "seller";
  cardType: CardType;
  title: string;
  detail: string;
  /** 本回合结束后的桌面价格 */
  price: number;
  /** 关键筹码（链上数据） */
  chip?: string;
}

export const ARENA_SELLER = "云仓·旗舰店";
export const ARENA_OPENING = 8799;
export const ARENA_FINAL = 8499;

export const ARENA_ROUNDS: DealRound[] = [
  {
    actor: "seller",
    cardType: "open",
    title: "开价 ¥8,799",
    detail: "标配 2 年联保、次日达。信用 88，3C 品类排名第 1。",
    price: 8799,
    chip: "品类履约榜 #1",
  },
  {
    actor: "buyer",
    cardType: "evidence",
    title: "亮证据：同款近价",
    detail: "链上查到同配置 7 天前可信成交价 ¥8,499；竞品极物含运 ¥8,299。",
    price: 8799,
    chip: "链上成交价 ¥8,499",
  },
  {
    actor: "seller",
    cardType: "counter",
    title: "反制：溢价合理",
    detail:
      "极物售后响应分仅 80，我方 96；186 笔履约零争议。差价买的是确定性。",
    price: 8799,
    chip: "售后 96 vs 80",
  },
  {
    actor: "buyer",
    cardType: "counter",
    title: "加筹码换让价",
    detail:
      "认可你的时效与售后。我方即时确认 + 全款托管，换 ¥8,499 + 3 年联保。",
    price: 8599,
    chip: "托管支付 · 零违约风险",
  },
  {
    actor: "seller",
    cardType: "concession",
    title: "让步：¥8,499 + 延保",
    detail: "接受 ¥8,499，加赠 3 年联保（市值 ¥400）；条件：锁定次日达。",
    price: 8499,
    chip: "延保市值 ¥400",
  },
  {
    actor: "buyer",
    cardType: "close",
    title: "成交",
    detail:
      "¥8,499 成交，较开价省 ¥300 且延保多 1 年。全部硬约束满足，请求你确认。",
    price: 8499,
    chip: "省 ¥300 + 延保 1 年",
  },
];

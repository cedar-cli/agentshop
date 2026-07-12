/* ============================================================
   RepChain 世界 · 领域模型
   三个视图（买家端/商家端/网络拓扑）共享的唯一数据契约
   ============================================================ */

export type AgentRole = "consumer" | "seller" | "supply" | "factory";

/** 品类 */
export const CATEGORIES = ["生鲜", "3C数码", "日用百货", "服饰"] as const;
export type Category = (typeof CATEGORIES)[number];

/** 履约鉴证六维（§3.3，全客观硬指标） */
export interface CreditVector {
  timeliness: number; // 时效履约率
  spec: number; // 参数符合度
  afterSales: number; // 售后响应时效
  compensation: number; // 赔付履约率
  priceStability: number; // 价格稳定度
  packaging: number; // 包装损耗率（得分越高=损耗越低）
}

export const CREDIT_DIMS: Array<{
  key: keyof CreditVector;
  label: string;
  short: string;
}> = [
  { key: "timeliness", label: "时效履约率", short: "时效" },
  { key: "spec", label: "参数符合度", short: "品质" },
  { key: "afterSales", label: "售后响应", short: "售后" },
  { key: "compensation", label: "赔付履约", short: "赔付" },
  { key: "priceStability", label: "价格稳定", short: "价稳" },
  { key: "packaging", label: "包装完好", short: "包装" },
];

/** 买家偏好权重（§3.4/§5，驱动决策集排序） */
export interface Preference {
  timeliness: number;
  spec: number;
  price: number;
  afterSales: number;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  category: Category;
  region: number; // 0-3，用于拓扑活跃度分层
  online: boolean;
  /** 综合信用分 0-100（由 creditVector 聚合，卖家侧有意义） */
  credit: number;
  vector: CreditVector;
  /** 交易累计 */
  dealCount: number;
  /** 风控状态 */
  flagged: boolean;
  /** 专业鉴证 Agent 认证 */
  professional: boolean;
  /** 拓扑坐标（引擎维护，视图共享） */
  x: number;
  y: number;
}

export type TxStatus =
  "signal" | "bidding" | "settled" | "fulfilling" | "attested";

export interface Proposal {
  sellerId: string;
  price: number;
  promisedDays: number;
  credit: number;
  /** 依买家偏好加权后的匹配分 */
  matchScore: number;
  rank: number;
  won: boolean;
}

export interface Transaction {
  id: string;
  buyerId: string;
  sellerId: string | null; // 成交后确定
  category: Category;
  /** 需求轮廓：预算上限 / 时限 / 数量 */
  maxPrice: number;
  withinDays: number;
  qty: number;
  status: TxStatus;
  proposals: Proposal[];
  price: number | null;
  createdTick: number;
  statusTick: number;
  /** 是否上游供应链交易（供应链 Agent 作为买家） */
  upstream: boolean;
  /** 风控注入标记 */
  tampered?: boolean;
}

export type Verdict = "fulfil" | "breach";

/** 履约鉴证芯片（上链，不可篡改，取代人类点评） */
export interface Attestation {
  id: string;
  txId: string;
  sellerId: string;
  /** 成交卖家名（哪家店） */
  sellerName: string;
  /** 成交卖家综合信用 */
  sellerCredit: number;
  buyerId: string;
  buyerName: string;
  category: Category;
  verdict: Verdict;
  /** 成交价 */
  price: number;
  /** 参与竞价的卖家数 */
  competitors: number;
  /** 承诺送达天数 */
  promisedDays: number;
  /** 本次测得的六维得分 */
  scores: CreditVector;
  overall: number;
  /** 买家信用加权后的权重（§3.3） */
  weight: number;
  buyerCredit: number;
  professional: boolean;
  tick: number;
  /** A2A 议价成交对话（买家 C-Agent ↔ 卖家 S-Agent ↔ RepChain） */
  conversation: DealMessage[];
  /** 溯源链路 */
  trace: TraceStep[];
}

/** 交易过程中的一条 A2A 消息 */
export interface DealMessage {
  actor: "buyer" | "seller" | "chain"; // C-Agent / S-Agent / RepChain
  text: string;
  /** 附带的硬证据/结果标签 */
  meta?: string;
}

export interface TraceStep {
  node: string; // 订单/物流/仓储/质检/售后
  detail: string;
  ok: boolean;
}

/** 买家 Inbox 营销权（§5.4） */
export type InboxMode = "open" | "closed" | "conditional";

/** 主动服务场景（§5.3） */
export interface ActiveScene {
  id: string;
  title: string;
  sample: string;
  desc: string;
  armed: boolean;
  progress: number; // 0-100 监测进度
  triggered: boolean;
}

/** 全局风控事件类型 */
export type RiskKind = "fake-tx" | "brush" | "breach";

export interface RiskEvent {
  id: string;
  kind: RiskKind;
  targetId: string;
  targetName: string;
  tick: number;
  message: string;
  /** 是否已被信用链校验识别并处置 */
  resolved: boolean;
}

/** 世界快照 */
export interface WorldState {
  tick: number;
  running: boolean;
  speed: number; // 1 / 2 / 4
  agents: Record<string, Agent>;
  transactions: Transaction[];
  attestations: Attestation[]; // 链上，最新在前
  riskEvents: RiskEvent[];
  /** 主视角买家 id */
  meConsumerId: string;
  /** 主视角卖家 id */
  meSellerId: string;
  preference: Preference;
  inbox: InboxMode;
  inboxCategory: Category | null;
  activeScenes: ActiveScene[];
}

export const EVENT_TYPES = [
  "purchase.requested",
  "proposal.submitted",
  "seller.selected",
  // 买家在选标后对赢家发起的一轮还价（砍价请求）
  "counter.offer",
  // 商家对还价的应答：接受或坚持底线
  "counter.response",
  "order.confirmed",
] as const;

export type AgentEventType = (typeof EVENT_TYPES)[number];

export interface DecisionWeights {
  price: number;
  reputation: number;
  delivery: number;
}

export interface PurchaseRequest {
  product: string;
  quantity: number;
  budget: number;
  deadline: string;
  constraints: {
    allergenFree: string[];
  };
  weights: DecisionWeights;
}

export interface Proposal {
  sellerId: string;
  totalPrice: number;
  deliveryHours: number;
  reputation: number;
  allergenSafe: boolean;
  reasoning: string;
  generatedBy: "llm" | "fallback";
  fallbackReason?: string;
}

export interface SellerSelection {
  sellerId: string;
  score: number;
  reason: string;
  proposal: Proposal;
}

/**
 * 买家发起的还价请求。
 * 买家选出赢家后，基于预算与市场最低价推算一个目标价，向赢家争取进一步让利。
 */
export interface CounterOffer {
  // 被还价的目标商家
  sellerId: string;
  // 商家原始报价（用于对照让步幅度）
  originalPrice: number;
  // 买家期望达成的目标价
  targetPrice: number;
  // 还价理由（用于 demo 展示买家 Agent 的谈判话术）
  reasoning: string;
}

/**
 * 商家对还价的应答。
 * 商家可以接受买家目标价、部分让步，或坚持原价拒绝让步——但任何情况下都不得跌破成本底线。
 */
export interface CounterResponse {
  sellerId: string;
  // 商家是否作出了让步（最终价低于原始报价即视为让步）
  accepted: boolean;
  // 本轮谈判后的最终成交价
  finalPrice: number;
  // 相对原始报价的让利金额（originalPrice - finalPrice，>= 0）
  concession: number;
  // 应答话术（用于 demo 展示商家 Agent 的谈判姿态）
  reasoning: string;
  // 应答由 LLM 生成还是规则兜底
  generatedBy: "llm" | "fallback";
  // 触发兜底的原因（仅在 fallback 时存在）
  fallbackReason?: string;
}

export interface ConfirmedOrder {
  orderId: string;
  sellerId: string;
  totalPrice: number;
  status: "confirmed";
}

export interface EventPayloadMap {
  "purchase.requested": PurchaseRequest;
  "proposal.submitted": Proposal;
  "seller.selected": SellerSelection;
  "counter.offer": CounterOffer;
  "counter.response": CounterResponse;
  "order.confirmed": ConfirmedOrder;
}

export type AgentEvent<T extends AgentEventType = AgentEventType> =
  T extends AgentEventType
    ? {
        id: string;
        transactionId: string;
        type: T;
        source: string;
        target?: string;
        timestamp: string;
        causationId?: string;
        payload: EventPayloadMap[T];
      }
    : never;

export type NewAgentEvent<T extends AgentEventType = AgentEventType> =
  T extends AgentEventType
    ? Omit<AgentEvent<T>, "id" | "timestamp"> & {
        id?: string;
        timestamp?: string;
      }
    : never;

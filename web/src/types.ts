export type EventType =
  | "purchase.requested"
  | "proposal.submitted"
  | "seller.selected"
  | "counter.offer"
  | "counter.response"
  | "order.confirmed";

export interface PurchaseRequest {
  product: string;
  quantity: number;
  budget: number;
  deadline: string;
  constraints: { allergenFree: string[] };
  weights: { price: number; reputation: number; delivery: number };
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

export interface ConfirmedOrder {
  orderId: string;
  sellerId: string;
  totalPrice: number;
  status: "confirmed";
}

export interface CounterOffer {
  sellerId: string;
  originalPrice: number;
  targetPrice: number;
  reasoning: string;
}

export interface CounterResponse {
  sellerId: string;
  accepted: boolean;
  finalPrice: number;
  concession: number;
  reasoning: string;
  generatedBy: "llm" | "fallback";
  fallbackReason?: string;
}

export interface AgentEvent {
  id: string;
  sequence: number;
  transactionId: string;
  type: EventType;
  source: string;
  target?: string;
  timestamp: string;
  causationId?: string;
  previousHash: string;
  hash: string;
  payload:
    | PurchaseRequest
    | Proposal
    | SellerSelection
    | CounterOffer
    | CounterResponse
    | ConfirmedOrder;
}

export interface TransactionSnapshot {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  request: PurchaseRequest;
  error?: string;
  chainValid: boolean;
  events: AgentEvent[];
}

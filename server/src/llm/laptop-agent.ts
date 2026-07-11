import type {
  LaptopCounterOffer,
  LaptopIntent,
  LaptopProposal,
} from "../protocol/events.js";
import type { LaptopSellerFact } from "../scenario/laptop-purchase.js";

export interface LaptopQuoteDraft {
  quotedPriceCny: number;
  reasoning: string;
}

export interface LaptopNegotiationDraft {
  finalPriceCny: number;
  reasoning: string;
}

export interface LaptopLlmAgent {
  parseIntent(requestText: string): Promise<Omit<LaptopIntent, "requestText" | "generatedBy" | "fallbackReason">>;
  generateProposal(seller: LaptopSellerFact, intent: LaptopIntent): Promise<LaptopQuoteDraft>;
  negotiate(seller: LaptopSellerFact, intent: LaptopIntent, offer: LaptopCounterOffer): Promise<LaptopNegotiationDraft>;
}

export function validateLaptopQuote(
  draft: LaptopQuoteDraft,
  seller: LaptopSellerFact,
  intent: LaptopIntent,
): LaptopQuoteDraft {
  if (draft.quotedPriceCny < seller.minimumPriceCny) throw new Error("报价低于商家底价");
  if (draft.quotedPriceCny > seller.listPriceCny) throw new Error("报价高于挂牌价");
  if (seller.minimumPriceCny <= intent.budgetCny && draft.quotedPriceCny > intent.budgetCny) {
    throw new Error("报价忽略买家预算");
  }
  return {
    quotedPriceCny: Number(Math.max(draft.quotedPriceCny, seller.preferredPriceCny).toFixed(0)),
    reasoning: draft.reasoning.trim().slice(0, 240),
  };
}

export function validateLaptopNegotiation(
  draft: LaptopNegotiationDraft,
  seller: LaptopSellerFact,
  offer: LaptopCounterOffer,
): LaptopNegotiationDraft {
  if (draft.finalPriceCny < seller.minimumPriceCny) throw new Error("议价结果低于商家底价");
  if (draft.finalPriceCny > offer.originalPriceCny) throw new Error("议价后价格反而上涨");
  return {
    finalPriceCny: Number(draft.finalPriceCny.toFixed(0)),
    reasoning: draft.reasoning.trim().slice(0, 240),
  };
}

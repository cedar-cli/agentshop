import type { DelegationIntent } from "../protocol/events.js";
import type { DelegationSellerFact } from "../scenario/product-to-seller.js";

/**
 * 通用委托 LLM Agent 契约：把出差轻薄本专用的 LaptopLlmAgent 泛化到任意品类。
 *
 * - parseIntent：把消费者自由购物文本解析成结构化 DelegationIntent（通用 mustHave 硬约束）。
 * - generateProposal：让「商品卖家」基于真实商品事实给出报价与理由。
 * - negotiate：中标卖家对买家目标价做一次让步应答。
 *
 * 三者都可能因模型不可用抛错，由工作流的 try/catch 退回确定性 fallback。
 */

export interface DelegationQuoteDraft {
  quotedPriceCny: number;
  reasoning: string;
}

export interface DelegationNegotiationDraft {
  finalPriceCny: number;
  reasoning: string;
}

// 买家对中标卖家的一次还价请求（结构与 laptop 场景一致，复用工作流骨架）
export interface DelegationCounterOfferInput {
  originalPriceCny: number;
  targetPriceCny: number;
}

export interface DelegationLlmAgent {
  // 解析意图：返回不含来源标记与原文的核心字段（由工作流补齐）
  parseIntent(
    requestText: string,
  ): Promise<Omit<DelegationIntent, "requestText" | "generatedBy" | "fallbackReason">>;
  generateProposal(
    seller: DelegationSellerFact,
    intent: DelegationIntent,
  ): Promise<DelegationQuoteDraft>;
  negotiate(
    seller: DelegationSellerFact,
    intent: DelegationIntent,
    offer: DelegationCounterOfferInput,
  ): Promise<DelegationNegotiationDraft>;
}

/**
 * 校验 LLM 报价：不得低于卖家底价、不得高于挂牌价；
 * 若卖家底价在预算内却报出超预算价，视为忽略预算而拒绝。
 * 通过后夹逼到 [preferredPrice, listPrice] 的下界并截断理由长度。
 */
export function validateDelegationQuote(
  draft: DelegationQuoteDraft,
  seller: DelegationSellerFact,
  intent: DelegationIntent,
): DelegationQuoteDraft {
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

/**
 * 校验 LLM 议价结果：不得低于卖家底价、不得高于原始报价（不能越谈越贵）。
 */
export function validateDelegationNegotiation(
  draft: DelegationNegotiationDraft,
  seller: DelegationSellerFact,
  offer: DelegationCounterOfferInput,
): DelegationNegotiationDraft {
  if (draft.finalPriceCny < seller.minimumPriceCny) throw new Error("议价结果低于商家底价");
  if (draft.finalPriceCny > offer.originalPriceCny) throw new Error("议价后价格反而上涨");
  return {
    finalPriceCny: Number(draft.finalPriceCny.toFixed(0)),
    reasoning: draft.reasoning.trim().slice(0, 240),
  };
}

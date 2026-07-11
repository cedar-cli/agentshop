import type { CounterOffer, PurchaseRequest } from "../protocol/events.js";
import { minimumAllowedPrice } from "./proposal-generator.js";
import type { SellerProfile } from "./seller-profiles.js";

/**
 * 商家对一轮还价给出的决策结果（未落地成事件前的中间结构）。
 * finalPrice 为本轮谈判后的最终成交价，reasoning 为谈判话术。
 */
export interface NegotiationDecision {
  finalPrice: number;
  reasoning: string;
}

/**
 * 砍价决策器接口。
 * 与 ProposalGenerator 平行：真实实现走 LLM，测试与兜底走规则实现。
 */
export interface CounterNegotiator {
  /**
   * 根据商家画像、买家还价与原始报价，决定本轮最终成交价与话术。
   * @param profile 商家画像（含成本、最低利润率、经营策略）
   * @param request 原始采购需求（含数量，用于换算成本底线）
   * @param offer   买家发起的还价（含原价与目标价）
   */
  negotiate(
    profile: SellerProfile,
    request: PurchaseRequest,
    offer: CounterOffer,
  ): Promise<NegotiationDecision>;
}

/**
 * 规则兜底的砍价决策。
 * 商家愿意让步，但绝不跌破成本底线（unitCost * quantity * (1 + minimumMargin)）：
 * - 若买家目标价仍在成本底线之上：接受目标价，让利到目标价；
 * - 若买家目标价击穿成本底线：只让步到成本底线，坚持不再退。
 * 用于 LLM 不可用或返回非法结果时保证 demo 不崩。
 */
export function createFallbackDecision(
  profile: SellerProfile,
  request: PurchaseRequest,
  offer: CounterOffer,
): NegotiationDecision {
  const floor = minimumAllowedPrice(profile, request);

  // 让步不能低于成本底线，也不应高于商家自己的原始报价
  const finalPrice = Math.min(
    offer.originalPrice,
    Math.max(offer.targetPrice, floor),
  );

  // 是否真的作出了让步（考虑浮点误差留 0.01 容差）
  const conceded = finalPrice < offer.originalPrice - 0.01;
  const reasoning = conceded
    ? "在成本底线之上作出让步，以促成本单成交"
    : "报价已贴近成本底线，无法进一步让利，维持原价";

  return {
    finalPrice: Number(finalPrice.toFixed(2)),
    reasoning,
  };
}

/**
 * 校验一份砍价决策是否合法，非法则抛错（由调用方降级到兜底）。
 * 核心硬约束：最终价不得跌破成本底线，也不得高于商家原始报价（不许借还价涨价）。
 */
export function validateNegotiationDecision(
  decision: NegotiationDecision,
  profile: SellerProfile,
  request: PurchaseRequest,
  offer: CounterOffer,
): NegotiationDecision {
  const floor = minimumAllowedPrice(profile, request);

  if (decision.finalPrice < floor) {
    throw new Error(`${profile.sellerId} counter price is below its cost floor`);
  }

  if (decision.finalPrice > offer.originalPrice + 0.01) {
    throw new Error(`${profile.sellerId} raised price during negotiation`);
  }

  return {
    finalPrice: Number(decision.finalPrice.toFixed(2)),
    reasoning: decision.reasoning.trim().slice(0, 240),
  };
}

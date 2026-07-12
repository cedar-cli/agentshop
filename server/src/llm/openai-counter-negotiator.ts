import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { SellerProfile } from "../agents/seller-profiles.js";
import type {
  CounterNegotiator,
  NegotiationDecision,
} from "../agents/counter-negotiator.js";
import { minimumAllowedPrice } from "../agents/proposal-generator.js";
import type { CounterOffer, PurchaseRequest } from "../protocol/events.js";
import { createOpenAIClient, getModel } from "./client.js";

// LLM 只需产出最终成交价与话术；让步幅度、是否接受由上层根据 finalPrice 推导
const negotiationDecisionSchema = z.object({
  finalPrice: z.number().positive(),
  reasoning: z.string().min(1).max(200),
});

/**
 * 基于 LLM 的砍价决策器。
 * 卖家 Agent 收到买家还价后，让模型在成本底线与经营策略约束下决定让步到什么价位，并给出谈判话术。
 * 返回结果仍会被 validateNegotiationDecision 二次校验，非法则由 SellerAgent 降级到规则兜底。
 */
export class OpenAICounterNegotiator implements CounterNegotiator {
  private readonly client = createOpenAIClient();

  async negotiate(
    profile: SellerProfile,
    request: PurchaseRequest,
    offer: CounterOffer,
  ): Promise<NegotiationDecision> {
    const floor = minimumAllowedPrice(profile, request);

    const response = await this.client.responses.parse(
      {
        model: getModel(),
        reasoning: { effort: "low" },
        max_output_tokens: 300,
        input: [
          {
            role: "system",
            content:
              "你是一个自主经营的卖家销售 Agent，正在与买家 Agent 进行一轮价格谈判。买家已选中你并提出还价。请在成本底线与经营策略之间权衡：可以让步以促成交，但最终成交价绝不能低于成本底线，也不得高于你的原始报价。谈判话术不超过 80 个汉字。",
          },
          {
            role: "user",
            content: JSON.stringify({
              counterOffer: {
                originalPrice: offer.originalPrice,
                buyerTargetPrice: offer.targetPrice,
                buyerReasoning: offer.reasoning,
              },
              seller: {
                sellerId: profile.sellerId,
                costFloor: Number(floor.toFixed(2)),
                reputation: profile.reputation,
                strategy: profile.strategy,
              },
            }),
          },
        ],
        text: {
          format: zodTextFormat(negotiationDecisionSchema, "counter_decision"),
        },
      },
      { signal: AbortSignal.timeout(8_000) },
    );

    if (!response.output_parsed) {
      throw new Error(`${profile.sellerId} returned no structured decision`);
    }

    return response.output_parsed;
  }
}

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { SellerProfile } from "../agents/seller-profiles.js";
import type {
  GeneratedProposal,
  ProposalGenerator,
} from "../agents/proposal-generator.js";
import { minimumAllowedPrice } from "../agents/proposal-generator.js";
import type { PurchaseRequest } from "../protocol/events.js";
import { createOpenAIClient, getModel } from "./client.js";

const generatedProposalSchema = z.object({
  totalPrice: z.number().positive(),
  deliveryHours: z.number().positive(),
  reasoning: z.string().min(1).max(200),
});

export class OpenAIProposalGenerator implements ProposalGenerator {
  private readonly client = createOpenAIClient();

  async generate(
    profile: SellerProfile,
    request: PurchaseRequest,
  ): Promise<GeneratedProposal> {
    const minimumPrice = minimumAllowedPrice(profile, request);

    const response = await this.client.responses.parse(
      {
        model: getModel(),
        reasoning: { effort: "low" },
        max_output_tokens: 300,
        input: [
          {
            role: "system",
            content:
              "你是一个自主经营的卖家销售 Agent。根据买家需求、库存、成本底线和经营策略生成真实可履约的报价。不得低于成本底线，不得承诺短于最低交付时间。报价理由不超过 100 个汉字。",
          },
          {
            role: "user",
            content: JSON.stringify({
              purchaseRequest: request,
              seller: {
                sellerId: profile.sellerId,
                inventory: profile.inventory,
                minimumAllowedPrice: Number(minimumPrice.toFixed(2)),
                minimumDeliveryHours: profile.minimumDeliveryHours,
                reputation: profile.reputation,
                strategy: profile.strategy,
              },
            }),
          },
        ],
        text: {
          format: zodTextFormat(generatedProposalSchema, "seller_proposal"),
        },
      },
      { signal: AbortSignal.timeout(8_000) },
    );

    if (!response.output_parsed) {
      throw new Error(`${profile.sellerId} returned no structured proposal`);
    }

    return response.output_parsed;
  }
}

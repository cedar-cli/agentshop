import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  DemandIntentDraft,
  DemandNeedFact,
  DemandNetworkLlmAgent,
  SupplyNegotiationDraft,
  SupplyNegotiationInput,
} from "./demand-network-agent.js";
import { createOpenAIClient, getModel } from "./client.js";

const intentSchema = z.object({
  scene: z.string().min(1).max(80), quantity: z.number().int().positive(),
  budgetUsd: z.number().positive(), deadlineDays: z.number().positive(),
  requirements: z.array(z.string().min(1).max(80)).min(1).max(8),
});
const negotiationSchema = z.object({
  unitPriceUsd: z.number().positive(), depositPercent: z.number().min(0).max(100),
  deliveryDays: z.number().positive(), delayPenaltyPercentPerDay: z.number().min(0).max(10),
  reasoning: z.string().min(1).max(240),
});

export class OpenAIDemandNetworkAgent implements DemandNetworkLlmAgent {
  private readonly client = createOpenAIClient();

  async parseIntent(need: DemandNeedFact): Promise<DemandIntentDraft> {
    const response = await this.client.responses.parse({
      model: getModel(), reasoning: { effort: "low" }, max_output_tokens: 300,
      input: [
        { role: "system", content: "你是市场 Intent Extractor。把买家需求压缩成场景、数量、总预算、交期天数和可验证要求。不得虚构未表达的高风险条件；不明确时使用输入 fallbackIntent 的保守值。" },
        { role: "user", content: JSON.stringify(need) },
      ],
      text: { format: zodTextFormat(intentSchema, "demand_network_intent") },
    }, { signal: AbortSignal.timeout(8_000) });
    if (!response.output_parsed) throw new Error("模型未返回结构化市场意图");
    return response.output_parsed;
  }

  async negotiateSupply(input: SupplyNegotiationInput): Promise<SupplyNegotiationDraft> {
    const response = await this.client.responses.parse({
      model: getModel(), reasoning: { effort: "low" }, max_output_tokens: 300,
      input: [
        { role: "system", content: "你是 Seller Agent，与上游 Supply Agent 完成一次受约束协商。单价不得高于 maximumUnitPriceUsd，交期不得超过 targetDeliveryDays，定金不超过40%，必须包含每日延迟赔付。只依据输入事实。" },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: { format: zodTextFormat(negotiationSchema, "demand_supply_negotiation") },
    }, { signal: AbortSignal.timeout(8_000) });
    if (!response.output_parsed) throw new Error("模型未返回供应协商结果");
    return response.output_parsed;
  }
}

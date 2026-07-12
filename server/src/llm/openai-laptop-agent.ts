import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { LaptopCounterOffer, LaptopIntent } from "../protocol/events.js";
import type { LaptopSellerFact } from "../scenario/laptop-purchase.js";
import type {
  LaptopLlmAgent,
  LaptopNegotiationDraft,
  LaptopQuoteDraft,
} from "./laptop-agent.js";
import { createOpenAIClient, getModel } from "./client.js";

const intentSchema = z.object({
  product: z.string().min(1).max(120),
  budgetCny: z.number().positive(),
  deadlineHours: z.number().positive(),
  maxWeightKg: z.number().positive(),
  minBatteryHours: z.number().positive(),
  requiresNationalWarranty: z.boolean(),
  priorities: z.object({
    timeliness: z.number().min(0).max(100),
    spec: z.number().min(0).max(100),
    price: z.number().min(0).max(100),
    afterSales: z.number().min(0).max(100),
  }),
});

const quoteSchema = z.object({
  quotedPriceCny: z.number().positive(),
  reasoning: z.string().min(1).max(200),
});

const negotiationSchema = z.object({
  finalPriceCny: z.number().positive(),
  reasoning: z.string().min(1).max(200),
});

export class OpenAILaptopAgent implements LaptopLlmAgent {
  private readonly client = createOpenAIClient();

  async parseIntent(requestText: string) {
    const response = await this.client.responses.parse(
      {
        model: getModel(),
        reasoning: { effort: "low" },
        max_output_tokens: 350,
        input: [
          {
            role: "system",
            content:
              "你是买家采购 Agent。把用户的轻薄本需求提取成结构化采购意图。未明确时采用保守默认值：重量1.3kg、续航12小时、交期72小时、全国联保。四项偏好总和应为100。",
          },
          { role: "user", content: requestText },
        ],
        text: { format: zodTextFormat(intentSchema, "laptop_intent") },
      },
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!response.output_parsed) throw new Error("模型未返回结构化意图");
    return response.output_parsed;
  }

  async generateProposal(
    seller: LaptopSellerFact,
    intent: LaptopIntent,
  ): Promise<LaptopQuoteDraft> {
    const response = await this.client.responses.parse(
      {
        model: getModel(),
        reasoning: { effort: "low" },
        max_output_tokens: 300,
        input: [
          {
            role: "system",
            content:
              "你是轻薄本卖家 Agent。只能依据输入事实报价，不得修改重量、续航、交期和保修，不得低于最低价或高于挂牌价。用不超过80字解释报价优势。",
          },
          { role: "user", content: JSON.stringify({ intent, seller }) },
        ],
        text: { format: zodTextFormat(quoteSchema, "laptop_quote") },
      },
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!response.output_parsed) throw new Error("模型未返回结构化报价");
    return response.output_parsed;
  }

  async negotiate(
    seller: LaptopSellerFact,
    intent: LaptopIntent,
    offer: LaptopCounterOffer,
  ): Promise<LaptopNegotiationDraft> {
    const response = await this.client.responses.parse(
      {
        model: getModel(),
        reasoning: { effort: "low" },
        max_output_tokens: 300,
        input: [
          {
            role: "system",
            content:
              "你是中标轻薄本卖家 Agent。根据买家目标价进行一次让步，最终价不得低于卖家底价、不得高于原报价。用不超过80字说明让步与附加权益。",
          },
          {
            role: "user",
            content: JSON.stringify({ intent, seller, counterOffer: offer }),
          },
        ],
        text: {
          format: zodTextFormat(negotiationSchema, "laptop_negotiation"),
        },
      },
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!response.output_parsed) throw new Error("模型未返回结构化议价结果");
    return response.output_parsed;
  }
}

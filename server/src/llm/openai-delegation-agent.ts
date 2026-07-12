import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { DelegationIntent } from "../protocol/events.js";
import type { DelegationSellerFact } from "../scenario/product-to-seller.js";
import type {
  DelegationCounterOfferInput,
  DelegationLlmAgent,
  DelegationNegotiationDraft,
  DelegationQuoteDraft,
} from "./delegation-agent.js";
import { createOpenAIClient, getModel } from "./client.js";

// 通用委托意图的结构化输出 schema（不含来源标记与原文，由工作流补齐）
const intentSchema = z.object({
  product: z.string().min(1).max(120),
  budgetCny: z.number().positive(),
  deadlineHours: z.number().positive(),
  mustHave: z.array(z.string().min(1)).max(8),
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

/**
 * 通用委托 LLM Agent 的 OpenAI 实现。
 * 用法与 OpenAILaptopAgent 一致，但 prompt 泛化为任意品类购物场景，
 * 输出结构化 DelegationIntent，并对真实商品事实报价 / 议价。
 */
export class OpenAIDelegationAgent implements DelegationLlmAgent {
  private readonly client = createOpenAIClient();

  async parseIntent(
    requestText: string,
  ): Promise<Omit<DelegationIntent, "requestText" | "generatedBy" | "fallbackReason">> {
    const response = await this.client.responses.parse(
      {
        model: getModel(),
        reasoning: { effort: "low" },
        max_output_tokens: 400,
        input: [
          {
            role: "system",
            content:
              "你是消费者的采购 Agent。把用户的自由购物需求解析成结构化采购意图，适配任意品类。" +
              "product 用简洁中文概括要买的商品（用于检索）。budgetCny 为预算上限（元），未明确时给保守估计。" +
              "deadlineHours 交期上限（小时），未明确默认 72。mustHave 列出用户强调的必须满足的关键属性/关键词（最多 8 个，如「天然」「进口」「防水」；没有则空数组）。" +
              "priorities 是时效/规格/价格/售后四项偏好权重，四项之和必须为 100。",
          },
          { role: "user", content: requestText },
        ],
        text: { format: zodTextFormat(intentSchema, "delegation_intent") },
      },
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!response.output_parsed) throw new Error("模型未返回结构化意图");
    return response.output_parsed;
  }

  async generateProposal(
    seller: DelegationSellerFact,
    intent: DelegationIntent,
  ): Promise<DelegationQuoteDraft> {
    // 只把报价必需的事实喂给模型，避免上下文过长
    const sellerFacts = {
      displayName: seller.displayName,
      productTitle: seller.productTitle,
      category: seller.category,
      attributes: seller.attributes,
      listPriceCny: seller.listPriceCny,
      minimumPriceCny: seller.minimumPriceCny,
      preferredPriceCny: seller.preferredPriceCny,
      deliveryHours: seller.deliveryHours,
      reputation: seller.reputation,
    };
    const response = await this.client.responses.parse(
      {
        model: getModel(),
        reasoning: { effort: "low" },
        max_output_tokens: 300,
        input: [
          {
            role: "system",
            content:
              "你是商品卖家 Agent。只能依据输入的商品事实报价，不得低于最低价或高于挂牌价。" +
              "用不超过 80 字说明该商品相对买家意图的优势（结合类目、属性、价格、交期、信誉）。",
          },
          { role: "user", content: JSON.stringify({ intent, seller: sellerFacts }) },
        ],
        text: { format: zodTextFormat(quoteSchema, "delegation_quote") },
      },
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!response.output_parsed) throw new Error("模型未返回结构化报价");
    return response.output_parsed;
  }

  async negotiate(
    seller: DelegationSellerFact,
    intent: DelegationIntent,
    offer: DelegationCounterOfferInput,
  ): Promise<DelegationNegotiationDraft> {
    const sellerFacts = {
      displayName: seller.displayName,
      productTitle: seller.productTitle,
      minimumPriceCny: seller.minimumPriceCny,
      preferredPriceCny: seller.preferredPriceCny,
    };
    const response = await this.client.responses.parse(
      {
        model: getModel(),
        reasoning: { effort: "low" },
        max_output_tokens: 300,
        input: [
          {
            role: "system",
            content:
              "你是中标商品卖家 Agent。根据买家目标价进行一次让步，最终价不得低于商家底价、不得高于原报价。" +
              "用不超过 80 字说明让步幅度与附加权益。",
          },
          { role: "user", content: JSON.stringify({ intent, seller: sellerFacts, counterOffer: offer }) },
        ],
        text: { format: zodTextFormat(negotiationSchema, "delegation_negotiation") },
      },
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!response.output_parsed) throw new Error("模型未返回结构化议价结果");
    return response.output_parsed;
  }
}

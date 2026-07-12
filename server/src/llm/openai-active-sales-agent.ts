import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  ActiveSalesBuyerFact,
  ActiveSalesLlmAgent,
  ActiveSalesProductFact,
  ProductPassportDraft,
} from "./active-sales-agent.js";
import { createOpenAIClient, getModel } from "./client.js";

const passportSchema = z.object({
  features: z.array(z.string().min(1).max(80)).min(5).max(10),
  summary: z.string().min(1).max(220),
  passport: z.object({
    material: z.string().min(1).max(100),
    evidence: z.string().min(1).max(100),
    delivery: z.string().min(1).max(100),
    returns: z.string().min(1).max(100),
  }),
});

const proposalSchema = z.object({ pitch: z.string().min(1).max(240) });

export class OpenAIActiveSalesAgent implements ActiveSalesLlmAgent {
  private readonly client = createOpenAIClient();

  async buildPassport(product: ActiveSalesProductFact): Promise<ProductPassportDraft> {
    const response = await this.client.responses.parse({
      model: getModel(), reasoning: { effort: "low" }, max_output_tokens: 500,
      input: [
        { role: "system", content: "你是 Seller Agent。只能依据商品事实生成机器可读 Product Passport，不得发明认证、材料比例、库存、交期或退货承诺。输出 5-10 个简短特征，并明确这是演示凭证。" },
        { role: "user", content: JSON.stringify(product) },
      ],
      text: { format: zodTextFormat(passportSchema, "active_sales_passport") },
    }, { signal: AbortSignal.timeout(8_000) });
    if (!response.output_parsed) throw new Error("模型未返回 Product Passport");
    return response.output_parsed;
  }

  async writeProposal(
    product: ActiveSalesProductFact,
    buyer: ActiveSalesBuyerFact,
    passport: ProductPassportDraft,
  ): Promise<string> {
    const response = await this.client.responses.parse({
      model: getModel(), reasoning: { effort: "low" }, max_output_tokens: 260,
      input: [
        { role: "system", content: "你是 Seller Agent。根据买家明确授权暴露的字段写一条不超过 90 字的个性化提案。不得使用 exposedFields 之外的隐私，不得夸大商品事实，不要写广告口号。" },
        { role: "user", content: JSON.stringify({ product, buyer, passport }) },
      ],
      text: { format: zodTextFormat(proposalSchema, "active_sales_proposal") },
    }, { signal: AbortSignal.timeout(8_000) });
    if (!response.output_parsed) throw new Error("模型未返回个性化提案");
    return response.output_parsed.pitch;
  }
}

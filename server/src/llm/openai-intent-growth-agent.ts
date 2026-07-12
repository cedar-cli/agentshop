import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  IntentGrowthAnalysis,
  IntentGrowthConversation,
  IntentGrowthLlmAgent,
  IntentGrowthProductFact,
} from "./intent-growth-agent.js";
import { createOpenAIClient, getModel } from "./client.js";

const intentSchema = z.object({
  key: z.enum(["wash_temp", "use_context", "wash_cycles", "bulk_sla"]),
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(100),
  confidence: z.number().min(72).max(100),
  productField: z.string().min(1).max(60),
  evidence: z.array(z.string().min(1).max(120)).min(2).max(4),
});

const analysisSchema = z.object({
  intents: z.array(intentSchema).length(4),
  gapSummary: z.string().min(1).max(240),
  optimizationSummary: z.string().min(1).max(240),
});

export class OpenAIIntentGrowthAgent implements IntentGrowthLlmAgent {
  private readonly client = createOpenAIClient();

  async analyzeLoss(
    product: IntentGrowthProductFact,
    conversations: IntentGrowthConversation[],
  ): Promise<IntentGrowthAnalysis> {
    const response = await this.client.responses.parse({
      model: getModel(),
      reasoning: { effort: "low" },
      max_output_tokens: 900,
      input: [
        {
          role: "system",
          content: "你是 Seller OS 的 Intent Learning Engine。只根据落选交易对话提取重复、稳定、可验证且当前商品未覆盖的采购约束。必须输出指定四类 Intent，不得发明认证或履约事实。confidence 只能表示样本内稳定度。",
        },
        { role: "user", content: JSON.stringify({ product, conversations }) },
      ],
      text: { format: zodTextFormat(analysisSchema, "intent_growth_analysis") },
    }, { signal: AbortSignal.timeout(10_000) });
    if (!response.output_parsed) throw new Error("模型未返回 Intent Growth 分析");
    return response.output_parsed;
  }
}

export interface IntentGrowthConversation {
  buyerId: string;
  buyerName: string;
  context: string;
  messages: Array<{ role: "buyer" | "seller"; text: string }>;
}

export interface IntentGrowthProductFact {
  productId: string;
  name: string;
  version: string;
  coverage: number;
  existingFields: Record<string, string>;
}

export interface LearnedIntentDraft {
  key: "wash_temp" | "use_context" | "wash_cycles" | "bulk_sla";
  label: string;
  value: string;
  confidence: number;
  productField: string;
  evidence: string[];
}

export interface IntentGrowthAnalysis {
  intents: LearnedIntentDraft[];
  gapSummary: string;
  optimizationSummary: string;
}

export interface IntentGrowthLlmAgent {
  analyzeLoss(
    product: IntentGrowthProductFact,
    conversations: IntentGrowthConversation[],
  ): Promise<IntentGrowthAnalysis>;
}

export const fallbackIntentGrowthAnalysis = (): IntentGrowthAnalysis => ({
  intents: [
    {
      key: "wash_temp", label: "60°C 高频清洗", value: "60°C · daily wash",
      confidence: 94, productField: "wash_temperature",
      evidence: ["每天要用 60°C 消毒", "现有 Output 只有 machine washable", "缺少温度字段导致采购规则拒绝"],
    },
    {
      key: "use_context", label: "托育 / 共享使用", value: "daycare · shared",
      confidence: 89, productField: "use_context",
      evidence: ["家庭和托育中心共用", "共享场景需要每日消毒", "现有商品只覆盖家庭使用"],
    },
    {
      key: "wash_cycles", label: "120 次耐久证据", value: "120 cycles · report WASH-120",
      confidence: 87, productField: "wash_cycles",
      evidence: ["连续 100 次后仍需保持低敏", "材料证书不能替代耐久报告", "采购 Mandate 要求 WASH-120"],
    },
    {
      key: "bulk_sla", label: "批发数量与 SLA", value: "40-120 sets · 9d SLA",
      confidence: 82, productField: "bulk_terms",
      evidence: ["80 套需要 9 天交付", "需要阶梯价", "延期按订单额 3% 赔付"],
    },
  ],
  gapSummary: "商品已有低敏材料凭证，但没有覆盖托育场景、高温清洗耐久和机构批量履约条款。",
  optimizationSummary: "把重复出现且可验证的买家约束写入 Product Output v2.2，让下一位 Buyer Agent 能直接计算匹配度。",
});

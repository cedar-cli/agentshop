export interface DemandNeedFact {
  id: string;
  buyerType: "consumer" | "business";
  text: string;
  source: "demo-fixture" | "consumer-transaction";
  fallbackIntent: DemandIntentDraft;
}

export interface DemandIntentDraft {
  scene: string;
  quantity: number;
  budgetUsd: number;
  deadlineDays: number;
  requirements: string[];
}

export interface SupplyNegotiationInput {
  product: string;
  quantity: number;
  targetUnitPriceUsd: number;
  maximumUnitPriceUsd: number;
  targetDeliveryDays: number;
  supplierOffer: {
    unitPriceUsd: number;
    depositPercent: number;
    deliveryDays: number;
  };
}

export interface SupplyNegotiationDraft {
  unitPriceUsd: number;
  depositPercent: number;
  deliveryDays: number;
  delayPenaltyPercentPerDay: number;
  reasoning: string;
}

export interface DemandNetworkLlmAgent {
  parseIntent(need: DemandNeedFact): Promise<DemandIntentDraft>;
  negotiateSupply(input: SupplyNegotiationInput): Promise<SupplyNegotiationDraft>;
}

export function fallbackNegotiation(): SupplyNegotiationDraft {
  return {
    unitPriceUsd: 74,
    depositPercent: 30,
    deliveryDays: 9,
    delayPenaltyPercentPerDay: 1.5,
    reasoning: "需求热力窗口为 14 天，以每套 $74 换取 9 天交付、30% 定金和延迟赔付。",
  };
}

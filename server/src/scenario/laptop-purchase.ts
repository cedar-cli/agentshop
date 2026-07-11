import type { LaptopIntent, LaptopProposal } from "../protocol/events.js";

export const DEFAULT_LAPTOP_REQUEST =
  "下周出差前买一台轻薄本，预算 9000 元，续航优先，重量不超过 1.3kg，3 天内送达，必须有全国联保。";

export interface LaptopSellerFact {
  sellerId: string;
  displayName: string;
  listPriceCny: number;
  minimumPriceCny: number;
  preferredPriceCny: number;
  deliveryHours: number;
  weightKg: number;
  batteryHours: number;
  warrantyYears: number;
  nationalWarranty: boolean;
  reputation: number;
  metrics: LaptopProposal["metrics"];
  strategy: string;
}
export const laptopSellerFacts: LaptopSellerFact[] = [
  {
    sellerId: "laptop-seller-cloud",
    displayName: "云仓·旗舰店",
    listPriceCny: 8799,
    minimumPriceCny: 8499,
    preferredPriceCny: 8699,
    deliveryHours: 24,
    weightKg: 1.25,
    batteryHours: 14,
    warrantyYears: 3,
    nationalWarranty: true,
    reputation: 88,
    metrics: { timeliness: 95, spec: 95, afterSales: 96, price: 62 },
    strategy: "以次日达、三年全国联保和稳定履约争取订单，可在底价之上适度让利。",
  },
  {
    sellerId: "laptop-seller-extreme",
    displayName: "极物·数码",
    listPriceCny: 8399,
    minimumPriceCny: 8299,
    preferredPriceCny: 8399,
    deliveryHours: 72,
    weightKg: 1.28,
    batteryHours: 13,
    warrantyYears: 2,
    nationalWarranty: true,
    reputation: 82,
    metrics: { timeliness: 88, spec: 90, afterSales: 80, price: 82 },
    strategy: "强调价格竞争力与配置匹配，保持有限议价空间。",
  },
  {
    sellerId: "laptop-seller-ruijie",
    displayName: "锐捷·数码",
    listPriceCny: 8299,
    minimumPriceCny: 8199,
    preferredPriceCny: 8299,
    deliveryHours: 120,
    weightKg: 1.22,
    batteryHours: 15,
    warrantyYears: 1,
    nationalWarranty: true,
    reputation: 76,
    metrics: { timeliness: 60, spec: 85, afterSales: 72, price: 91 },
    strategy: "用最低价格获客，但仓配周期较长，不能承诺三日内交付。",
  },
];

export function fallbackLaptopIntent(requestText: string): LaptopIntent {
  return {
    requestText,
    product: "14 英寸 AI 轻薄本",
    budgetCny: 9000,
    deadlineHours: 72,
    maxWeightKg: 1.3,
    minBatteryHours: 12,
    requiresNationalWarranty: true,
    priorities: { timeliness: 30, spec: 30, price: 25, afterSales: 15 },
    generatedBy: "fallback",
    fallbackReason: "使用轻薄本场景的确定性意图模板",
  };
}

export function fallbackLaptopProposal(
  seller: LaptopSellerFact,
): LaptopProposal {
  return {
    sellerId: seller.sellerId,
    displayName: seller.displayName,
    quotedPriceCny: seller.preferredPriceCny,
    listPriceCny: seller.listPriceCny,
    deliveryHours: seller.deliveryHours,
    weightKg: seller.weightKg,
    batteryHours: seller.batteryHours,
    warrantyYears: seller.warrantyYears,
    nationalWarranty: seller.nationalWarranty,
    reputation: seller.reputation,
    metrics: seller.metrics,
    reasoning: `${seller.displayName}按可履约价格、交期与售后事实提交确定性报价。`,
    generatedBy: "fallback",
    fallbackReason: "模型不可用，使用受约束的场景报价",
  };
}

export function proposalRejectionReasons(
  proposal: LaptopProposal,
  intent: LaptopIntent,
): string[] {
  const reasons: string[] = [];
  if (proposal.quotedPriceCny > intent.budgetCny) reasons.push("报价超过预算");
  if (proposal.deliveryHours > intent.deadlineHours) reasons.push("无法在 3 天内送达");
  if (proposal.weightKg > intent.maxWeightKg) reasons.push("重量超过上限");
  if (proposal.batteryHours < intent.minBatteryHours) reasons.push("续航低于要求");
  if (intent.requiresNationalWarranty && !proposal.nationalWarranty) {
    reasons.push("不提供全国联保");
  }
  return reasons;
}

export function scoreLaptopProposal(
  proposal: LaptopProposal,
  intent: LaptopIntent,
): number {
  const weights = intent.priorities;
  const total = weights.timeliness + weights.spec + weights.price + weights.afterSales || 1;
  return Number((
    (proposal.metrics.timeliness * weights.timeliness +
      proposal.metrics.spec * weights.spec +
      proposal.metrics.price * weights.price +
      proposal.metrics.afterSales * weights.afterSales) /
    total
  ).toFixed(2));
}

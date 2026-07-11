import { randomUUID } from "node:crypto";
import type { DemandNetworkRequest, DemandIntentStructured } from "../protocol/events.js";
import type { EventRouter } from "../router/event-router.js";
import type { DemandNetworkLlmAgent, DemandNeedFact, SupplyNegotiationDraft } from "../llm/demand-network-agent.js";
import { fallbackNegotiation } from "../llm/demand-network-agent.js";

export const demandNeeds: DemandNeedFact[] = [
  { id: "A17", buyerType: "consumer", text: "宝宝睡觉总起疹子，想换一套安全的床品，预算 180 美元，三天内送到。", source: "demo-fixture", fallbackIntent: { scene: "新生儿低敏睡眠", quantity: 1, budgetUsd: 180, deadlineDays: 3, requirements: ["低敏材料", "证据可验证", "可机洗"] } },
  { id: "B04", buyerType: "business", text: "幼儿园下月开班，需要 120 套床品，预算 12000 美元，十天交付。", source: "demo-fixture", fallbackIntent: { scene: "幼儿园批量采购", quantity: 120, budgetUsd: 12000, deadlineDays: 10, requirements: ["批量交付", "材料凭证", "机构退货"] } },
  { id: "H09", buyerType: "business", text: "酒店要做 20 间低敏客房，要求耐商洗、批次可追踪。", source: "demo-fixture", fallbackIntent: { scene: "酒店低敏客房", quantity: 20, budgetUsd: 6000, deadlineDays: 14, requirements: ["耐商洗", "批次追踪", "低敏证明"] } },
  { id: "P31", buyerType: "consumer", text: "旅行床品心愿单价格跌破 145 美元就自动购买。", source: "demo-fixture", fallbackIntent: { scene: "低价触发购买", quantity: 1, budgetUsd: 145, deadlineDays: 7, requirements: ["可信低价", "自动购买授权"] } },
  { id: "R08", buyerType: "consumer", text: "过敏季每 90 天自动补一套可机洗床品。", source: "demo-fixture", fallbackIntent: { scene: "周期补货", quantity: 1, budgetUsd: 170, deadlineDays: 5, requirements: ["可机洗", "低敏证明", "订阅补货"] } },
  { id: "D12", buyerType: "business", text: "托育中心紧急加单 40 套，五天内送达。", source: "demo-fixture", fallbackIntent: { scene: "托育中心紧急补货", quantity: 40, budgetUsd: 4800, deadlineDays: 5, requirements: ["五天交付", "批量履约", "材料凭证"] } },
];

const distributors = [
  ["care-match", "CARE MATCH", "低敏照护", 186, 96],
  ["bulk-scout", "BULK SCOUT", "机构批采", 74, 92],
  ["mom-relay", "MOM RELAY", "新生儿家庭", 421, 94],
  ["hotel-ops", "HOTEL OPS", "酒店采购", 38, 88],
  ["price-watch", "PRICE WATCH", "价格触发", 513, 86],
  ["daycare-buyer", "DAYCARE BUYER", "托育机构", 196, 91],
] as const;

async function structureNeed(need: DemandNeedFact, agent?: DemandNetworkLlmAgent) {
  if (!agent) return { intent: need.fallbackIntent, generatedBy: "fallback" as const, fallbackReason: "LLM 未启用" };
  try {
    return { intent: await agent.parseIntent(need), generatedBy: "llm" as const };
  } catch (error) {
    return {
      intent: need.fallbackIntent, generatedBy: "fallback" as const,
      fallbackReason: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
    };
  }
}

async function negotiate(agent?: DemandNetworkLlmAgent) {
  const input = {
    product: "Nursery Allergy-Safe Kit", quantity: 1200,
    targetUnitPriceUsd: 74, maximumUnitPriceUsd: 76, targetDeliveryDays: 10,
    supplierOffer: { unitPriceUsd: 71, depositPercent: 40, deliveryDays: 12 },
  };
  if (!agent) return { draft: fallbackNegotiation(), generatedBy: "fallback" as const, fallbackReason: "LLM 未启用" };
  try {
    const draft = await agent.negotiateSupply(input);
    if (draft.unitPriceUsd > input.maximumUnitPriceUsd || draft.deliveryDays > input.targetDeliveryDays || draft.depositPercent > 40) {
      throw new Error("模型协商结果越过经营护栏");
    }
    return { draft, generatedBy: "llm" as const };
  } catch (error) {
    return {
      draft: fallbackNegotiation(), generatedBy: "fallback" as const,
      fallbackReason: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
    };
  }
}

function clusters(intents: DemandIntentStructured[]) {
  const count = (pattern: RegExp) => intents.filter((intent) =>
    pattern.test(`${intent.scene} ${intent.requirements.join(" ")}`),
  ).length;
  return [
    { label: "低敏 / 新生儿", sampleHits: count(/低敏|新生儿/), simulatedDemand: 12140, growthPercent: 41 },
    { label: "机构批采", sampleHits: count(/批量|机构|幼儿园|托育/), simulatedDemand: 8420, growthPercent: 33 },
    { label: "可验证材料", sampleHits: count(/凭证|证明|验证|追踪/), simulatedDemand: 12080, growthPercent: 37 },
    { label: "72h–10d 交付", sampleHits: intents.filter((intent) => intent.deadlineDays <= 10).length, simulatedDemand: 6840, growthPercent: 22 },
  ];
}

function forecastCandidates() {
  const raw = [
    { product: "Nursery Allergy-Safe Kit", marketHeat: 96, supplyFit: 88, marginFit: 82 },
    { product: "Hotel Allergy Room Set", marketHeat: 76, supplyFit: 90, marginFit: 68 },
    { product: "Custom Printed Bedding", marketHeat: 43, supplyFit: 52, marginFit: 61 },
  ];
  return raw.map((item) => ({
    ...item,
    totalScore: Math.round(item.marketHeat * .45 + item.supplyFit * .35 + item.marginFit * .2),
  }));
}

export async function runDemandNetworkWorkflow(
  router: EventRouter,
  transactionId: string,
  request: DemandNetworkRequest,
  agent?: DemandNetworkLlmAgent,
  consumerNeeds: DemandNeedFact[] = [],
): Promise<void> {
  const allNeeds = [...consumerNeeds, ...demandNeeds.filter((fixture) =>
    !consumerNeeds.some((need) => need.id === fixture.id),
  )];
  for (const need of allNeeds) {
    await router.publish({
      transactionId, type: "demand.need.received", source: "buyer-agent-network",
      payload: { needId: need.id, buyerType: need.buyerType, text: need.text, source: need.source },
    });
  }

  const structured = await Promise.all(allNeeds.map(async (need, index) => {
    const result = index < 3 ? await structureNeed(need, agent) : {
      intent: need.fallbackIntent, generatedBy: "fallback" as const, fallbackReason: "Demo Fixture 结构化意图",
    };
    const payload: DemandIntentStructured = { needId: need.id, ...result.intent, generatedBy: result.generatedBy, fallbackReason: result.fallbackReason };
    return payload;
  }));
  for (const payload of structured) {
    await router.publish({ transactionId, type: "demand.intent.structured", source: "intent-extractor", payload });
  }

  await router.publish({
    transactionId, type: "demand.market.aggregated", source: "market-aggregator",
    payload: { sampleSize: structured.length, simulatedMarketIntents: 84216, clusters: clusters(structured), simulated: true },
  });

  const candidates = forecastCandidates();
  await router.publish({
    transactionId, type: "demand.product.forecasted", source: "seller-strategy-agent",
    payload: {
      selectedProduct: candidates[0]!.product, candidates,
      reason: "低敏需求热度最高，现有供应商与材料凭证覆盖充分，分销后仍可保持目标毛利。",
    },
  });

  const supply = await negotiate(agent);
  await router.publish({
    transactionId, type: "demand.supply.negotiated", source: "seller-agent", target: "supply-agent-ns",
    payload: {
      supplierId: "supply-agent-ns", quantity: 1200, ...supply.draft,
      generatedBy: supply.generatedBy, fallbackReason: supply.fallbackReason,
    },
  });

  await router.publish({
    transactionId, type: "demand.batch.completed", source: "factory-agent-ns",
    payload: {
      batchId: "NS-2048", quantity: 1200, status: "released",
      checks: ["材料演示凭证核验", "低敏质检", "批次追踪", "数字商品护照"],
      productPassportId: "PP-NS-2048", simulated: true,
    },
  });

  const contractId = `OUT-${randomUUID()}`;
  await router.publish({
    transactionId, type: "distribution.contract.published", source: "finance-agent",
    payload: {
      contractId, commissionRate: request.commissionRate,
      maxDiscountPercent: request.maxDiscountPercent, minimumMarginPercent: 24,
      settlementCondition: "fulfilled-and-attested",
    },
  });

  for (const [agentId, label, channel, authorizedIntentCount, matchScore] of distributors) {
    await router.publish({
      transactionId, type: "distribution.agent.matched", source: "distribution-router", target: agentId,
      payload: { agentId, label, channel, authorizedIntentCount, matchScore },
    });
  }

  const orderCount = 342;
  const gmvUsd = 128604;
  await router.publish({
    transactionId, type: "distribution.orders.completed", source: "distribution-network",
    payload: {
      orderCount, gmvUsd, b2cOrders: 248, b2bOrders: 94, attestedOrders: orderCount,
      sampleOrders: [
        { source: "MOM-17", buyer: "New parent · Seoul", amountUsd: 164 },
        { source: "BULK-04", buyer: "Little Steps Daycare · 80 sets", amountUsd: 8960 },
        { source: "CARE-22", buyer: "Allergy-safe wishlist", amountUsd: 148 },
        { source: "HOTEL-09", buyer: "Han River Hotel · 20 rooms", amountUsd: 4720 },
        { source: "PRICE-31", buyer: "Price threshold reached", amountUsd: 139 },
      ],
      simulated: true,
    },
  });

  await router.publish({
    transactionId, type: "distribution.commission.released", source: "finance-agent",
    payload: {
      contractId, orderCount, commissionRate: request.commissionRate,
      amountUsd: Number((gmvUsd * request.commissionRate / 100).toFixed(2)),
      condition: "fulfilled-and-attested", hashChainVerified: true,
    },
  });
}

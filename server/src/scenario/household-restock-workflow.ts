import { randomUUID } from "node:crypto";
import type { CounterNegotiator } from "../agents/counter-negotiator.js";
import { createFallbackDecision, validateNegotiationDecision } from "../agents/counter-negotiator.js";
import type { ProposalGenerator } from "../agents/proposal-generator.js";
import { createFallbackProposal, validateGeneratedProposal } from "../agents/proposal-generator.js";
import type { SellerProfile } from "../agents/seller-profiles.js";
import type { PurchaseRequest, RestockIntent, RestockProposal } from "../protocol/events.js";
import type { EventRouter } from "../router/event-router.js";

interface RestockSeller extends SellerProfile { displayName: string }

const sellers: RestockSeller[] = [
  { sellerId: "restock-seller-a", displayName: "普惠·日用", inventory: 180, unitCost: 102, minimumMargin: 0.08, minimumDeliveryHours: 72, reputation: 74, allergenSafe: true, strategy: "以低价组合销售争取家庭补库订单" },
  { sellerId: "restock-seller-b", displayName: "极物·生活", inventory: 140, unitCost: 100, minimumMargin: 0.1, minimumDeliveryHours: 48, reputation: 82, allergenSafe: true, strategy: "在价格和稳定履约之间保持平衡" },
  { sellerId: "restock-seller-cloud", displayName: "云仓·旗舰店", inventory: 220, unitCost: 112, minimumMargin: 0.08, minimumDeliveryHours: 24, reputation: 88, allergenSafe: true, strategy: "依靠次日达、包装信用和免运费组合赢得订单，可适度让利" },
];

export function createRestockIntent(): RestockIntent {
  return {
    product: "原生浆厨房纸 24 卷 + 无香型洗手液 2 瓶",
    budgetCny: 140,
    deadlineHours: 72,
    quantity: 1,
    constraints: ["原生浆", "无香型", "7 天内不重复采购", "月度授权 ¥500"],
    reason: "库存预测显示厨房纸将在 18 小时后耗尽，并发现洗手液可组合补购以达到免运门槛",
  };
}

function requestFromIntent(intent: RestockIntent): PurchaseRequest {
  return {
    product: intent.product,
    quantity: intent.quantity,
    budget: intent.budgetCny,
    deadline: new Date(Date.now() + intent.deadlineHours * 60 * 60 * 1000).toISOString(),
    constraints: { allergenFree: ["香精"] },
    weights: { price: 0.45, reputation: 0.3, delivery: 0.25 },
  };
}

function safeReason(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 240);
}

async function proposalFor(seller: RestockSeller, request: PurchaseRequest, generator: ProposalGenerator): Promise<RestockProposal> {
  let generatedBy: "llm" | "fallback" = "llm";
  let fallbackReason: string | undefined;
  let draft;
  try {
    draft = validateGeneratedProposal(await generator.generate(seller, request), seller, request);
  } catch (error) {
    generatedBy = "fallback";
    fallbackReason = safeReason(error);
    draft = createFallbackProposal(seller, request);
  }
  return {
    sellerId: seller.sellerId,
    displayName: seller.displayName,
    totalPriceCny: draft.totalPrice,
    deliveryHours: draft.deliveryHours,
    reputation: seller.reputation,
    reasoning: draft.reasoning,
    generatedBy,
    fallbackReason,
  };
}

function score(proposal: RestockProposal, proposals: RestockProposal[]) {
  const minPrice = Math.min(...proposals.map((item) => item.totalPriceCny));
  const minDelivery = Math.min(...proposals.map((item) => item.deliveryHours));
  return Number((((minPrice / proposal.totalPriceCny) * 100 * 0.45) + (proposal.reputation * 0.3) + ((minDelivery / proposal.deliveryHours) * 100 * 0.25)).toFixed(2));
}

export async function runHouseholdRestockWorkflow(
  router: EventRouter,
  transactionId: string,
  proposalGenerator: ProposalGenerator,
  counterNegotiator?: CounterNegotiator,
): Promise<void> {
  const intent = createRestockIntent();
  const request = requestFromIntent(intent);
  await router.publish({ transactionId, type: "restock.time.advanced", source: "demo-clock", payload: { days: 4, beforePercent: 18, afterPercent: 6, simulated: true } });
  await router.publish({ transactionId, type: "restock.inventory.forecasted", source: "inventory-forecast-agent", payload: { item: "厨房纸", remainingPercent: 6, hoursUntilEmpty: 18, confidence: 93, simulatedSensor: true } });
  await router.publish({ transactionId, type: "restock.authorization.checked", source: "buyer-agent", payload: {
    authorizationId: "mandate-household-017", allowedCategories: ["厨房纸", "洗手液"], singlePurchaseLimitCny: 140,
    monthlyLimitCny: 500, monthlyRemainingCny: 382, cooldownDays: 7, daysSinceLastPurchase: 27,
    hardConstraints: ["原生浆", "无香型"], passed: true,
  } });
  await router.publish({ transactionId, type: "restock.intent.created", source: "buyer-agent", payload: intent });

  const proposals = await Promise.all(sellers.map((seller) => proposalFor(seller, request, proposalGenerator)));
  for (const proposal of proposals) {
    await router.publish({ transactionId, type: "restock.proposal.submitted", source: proposal.sellerId, target: "buyer-agent", payload: proposal });
  }
  const ranked = proposals.map((proposal) => ({ proposal, score: score(proposal, proposals) })).sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  if (!winner) throw new Error("无法完成家庭补库报价排名");
  await router.publish({ transactionId, type: "restock.seller.selected", source: "buyer-agent", target: winner.proposal.sellerId, payload: {
    sellerId: winner.proposal.sellerId, displayName: winner.proposal.displayName, score: winner.score,
    reason: "单位价格、次日达和包装履约信用的综合效用最高", proposal: winner.proposal,
  } });

  const seller = sellers.find((item) => item.sellerId === winner.proposal.sellerId)!;
  const targetPrice = Math.max(Number((seller.unitCost * (1 + seller.minimumMargin)).toFixed(2)), winner.proposal.totalPriceCny - 8);
  const offer = { sellerId: seller.sellerId, originalPrice: winner.proposal.totalPriceCny, targetPrice, reasoning: "组合补购厨房纸和无香洗手液达到仓配阈值，请免除运费并提供 bundle 折扣" };
  let generatedBy: "llm" | "fallback" = "fallback";
  let fallbackReason: string | undefined = "模型不可用，使用规则议价";
  let decision = createFallbackDecision(seller, request, offer);
  if (counterNegotiator) {
    try {
      decision = validateNegotiationDecision(await counterNegotiator.negotiate(seller, request, offer), seller, request, offer);
      generatedBy = "llm";
      fallbackReason = undefined;
    } catch (error) {
      fallbackReason = safeReason(error);
    }
  }
  const finalPriceCny = Number(decision.finalPrice.toFixed(0));
  const concession = Number(Math.max(0, winner.proposal.totalPriceCny - finalPriceCny).toFixed(0));
  await router.publish({ transactionId, type: "restock.bundle.negotiated", source: seller.sellerId, target: "buyer-agent", payload: {
    sellerId: seller.sellerId, originalPriceCny: winner.proposal.totalPriceCny, finalPriceCny,
    concessionCny: concession, bundle: ["原生浆厨房纸 24 卷", "无香型洗手液 2 瓶"], benefits: ["免运费", "次日达"],
    reasoning: decision.reasoning, generatedBy, fallbackReason,
  } });
  await router.publish({ transactionId, type: "restock.order.authorized", source: "buyer-agent", target: seller.sellerId, payload: {
    authorizationId: "mandate-household-017", sellerId: seller.sellerId, amountCny: finalPriceCny,
    checks: ["品类在白名单", "金额低于单次上限", "超过 7 天冷却期", "硬约束全部满足"], autoApproved: true, humanInteractions: 0,
  } });
  const orderId = `order-restock-${randomUUID()}`;
  await router.publish({ transactionId, type: "restock.order.confirmed", source: "buyer-agent", target: seller.sellerId, payload: {
    orderId, sellerId: seller.sellerId, displayName: seller.displayName, totalPriceCny: finalPriceCny, status: "confirmed",
  } });
  await router.publish({ transactionId, type: "restock.inventory.updated", source: "demo-household-inventory", payload: {
    orderId, items: [{ name: "厨房纸", quantity: 24 }, { name: "无香型洗手液", quantity: 2 }], simulated: true,
  } });
  await router.publish({ transactionId, type: "restock.memory.updated", source: "buyer-agent", payload: {
    consumptionCycleDays: 27, nextTriggerLeadDays: 5, memory: "厨房纸实际消耗周期为 27 天，下次提前 5 天启动补库监测",
  } });
  await router.publish({ transactionId, type: "restock.notification.sent", source: "buyer-agent", target: "human-buyer", payload: {
    channel: "inbox", requiresAction: false, summary: `家庭补库已自动完成，成交 ¥${finalPriceCny}，无需操作`,
  } });
}

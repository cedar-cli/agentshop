import { randomUUID } from "node:crypto";
import type {
  LaptopCounterOffer,
  LaptopIntent,
  LaptopProposal,
  LaptopSellerSelected,
} from "../protocol/events.js";
import type { EventRouter } from "../router/event-router.js";
import type { LaptopLlmAgent } from "../llm/laptop-agent.js";
import {
  validateLaptopNegotiation,
  validateLaptopQuote,
} from "../llm/laptop-agent.js";
import {
  fallbackLaptopIntent,
  fallbackLaptopProposal,
  laptopSellerFacts,
  proposalRejectionReasons,
  scoreLaptopProposal,
} from "./laptop-purchase.js";

export interface LaptopApprovalState {
  intent: LaptopIntent;
  winner: LaptopSellerSelected;
  finalPriceCny: number;
}

function safeReason(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 240);
}

function validateIntent(intent: Omit<LaptopIntent, "requestText" | "generatedBy" | "fallbackReason">) {
  const total = Object.values(intent.priorities).reduce((sum, value) => sum + value, 0);
  if (total <= 0) throw new Error("偏好权重不可全部为0");
  if (intent.budgetCny < 5000 || intent.budgetCny > 30000) throw new Error("预算超出轻薄本场景范围");
  if (intent.deadlineHours > 720) throw new Error("交期超出轻薄本场景范围");
  if (intent.maxWeightKg > 3 || intent.minBatteryHours > 30) throw new Error("规格约束超出合理范围");
  return {
    ...intent,
    priorities: {
      timeliness: Number(((intent.priorities.timeliness / total) * 100).toFixed(2)),
      spec: Number(((intent.priorities.spec / total) * 100).toFixed(2)),
      price: Number(((intent.priorities.price / total) * 100).toFixed(2)),
      afterSales: Number(((intent.priorities.afterSales / total) * 100).toFixed(2)),
    },
  };
}

async function buildIntent(requestText: string, llm?: LaptopLlmAgent): Promise<LaptopIntent> {
  if (!llm) return fallbackLaptopIntent(requestText);
  try {
    const parsed = validateIntent(await llm.parseIntent(requestText));
    return { ...parsed, requestText, generatedBy: "llm" };
  } catch (error) {
    return { ...fallbackLaptopIntent(requestText), fallbackReason: safeReason(error) };
  }
}

async function buildProposal(
  intent: LaptopIntent,
  seller: (typeof laptopSellerFacts)[number],
  llm?: LaptopLlmAgent,
): Promise<LaptopProposal> {
  if (!llm) return fallbackLaptopProposal(seller);
  try {
    const draft = validateLaptopQuote(await llm.generateProposal(seller, intent), seller, intent);
    return {
      ...fallbackLaptopProposal(seller),
      quotedPriceCny: draft.quotedPriceCny,
      reasoning: draft.reasoning,
      generatedBy: "llm",
      fallbackReason: undefined,
    };
  } catch (error) {
    return { ...fallbackLaptopProposal(seller), fallbackReason: safeReason(error) };
  }
}

export async function runLaptopPurchaseUntilApproval(
  router: EventRouter,
  transactionId: string,
  requestText: string,
  llm?: LaptopLlmAgent,
): Promise<LaptopApprovalState> {
  await router.publish({
    transactionId,
    type: "laptop.purchase.requested",
    source: "human-buyer",
    target: "buyer-agent",
    payload: { requestText },
  });

  const intent = await buildIntent(requestText, llm);
  await router.publish({
    transactionId,
    type: "laptop.intent.structured",
    source: "buyer-agent",
    payload: intent,
  });

  const proposals = await Promise.all(
    laptopSellerFacts.map((seller) => buildProposal(intent, seller, llm)),
  );
  for (const proposal of proposals) {
    await router.publish({
      transactionId,
      type: "laptop.proposal.submitted",
      source: proposal.sellerId,
      target: "buyer-agent",
      payload: proposal,
    });
  }

  const eligible: LaptopProposal[] = [];
  for (const proposal of proposals) {
    const reasons = proposalRejectionReasons(proposal, intent);
    if (reasons.length === 0) {
      eligible.push(proposal);
      continue;
    }
    await router.publish({
      transactionId,
      type: "laptop.seller.rejected",
      source: "buyer-agent",
      target: proposal.sellerId,
      payload: { sellerId: proposal.sellerId, displayName: proposal.displayName, reasons },
    });
  }
  if (eligible.length === 0) throw new Error("没有卖家满足轻薄本采购硬约束");

  const ranked = eligible
    .map((proposal) => ({ proposal, score: scoreLaptopProposal(proposal, intent) }))
    .sort((left, right) => right.score - left.score);
  const first = ranked[0];
  if (!first) throw new Error("无法完成轻薄本卖家排名");
  const winner: LaptopSellerSelected = {
    sellerId: first.proposal.sellerId,
    displayName: first.proposal.displayName,
    score: first.score,
    reason: "满足全部硬约束，时效、规格和售后综合效用最高",
    proposal: first.proposal,
  };
  await router.publish({
    transactionId,
    type: "laptop.seller.selected",
    source: "buyer-agent",
    target: winner.sellerId,
    payload: winner,
  });

  const seller = laptopSellerFacts.find((item) => item.sellerId === winner.sellerId);
  if (!seller) throw new Error("中标卖家事实不存在");
  const counterOffer: LaptopCounterOffer = {
    sellerId: winner.sellerId,
    originalPriceCny: winner.proposal.quotedPriceCny,
    targetPriceCny: Math.max(
      seller.minimumPriceCny,
      winner.proposal.quotedPriceCny - 300,
    ),
    reasoning: "同配置可信报价已完成比较，希望以三年联保与次日达组合换取进一步让利",
  };
  await router.publish({
    transactionId,
    type: "laptop.counter.offer",
    source: "buyer-agent",
    target: winner.sellerId,
    payload: counterOffer,
  });

  let finalPriceCny = counterOffer.targetPriceCny;
  let reasoning = "接受目标价，并保留三年全国联保与次日达承诺。";
  let generatedBy: "llm" | "fallback" = "fallback";
  let fallbackReason: string | undefined = "模型不可用，使用受约束的议价结果";
  if (llm) {
    try {
      const draft = validateLaptopNegotiation(
        await llm.negotiate(seller, intent, counterOffer),
        seller,
        counterOffer,
      );
      finalPriceCny = draft.finalPriceCny;
      reasoning = draft.reasoning;
      generatedBy = "llm";
      fallbackReason = undefined;
    } catch (error) {
      fallbackReason = safeReason(error);
    }
  }
  await router.publish({
    transactionId,
    type: "laptop.counter.response",
    source: winner.sellerId,
    target: "buyer-agent",
    payload: {
      sellerId: winner.sellerId,
      finalPriceCny,
      concessionCny: Math.max(0, winner.proposal.quotedPriceCny - finalPriceCny),
      reasoning,
      generatedBy,
      fallbackReason,
    },
  });

  await router.publish({
    transactionId,
    type: "laptop.approval.requested",
    source: "buyer-agent",
    target: "human-buyer",
    payload: {
      sellerId: winner.sellerId,
      displayName: winner.displayName,
      finalPriceCny,
      expiresInMinutes: 20,
      reason: "全部硬约束满足，价格在预算内；高值商品按授权策略等待人工确认",
    },
  });

  return { intent, winner, finalPriceCny };
}

export async function completeApprovedLaptopPurchase(
  router: EventRouter,
  transactionId: string,
  state: LaptopApprovalState,
  approvedBy: "human" | "agent" = "human",
): Promise<void> {
  const orderId = `order-laptop-${randomUUID()}`;
  await router.publish({
    transactionId,
    type: "laptop.order.confirmed",
    source: "buyer-agent",
    target: state.winner.sellerId,
    payload: {
      orderId,
      sellerId: state.winner.sellerId,
      displayName: state.winner.displayName,
      totalPriceCny: state.finalPriceCny,
      status: "confirmed",
      approvedBy,
    },
  });
  await router.publish({
    transactionId,
    type: "laptop.fulfillment.updated",
    source: "demo-logistics-agent",
    payload: {
      orderId,
      status: "delivered",
      deliveredEarlyHours: 6,
      checks: ["序列号一致", "重量 1.25kg", "电池健康度正常", "包装完整"],
      simulated: true,
    },
  });
  await router.publish({
    transactionId,
    type: "laptop.attestation.issued",
    source: "repchain-demo",
    payload: {
      orderId,
      attestationId: `att-${randomUUID()}`,
      scores: { timeliness: 98, specification: 97, packaging: 100 },
      merchantCreditBefore: 88.1,
      merchantCreditAfter: 88.4,
      simulatedEvidence: true,
    },
  });
}

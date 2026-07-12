import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { EventRouter } from "../router/event-router.js";
import type {
  IntentGrowthConversation,
  IntentGrowthLlmAgent,
  IntentGrowthProductFact,
} from "../llm/intent-growth-agent.js";
import { fallbackIntentGrowthAnalysis } from "../llm/intent-growth-agent.js";

export const intentGrowthProduct: IntentGrowthProductFact = {
  productId: "LC-210",
  name: "LumaCalm 低敏床品",
  version: "v2.1",
  coverage: 61,
  existingFields: {
    "evidence.allergen": "OEKO-TEX · demo-verifiable",
    material: "TENCEL Lyocell 68%",
    returns: "30d machine-readable",
  },
};

export const intentGrowthConversations: IntentGrowthConversation[] = [
  {
    buyerId: "mia-parent", buyerName: "Mia Parent Agent", context: "HOME + DAYCARE",
    messages: [
      { role: "buyer", text: "找一套家里与托育中心共用的低敏床品，每天要用 60°C 消毒。" },
      { role: "seller", text: "当前有 OEKO-TEX 演示凭证，但 Product Output 只写了 machine washable。" },
      { role: "buyer", text: "连续 100 次后仍低敏吗？没有温度与耐久证据，Mandate 会拒绝。" },
      { role: "seller", text: "已记录缺口：共享托育、60°C 清洗、长期耐久证明。" },
    ],
  },
  {
    buyerId: "little-steps-first", buyerName: "Little Steps Buyer Agent", context: "80 SETS · B2B",
    messages: [
      { role: "buyer", text: "采购 80 套，预算 $9,200；能否 9 天交付并承担延迟赔付？" },
      { role: "seller", text: "库存足够，但现有 Output 没有批发数量、阶梯价与 SLA。" },
      { role: "buyer", text: "请返回机器可执行报价、交期、赔付和售后条款。" },
      { role: "seller", text: "可报 $112/套，9 天 SLA，延迟按订单额 3% 赔付。" },
    ],
  },
  {
    buyerId: "hotel-ops", buyerName: "Hotel Ops Buyer Agent", context: "24 ROOMS",
    messages: [
      { role: "buyer", text: "24 间客房每天商洗，材料证书能否覆盖 120 次循环后的耐久？" },
      { role: "seller", text: "目前只有材料证书，没有高温洗涤循环的实验报告。" },
      { role: "buyer", text: "采购规则要求可验证的 WASH-120 报告，否则无法入围。" },
      { role: "seller", text: "已把 wash_cycles=120 标记为证据补齐任务。" },
    ],
  },
];

async function analyze(agent?: IntentGrowthLlmAgent) {
  if (!agent) return { analysis: fallbackIntentGrowthAnalysis(), generatedBy: "fallback" as const, fallbackReason: "LLM 未启用" };
  try {
    const raw = await agent.analyzeLoss(intentGrowthProduct, intentGrowthConversations);
    const fallback = fallbackIntentGrowthAnalysis();
    const fieldByKey = {
      wash_temp: "wash_temperature",
      use_context: "use_context",
      wash_cycles: "wash_cycles",
      bulk_sla: "bulk_terms",
    } as const;
    const intents = fallback.intents.map((defaultIntent) => {
      const learned = raw.intents.find((intent) => intent.key === defaultIntent.key) ?? defaultIntent;
      return { ...learned, productField: fieldByKey[defaultIntent.key] };
    });
    return { analysis: { ...raw, intents }, generatedBy: "llm" as const };
  } catch (error) {
    return {
      analysis: fallbackIntentGrowthAnalysis(), generatedBy: "fallback" as const,
      fallbackReason: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
    };
  }
}

export async function runIntentGrowthWorkflow(
  router: EventRouter,
  transactionId: string,
  agent?: IntentGrowthLlmAgent,
  stepDelayMs = 0,
): Promise<void> {
  router.configureTransactionPacing(transactionId, stepDelayMs, delay);
  try {
    await router.publish({
      transactionId, type: "intent-growth.market.ranked", source: "intent-market-router",
      payload: {
        intentId: "I-23991", buyerName: "New Parent Procurement Agent", title: "低敏共享场景床品",
        currentSellerId: "luma-calm", currentRank: 3, currentScore: 78,
        candidates: [
          { sellerId: "cotton-cloud", displayName: "CloudCotton Agent", score: 91, rank: 1 },
          { sellerId: "organic-dream", displayName: "Organic Dream Agent", score: 86, rank: 2 },
          { sellerId: "luma-calm", displayName: "LumaCalm Seller Agent", score: 78, rank: 3 },
          { sellerId: "hotel-linen", displayName: "Hotel Linen Agent", score: 72, rank: 4 },
        ],
      },
    });

    await router.publish({
      transactionId, type: "intent-growth.seller.shortlisted", source: "buyer-agent", target: "luma-calm",
      payload: { intentId: "I-23991", sellerId: "luma-calm", shortlistSize: 3, rank: 3, reason: "低敏材料符合，但共享使用、清洗耐久和批量 SLA 字段覆盖不足。" },
    });

    let round = 0;
    for (const conversation of intentGrowthConversations) {
      for (const message of conversation.messages) {
        round += 1;
        await router.publish({
          transactionId, type: "intent-growth.dialogue.round", source: message.role === "buyer" ? conversation.buyerId : "luma-calm", target: message.role === "buyer" ? "luma-calm" : conversation.buyerId,
          payload: { buyerId: conversation.buyerId, buyerName: conversation.buyerName, context: conversation.context, round, role: message.role, text: message.text },
        });
      }
    }

    await router.publish({
      transactionId, type: "intent-growth.seller.lost", source: "buyer-agent", target: "luma-calm",
      payload: {
        intentId: "I-23991", sellerId: "luma-calm", winnerId: "cotton-cloud", finalRank: 3,
        reason: "现有 Product Output 无法证明托育共享、60°C 高频清洗、120 次耐久与机构 SLA。",
        uncoveredFields: ["use_context", "wash_temperature", "wash_cycles", "bulk_terms"],
      },
    });

    const result = await analyze(agent);
    await router.publish({
      transactionId, type: "intent-growth.learning.started", source: "intent-learning-engine",
      payload: { conversationGroups: 3, dialogueRounds: 18, observedSignals: 219, simulatedSignalVolume: true, generatedBy: result.generatedBy, fallbackReason: result.fallbackReason },
    });

    for (const intent of result.analysis.intents) {
      await router.publish({
        transactionId, type: "intent-growth.intent.extracted", source: "intent-learning-engine",
        payload: { ...intent, status: "ready", generatedBy: result.generatedBy, fallbackReason: result.fallbackReason },
      });
    }

    await router.publish({
      transactionId, type: "intent-growth.gap.detected", source: "intent-learning-engine", target: "seller-product-agent",
      payload: { productId: intentGrowthProduct.productId, coverageBefore: 61, missingFields: result.analysis.intents.map((intent) => intent.productField), summary: result.analysis.gapSummary, generatedBy: result.generatedBy },
    });

    const coverageSteps = [69, 77, 84, 91];
    for (const [index, intent] of result.analysis.intents.entries()) {
      await router.publish({
        transactionId, type: "intent-growth.product.field.updated", source: "seller-product-agent",
        payload: {
          productId: intentGrowthProduct.productId, field: intent.productField, value: intent.value,
          status: "written", version: "v2.2", coverageAfter: coverageSteps[index]!, evidence: intent.evidence,
        },
      });
    }

    await router.publish({
      transactionId, type: "intent-growth.product.version.published", source: "seller-product-agent",
      payload: {
        productId: intentGrowthProduct.productId, productName: "LumaCalm 可验证共享托育睡眠方案",
        previousVersion: "v2.1", version: "v2.2", coverageBefore: 61, coverageAfter: 91,
        writtenFields: result.analysis.intents.map((intent) => intent.productField), summary: result.analysis.optimizationSummary,
      },
    });

    await router.publish({
      transactionId, type: "intent-growth.buyer.rematched", source: "buyer-agent", target: "luma-calm",
      payload: {
        intentId: "I-24063", buyerName: "Little Steps Daycare", quantity: 80, deadlineDays: 9,
        requirements: ["托育场景", "60°C 清洗", "120 次耐久报告", "批发 SLA"],
        scoreBefore: 78, scoreAfter: 96, rankBefore: 3, rankAfter: 2,
        scoreBreakdown: { context: 96, wash: 98, durability: 94, bulkSla: 96 },
      },
    });

    await router.publish({
      transactionId, type: "intent-growth.quote.requested", source: "little-steps-buyer-agent", target: "luma-calm",
      payload: { quoteId: "Q-LS-8804", quantity: 80, budgetUsd: 9200, requestedDeliveryDays: 9, requestedTerms: ["阶梯价", "延期赔付", "机器可执行售后"] },
    });

    await router.publish({
      transactionId, type: "intent-growth.terms.negotiated", source: "luma-calm", target: "little-steps-buyer-agent",
      payload: { quoteId: "Q-LS-8804", unitPriceUsd: 112, quantity: 80, deliveryDays: 9, delayPenaltyPercent: 3, totalUsd: 8960, messages: ["Buyer 请求 80 套机器报价", "Seller 报价 $112/套", "双方确认 9 天 SLA", "写入延期 3% 赔付条款"] },
    });

    await router.publish({
      transactionId, type: "intent-growth.order.signed", source: "contract-agent", target: "luma-calm",
      payload: { orderId: `LS-${randomUUID().slice(0, 8)}`, buyerName: "Little Steps Daycare", quantity: 80, unitPriceUsd: 112, totalUsd: 8960, deliveryDays: 9, delayPenaltyPercent: 3, status: "signed" },
    });

    await router.publish({
      transactionId, type: "intent-growth.attestation.issued", source: "repchain", target: "luma-calm",
      payload: { attestationId: `ATT-${randomUUID().slice(0, 8)}`, deliveredInDays: 9, evidenceVerified: true, slaHonored: true, afterSalesExecutable: true, trustDelta: 12, simulatedFulfillment: true },
    });

    await router.publish({
      transactionId, type: "intent-growth.rank.updated", source: "intent-market-router", target: "luma-calm",
      payload: { rankBefore: 3, rankAfter: 1, scoreBefore: 78, scoreAfter: 98, shortlistRateBefore: 12, shortlistRateAfter: 31, ordersPerDayBefore: 3, ordersPerDayAfter: 19, projectedNewIntents: 16, simulatedProjection: true },
    });
  } finally {
    router.clearTransactionPacing(transactionId);
  }
}

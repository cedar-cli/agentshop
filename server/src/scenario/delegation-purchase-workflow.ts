import { randomUUID } from "node:crypto";
import type {
  ConsumerServiceMode,
  DelegationIntent,
  LaptopCounterOffer,
  LaptopIntent,
  LaptopProposal,
  LaptopSellerSelected,
} from "../protocol/events.js";
import type { EventRouter } from "../router/event-router.js";
import type { DelegationLlmAgent } from "../llm/delegation-agent.js";
import {
  validateDelegationNegotiation,
  validateDelegationQuote,
} from "../llm/delegation-agent.js";
import { searchProducts, isCatalogAvailable } from "./product-catalog.js";
import {
  repriceByQuantile,
  toSellerFact,
  type DelegationSellerFact,
} from "./product-to-seller.js";
import { laptopSellerFacts } from "./laptop-purchase.js";

// 召回候选数上限：一次委托拼这么多个候选卖家
const MAX_CANDIDATES = 6;

function safeReason(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 240);
}

/**
 * 把通用委托意图转成前端消费的 LaptopIntent 兼容结构。
 *
 * 为什么这样做：前端与决策日志已完整支持 laptop.* 事件与 LaptopIntent payload，
 * 委托工作流复用同一套事件类型即可零改动接入。笔记本专用字段（重量/续航/联保）
 * 用通用默认值填充，不影响通用打分（打分只看 priorities + metrics）。
 */
function toLaptopIntent(intent: DelegationIntent, requestText: string): LaptopIntent {
  return {
    requestText,
    product: intent.product,
    budgetCny: intent.budgetCny,
    deadlineHours: intent.deadlineHours,
    // 以下三项为兼容 laptop payload 的占位，通用场景不用它们做硬约束。
    // maxWeightKg=999 作为「通用委托」哨兵值供前端识别；minBatteryHours 需为正数以过 schema 校验。
    maxWeightKg: 999,
    minBatteryHours: 1,
    requiresNationalWarranty: false,
    priorities: intent.priorities,
    generatedBy: intent.generatedBy,
    fallbackReason: intent.fallbackReason,
  };
}

/**
 * 通用意图的确定性兜底：模型不可用时，从原始文本粗解析出一个可用意图。
 * product 直接用原文（截断），预算给 2000 元中位默认，偏好用均衡权重。
 */
function fallbackDelegationIntent(requestText: string, reason?: string): DelegationIntent {
  return {
    requestText,
    product: requestText.trim().slice(0, 40) || "通用商品",
    budgetCny: 2000,
    deadlineHours: 72,
    mustHave: [],
    priorities: { timeliness: 25, spec: 30, price: 30, afterSales: 15 },
    generatedBy: "fallback",
    fallbackReason: reason ?? "使用通用场景的确定性意图模板",
  };
}

/**
 * 校验 LLM 解析出的意图，越界则抛错以退回兜底。偏好总和归一化到 100。
 */
function validateDelegationIntent(
  intent: Omit<DelegationIntent, "requestText" | "generatedBy" | "fallbackReason">,
): Omit<DelegationIntent, "requestText" | "generatedBy" | "fallbackReason"> {
  const total = Object.values(intent.priorities).reduce((sum, v) => sum + v, 0);
  if (total <= 0) throw new Error("偏好权重不可全部为 0");
  if (intent.budgetCny <= 0) throw new Error("预算必须为正");
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

/**
 * 构造意图：优先用 LLM 解析，失败退回确定性兜底。
 */
async function buildIntent(requestText: string, llm?: DelegationLlmAgent): Promise<DelegationIntent> {
  if (!llm) return fallbackDelegationIntent(requestText);
  try {
    const parsed = validateDelegationIntent(await llm.parseIntent(requestText));
    return { ...parsed, requestText, generatedBy: "llm" };
  } catch (error) {
    return fallbackDelegationIntent(requestText, safeReason(error));
  }
}

/**
 * 把检索命中的商品映射成候选卖家；库缺失或零命中时回退到写死的笔记本卖家，
 * 保证流程永不 break（降级到旧 demo 行为）。
 * 返回候选列表与来源标记。
 */
function buildCandidates(
  intent: DelegationIntent,
): { sellers: DelegationSellerFact[]; source: "catalog" | "fallback" } {
  const hits = isCatalogAvailable() ? searchProducts(intent.product, MAX_CANDIDATES) : [];
  if (hits.length > 0) {
    const sellers = repriceByQuantile(hits.map((hit) => toSellerFact(hit, intent)));
    return { sellers, source: "catalog" };
  }
  // 回退：把写死的笔记本卖家转成通用卖家事实结构
  const sellers = laptopSellerFacts.map<DelegationSellerFact>((s) => ({
    sellerId: s.sellerId,
    displayName: s.displayName,
    productTitle: "14 英寸 AI 轻薄本",
    category: "电脑办公›笔记本",
    image: "",
    attributes: ["轻薄", "长续航", "全国联保"],
    listPriceCny: s.listPriceCny,
    minimumPriceCny: s.minimumPriceCny,
    preferredPriceCny: s.preferredPriceCny,
    deliveryHours: s.deliveryHours,
    reputation: s.reputation,
    metrics: s.metrics,
    strategy: s.strategy,
  }));
  return { sellers, source: "fallback" };
}

/**
 * 通用委托硬约束校验：返回该候选被淘汰的原因列表（空数组表示通过）。
 * 通用场景只看两条：报价不超预算、mustHave 关键词全部命中。
 */
function candidateRejectionReasons(
  seller: DelegationSellerFact,
  proposal: LaptopProposal,
  intent: DelegationIntent,
): string[] {
  const reasons: string[] = [];
  if (proposal.quotedPriceCny > intent.budgetCny) reasons.push("报价超过预算");
  const haystack = `${seller.productTitle} ${seller.category} ${seller.attributes.join(" ")}`.toLowerCase();
  for (const kw of intent.mustHave) {
    if (kw && !haystack.includes(kw.toLowerCase())) reasons.push(`未满足「${kw}」`);
  }
  return reasons;
}

/**
 * 按意图四维偏好对候选打分（0-100 加权，与 laptop 打分同构）。
 */
function scoreProposal(proposal: LaptopProposal, intent: DelegationIntent): number {
  const w = intent.priorities;
  const total = w.timeliness + w.spec + w.price + w.afterSales || 1;
  return Number(
    (
      (proposal.metrics.timeliness * w.timeliness +
        proposal.metrics.spec * w.spec +
        proposal.metrics.price * w.price +
        proposal.metrics.afterSales * w.afterSales) /
      total
    ).toFixed(2),
  );
}

/**
 * 由卖家事实构造一份确定性兜底报价（模型不可用时用）。
 */
function fallbackProposal(seller: DelegationSellerFact): LaptopProposal {
  return {
    sellerId: seller.sellerId,
    displayName: seller.displayName,
    quotedPriceCny: seller.preferredPriceCny,
    listPriceCny: seller.listPriceCny,
    deliveryHours: seller.deliveryHours,
    // 以下笔记本专用字段用占位，前端展示不依赖它们做通用判断
    weightKg: 1,
    batteryHours: 12,
    warrantyYears: 1,
    nationalWarranty: false,
    reputation: seller.reputation,
    metrics: seller.metrics,
    // 带上真实商品图（空串时给 undefined，保持字段可选语义），供前端候选卡片展示
    image: seller.image || undefined,
    reasoning: `${seller.displayName}：${seller.productTitle.slice(0, 24)} 按可履约价格与交期提交报价。`,
    generatedBy: "fallback",
    fallbackReason: "模型不可用，使用受约束的确定性报价",
  };
}

/**
 * 构造一份候选报价：优先用 LLM 生成报价与理由，失败退回确定性兜底。
 * 只对前若干个候选调 LLM（控制成本/延迟），其余用兜底。
 */
async function buildProposal(
  seller: DelegationSellerFact,
  intent: DelegationIntent,
  useLlm: boolean,
  llm?: DelegationLlmAgent,
): Promise<LaptopProposal> {
  if (!llm || !useLlm) return fallbackProposal(seller);
  try {
    const draft = validateDelegationQuote(await llm.generateProposal(seller, intent), seller, intent);
    return {
      ...fallbackProposal(seller),
      quotedPriceCny: draft.quotedPriceCny,
      reasoning: draft.reasoning,
      generatedBy: "llm",
      fallbackReason: undefined,
    };
  } catch (error) {
    return { ...fallbackProposal(seller), fallbackReason: safeReason(error) };
  }
}

/**
 * 运行一次「通用委托真实采购」工作流：真实搜索 → 比较 → 议价 → 下单 → 履约 → 上链。
 *
 * 与 laptop 工作流的差异只有「货架」：候选来自数据集检索（buildCandidates），
 * 事件类型全部复用 laptop.*（前端零改动），并在最前面多发一条 delegation.search.completed。
 * 全程无人工确认，由消费 Agent 在授权内自动完成。
 *
 * @param router      事件路由（发布事件并落库）
 * @param transactionId  交易 id
 * @param requestText 消费者原始购物意图文本
 * @param serviceMode 主动服务方式（本期透传记录，不改变行为）
 * @param llm         通用委托 LLM Agent（缺省则全程走确定性兜底）
 */
export async function runDelegationPurchase(
  router: EventRouter,
  transactionId: string,
  requestText: string,
  serviceMode: ConsumerServiceMode,
  llm?: DelegationLlmAgent,
): Promise<void> {
  // 1) 记录原始委托（复用 laptop.purchase.requested）
  await router.publish({
    transactionId,
    type: "laptop.purchase.requested",
    source: "human-buyer",
    target: "buyer-agent",
    payload: { requestText },
  });

  // 2) 解析意图
  const intent = await buildIntent(requestText, llm);
  await router.publish({
    transactionId,
    type: "laptop.intent.structured",
    source: "buyer-agent",
    payload: toLaptopIntent(intent, requestText),
  });

  // 3) 真实搜索：从数据集召回候选商品（核心新增步骤）
  const { sellers, source } = buildCandidates(intent);
  await router.publish({
    transactionId,
    type: "delegation.search.completed",
    source: "buyer-agent",
    payload: {
      query: intent.product,
      serviceMode,
      source,
      hitCount: sellers.length,
      hits: sellers.map((s) => ({
        asin: s.sellerId,
        title: s.productTitle,
        shopName: s.displayName,
        category: s.category,
        priceMin: s.minimumPriceCny,
        priceMax: s.listPriceCny,
        // 带上真实商品首图，供前端在「搜索命中」这一步挂缩略图（回退卖家为空串）
        image: s.image,
      })),
    },
  });
  if (sellers.length === 0) throw new Error("未检索到任何候选商品");

  // 4) 逐个候选生成报价（只对前 3 个调 LLM，其余确定性兜底以控成本）
  const proposals: Array<{ seller: DelegationSellerFact; proposal: LaptopProposal }> = [];
  let llmBudget = 3;
  for (const seller of sellers) {
    const proposal = await buildProposal(seller, intent, llmBudget > 0, llm);
    if (proposal.generatedBy === "llm") llmBudget--;
    proposals.push({ seller, proposal });
    await router.publish({
      transactionId,
      type: "laptop.proposal.submitted",
      source: proposal.sellerId,
      target: "buyer-agent",
      payload: proposal,
    });
  }

  // 5) 硬约束淘汰：不满足预算/mustHave 的候选出局
  const eligible: Array<{ seller: DelegationSellerFact; proposal: LaptopProposal }> = [];
  for (const item of proposals) {
    const reasons = candidateRejectionReasons(item.seller, item.proposal, intent);
    if (reasons.length === 0) {
      eligible.push(item);
      continue;
    }
    await router.publish({
      transactionId,
      type: "laptop.seller.rejected",
      source: "buyer-agent",
      target: item.proposal.sellerId,
      payload: {
        sellerId: item.proposal.sellerId,
        displayName: item.proposal.displayName,
        reasons,
      },
    });
  }
  // 若全部被预算淘汰，放宽：保留报价最低的一个，避免流程无解（真实搜索价格波动大）
  if (eligible.length === 0) {
    const cheapest = [...proposals].sort((a, b) => a.proposal.quotedPriceCny - b.proposal.quotedPriceCny)[0];
    if (!cheapest) throw new Error("没有候选可供成交");
    eligible.push(cheapest);
  }

  // 6) 打分排名，选出综合分最高者
  const ranked = eligible
    .map((item) => ({ ...item, score: scoreProposal(item.proposal, intent) }))
    .sort((a, b) => b.score - a.score);
  const first = ranked[0];
  if (!first) throw new Error("无法完成候选排名");
  const winner: LaptopSellerSelected = {
    sellerId: first.proposal.sellerId,
    displayName: first.proposal.displayName,
    score: first.score,
    reason: "满足硬约束，四维偏好综合效用最高",
    proposal: first.proposal,
  };
  await router.publish({
    transactionId,
    type: "laptop.seller.selected",
    source: "buyer-agent",
    target: winner.sellerId,
    payload: winner,
  });

  // 7) 还价：在底价之上争取一档让利
  const winnerSeller = first.seller;
  const counterOffer: LaptopCounterOffer = {
    sellerId: winner.sellerId,
    originalPriceCny: winner.proposal.quotedPriceCny,
    targetPriceCny: Math.max(
      winnerSeller.minimumPriceCny,
      Math.round(winner.proposal.quotedPriceCny * 0.95),
    ),
    reasoning: "已完成同类候选比较，希望以确定成交与复购换取进一步让利",
  };
  await router.publish({
    transactionId,
    type: "laptop.counter.offer",
    source: "buyer-agent",
    target: winner.sellerId,
    payload: counterOffer,
  });

  // 8) 议价应答：优先 LLM，失败兜底到目标价
  let finalPriceCny = counterOffer.targetPriceCny;
  let reasoning = "接受目标价，保留售后与优先发货承诺。";
  let generatedBy: "llm" | "fallback" = "fallback";
  let fallbackReason: string | undefined = "模型不可用，使用受约束的议价结果";
  if (llm) {
    try {
      const draft = validateDelegationNegotiation(
        await llm.negotiate(winnerSeller, intent, {
          originalPriceCny: counterOffer.originalPriceCny,
          targetPriceCny: counterOffer.targetPriceCny,
        }),
        winnerSeller,
        { originalPriceCny: counterOffer.originalPriceCny, targetPriceCny: counterOffer.targetPriceCny },
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

  // 9) 授权确认（委托全自动，approvedBy=agent，不等待人工）
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
      reason: "全部硬约束满足，价格在预算内；委托授权内由消费 Agent 自动成交",
    },
  });

  // 10) 下单
  const orderId = `order-delegation-${randomUUID()}`;
  await router.publish({
    transactionId,
    type: "laptop.order.confirmed",
    source: "buyer-agent",
    target: winner.sellerId,
    payload: {
      orderId,
      sellerId: winner.sellerId,
      displayName: winner.displayName,
      totalPriceCny: finalPriceCny,
      status: "confirmed",
      approvedBy: "agent",
    },
  });

  // 11) 履约（模拟）
  await router.publish({
    transactionId,
    type: "laptop.fulfillment.updated",
    source: "demo-logistics-agent",
    payload: {
      orderId,
      status: "delivered",
      deliveredEarlyHours: 6,
      checks: ["商品与描述一致", "包装完整", "发票齐全"],
      simulated: true,
    },
  });

  // 12) 链上鉴证（模拟证据）
  await router.publish({
    transactionId,
    type: "laptop.attestation.issued",
    source: "repchain-demo",
    payload: {
      orderId,
      attestationId: `att-${randomUUID()}`,
      scores: { timeliness: 97, specification: 96, packaging: 99 },
      merchantCreditBefore: winnerSeller.reputation,
      merchantCreditAfter: Math.min(100, winnerSeller.reputation + 0.3),
      simulatedEvidence: true,
    },
  });
}

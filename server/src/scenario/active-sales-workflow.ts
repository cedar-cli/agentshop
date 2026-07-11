import { randomUUID } from "node:crypto";
import type { EventRouter } from "../router/event-router.js";
import type {
  ActiveSalesBuyerFact,
  ActiveSalesLlmAgent,
  ActiveSalesProductFact,
  ProductPassportDraft,
} from "../llm/active-sales-agent.js";
import { fallbackPassport, fallbackProposal } from "../llm/active-sales-agent.js";

export const activeSalesProduct: ActiveSalesProductFact = {
  id: "NB-401",
  name: "Newborn CalmSleep Kit",
  category: "母婴床品",
  priceUsd: 164,
  stock: 1200,
  rawDescription: "柔软天然的婴儿床品套装，让宝宝整夜安心。标准配送，退货规则见政策页。",
  facts: [
    "TENCEL Lyocell 68%",
    "OEKO-TEX 演示凭证 DEMO-NB-401",
    "60°C 可机洗",
    "无香料整理",
    "72 小时配送 SLA，历史履约置信度 96.8%",
    "30 天机器可读退货",
  ],
};

export const activeSalesBuyers: ActiveSalesBuyerFact[] = [
  {
    id: "mia", displayName: "Mia Park · New Parent", consent: "open",
    profile: "新生儿敏感肌，预算 $180，要求三日送达和可验证材料",
    exposedFields: ["baby-safety", "budget<=180", "delivery<=72h", "return-policy"],
  },
  {
    id: "daycare", displayName: "Little Steps · Daycare Ops", consent: "limited",
    profile: "机构批采，只开放品类、数量、预算带和 SLA",
    exposedFields: ["category", "quantity-band", "budget-band", "delivery-sla"],
  },
  {
    id: "noah", displayName: "Noah Kim · Privacy First", consent: "closed",
    profile: "关闭卖家主动触达，仅允许自己的 Agent 主动搜索",
    exposedFields: [],
  },
];

function matchScore(buyerId: string): number {
  return buyerId === "mia" ? 94 : buyerId === "daycare" ? 87 : 0;
}

function matchReasons(buyerId: string): string[] {
  if (buyerId === "mia") return ["低敏证据可验", "$164 在预算内", "72 小时送达"];
  if (buyerId === "daycare") return ["品类匹配", "可执行 SLA", "批量退货规则"];
  return ["主动触达权限关闭"];
}

async function buildPassport(agent?: ActiveSalesLlmAgent) {
  if (!agent) return { draft: fallbackPassport(activeSalesProduct), generatedBy: "fallback" as const, fallbackReason: "LLM 未启用" };
  try {
    return { draft: await agent.buildPassport(activeSalesProduct), generatedBy: "llm" as const };
  } catch (error) {
    return {
      draft: fallbackPassport(activeSalesProduct), generatedBy: "fallback" as const,
      fallbackReason: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
    };
  }
}

async function writeProposal(buyer: ActiveSalesBuyerFact, passport: ProductPassportDraft, agent?: ActiveSalesLlmAgent) {
  if (!agent) return { pitch: fallbackProposal(activeSalesProduct, buyer), generatedBy: "fallback" as const, fallbackReason: "LLM 未启用" };
  try {
    return { pitch: await agent.writeProposal(activeSalesProduct, buyer, passport), generatedBy: "llm" as const };
  } catch (error) {
    return {
      pitch: fallbackProposal(activeSalesProduct, buyer), generatedBy: "fallback" as const,
      fallbackReason: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
    };
  }
}

export async function runActiveSalesWorkflow(
  router: EventRouter,
  transactionId: string,
  agent?: ActiveSalesLlmAgent,
): Promise<void> {
  await router.publish({
    transactionId, type: "active-sale.product.ingested", source: "seller-catalog",
    payload: {
      productId: activeSalesProduct.id, name: activeSalesProduct.name, category: activeSalesProduct.category,
      priceUsd: activeSalesProduct.priceUsd, stock: activeSalesProduct.stock, sourceCoverage: 58,
      rawDescription: activeSalesProduct.rawDescription,
    },
  });

  const passportResult = await buildPassport(agent);
  await router.publish({
    transactionId, type: "active-sale.passport.published", source: "seller-agent",
    payload: {
      productId: activeSalesProduct.id, ...passportResult.draft, coverageBefore: 58, coverageAfter: 92,
      generatedBy: passportResult.generatedBy, fallbackReason: passportResult.fallbackReason,
    },
  });

  const proposalResults = new Map(await Promise.all(
    activeSalesBuyers
      .filter((buyer) => buyer.consent !== "closed")
      .map(async (buyer) => [buyer.id, await writeProposal(buyer, passportResult.draft, agent)] as const),
  ));

  for (const buyer of activeSalesBuyers) {
    await router.publish({
      transactionId, type: "active-sale.buyer.matched", source: "consent-router", target: buyer.id,
      payload: {
        buyerId: buyer.id, displayName: buyer.displayName, profile: buyer.profile, consent: buyer.consent,
        exposedFields: buyer.exposedFields, matchScore: matchScore(buyer.id), reasons: matchReasons(buyer.id),
      },
    });
  }

  for (const buyer of activeSalesBuyers) {
    if (buyer.consent === "closed") {
      await router.publish({
        transactionId, type: "active-sale.proposal.blocked", source: "consent-router", target: buyer.id,
        payload: {
          buyerId: buyer.id, displayName: buyer.displayName, consent: "closed",
          reason: "买家关闭卖家主动触达；Router 未向 Seller Agent 暴露任何画像字段。", exposedFieldCount: 0,
        },
      });
      continue;
    }
    const proposal = proposalResults.get(buyer.id);
    if (!proposal) throw new Error(`missing active sales proposal for ${buyer.id}`);
    await router.publish({
      transactionId, type: "active-sale.proposal.routed", source: "seller-agent", target: buyer.id,
      payload: {
        buyerId: buyer.id, displayName: buyer.displayName, routeId: `route-${randomUUID()}`,
        consent: buyer.consent, matchScore: matchScore(buyer.id), pitch: proposal.pitch,
        generatedBy: proposal.generatedBy, fallbackReason: proposal.fallbackReason,
      },
    });
  }

  await router.publish({
    transactionId, type: "active-sale.buyer.selected", source: "mia-buyer-agent", target: "seller-agent",
    payload: {
      buyerId: "mia", displayName: "Mia Park · New Parent", score: 94,
      reason: "可验证低敏证据、72 小时履约和预算匹配共同胜出，价格不是唯一决策因素。",
      comparison: [
        { product: "CalmSleep Kit v2.1", priceUsd: 164, evidence: "verified", delivery: "72h", score: 94 },
        { product: "CloudCotton Baby Set", priceUsd: 149, evidence: "partial", delivery: "5d", score: 83 },
        { product: "Organic Dream Bundle", priceUsd: 178, evidence: "verified", delivery: "7d", score: 78 },
      ],
    },
  });

  await router.publish({
    transactionId, type: "active-sale.completed", source: "mia-buyer-agent", target: "seller-agent",
    payload: {
      orderId: `order-${randomUUID()}`, buyerId: "mia", displayName: "Mia Park · New Parent",
      productId: activeSalesProduct.id, productName: activeSalesProduct.name,
      amountUsd: activeSalesProduct.priceUsd, autoApproved: true, humanClicks: 0,
    },
  });
}

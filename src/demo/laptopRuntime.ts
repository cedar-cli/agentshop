import type { StoredEvent } from "../components/live/types";
import type { DemoEvent, DemoOffer, DemoPurchase } from "./demoData";

interface LaptopIntentPayload {
  product: string;
  budgetCny: number;
  deadlineHours: number;
  maxWeightKg: number;
  minBatteryHours: number;
  requiresNationalWarranty: boolean;
  priorities: DemoPurchase["baselinePref"];
  generatedBy: "llm" | "fallback";
}
interface LaptopProposalPayload {
  sellerId: string;
  displayName: string;
  quotedPriceCny: number;
  listPriceCny: number;
  deliveryHours: number;
  weightKg: number;
  batteryHours: number;
  warrantyYears: number;
  nationalWarranty: boolean;
  reputation: number;
  metrics: DemoOffer["metrics"];
  reasoning: string;
  generatedBy: "llm" | "fallback";
  // 商品首图 URL（可选）：通用委托候选携带真实商品图；笔记本场景缺省
  image?: string;
}

interface LaptopSelectionPayload {
  sellerId: string;
  displayName: string;
  score: number;
  reason: string;
}

interface LaptopCounterPayload {
  finalPriceCny: number;
  concessionCny: number;
  reasoning: string;
  generatedBy: "llm" | "fallback";
}

const typedPayload = <T>(event: StoredEvent | undefined) =>
  event?.payload as T | undefined;
const latest = (events: StoredEvent[], type: string) =>
  [...events].reverse().find((event) => event.type === type);
const origin = (generatedBy?: "llm" | "fallback"): DemoEvent["origin"] =>
  generatedBy === "llm" ? "llm" : "rule";

function timeLabel(timestamp: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function eta(hours: number) {
  if (hours <= 24) return "次日达";
  return `${Math.ceil(hours / 24)} 天`;
}

export function adaptLaptopPurchase(
  base: DemoPurchase,
  events: StoredEvent[],
): DemoPurchase {
  if (events.length === 0) return base;
  const intent = typedPayload<LaptopIntentPayload>(
    latest(events, "laptop.intent.structured"),
  );
  const selection = typedPayload<LaptopSelectionPayload>(
    latest(events, "laptop.seller.selected"),
  );
  const counter = typedPayload<LaptopCounterPayload>(
    latest(events, "laptop.counter.response"),
  );
  const order = typedPayload<{ totalPriceCny: number }>(
    latest(events, "laptop.order.confirmed"),
  );
  const approval = latest(events, "laptop.approval.requested");
  const completed = events.some(
    (event) => event.type === "laptop.attestation.issued",
  );
  const proposals = events
    .filter((event) => event.type === "laptop.proposal.submitted")
    .map((event) => typedPayload<LaptopProposalPayload>(event))
    .filter((item): item is LaptopProposalPayload => Boolean(item));

  const paid = order?.totalPriceCny ?? counter?.finalPriceCny ?? 0;
  const offers: DemoOffer[] = proposals.map((proposal) => ({
    seller: proposal.displayName,
    price:
      selection?.sellerId === proposal.sellerId && paid > 0
        ? paid
        : proposal.quotedPriceCny,
    originalPrice: proposal.quotedPriceCny,
    credit: proposal.reputation,
    match:
      selection?.sellerId === proposal.sellerId
        ? Math.round(selection.score)
        : Math.round(
            (proposal.metrics.timeliness +
              proposal.metrics.spec +
              proposal.metrics.price +
              proposal.metrics.afterSales) /
              4,
          ),
    eta: eta(proposal.deliveryHours),
    promise: `${proposal.warrantyYears} 年全国联保`,
    selected: selection?.sellerId === proposal.sellerId,
    reason: proposal.reasoning,
    metrics: proposal.metrics,
    image: proposal.image,
  }));

  return {
    ...base,
    product: intent?.product ?? base.product,
    budget: intent?.budgetCny ?? base.budget,
    paid,
    saved:
      paid > 0 ? Math.max(0, (intent?.budgetCny ?? base.budget) - paid) : 0,
    trustScore: selection ? Math.round(selection.score) : base.trustScore,
    merchantName: selection?.displayName ?? base.merchantName,
    status: completed ? "completed" : approval ? "awaiting" : "negotiating",
    statusLabel: completed ? "已鉴证" : approval ? "待你确认" : "Agent 采购中",
    date: completed ? "刚刚" : "进行中",
    constraints: intent
      ? // maxWeightKg=999 是通用委托意图的哨兵值：说明这不是轻薄本场景，
        // 此时只展示预算与交期这类通用约束，不显示重量/续航等笔记本专属项。
        intent.maxWeightKg >= 999
        ? [
            `预算 ≤¥${(intent.budgetCny ?? base.budget).toLocaleString()}`,
            `${Math.ceil(intent.deadlineHours / 24)} 天内送达`,
          ]
        : [
            `≤${intent.maxWeightKg}kg`,
            `续航 ≥${intent.minBatteryHours}h`,
            `${Math.ceil(intent.deadlineHours / 24)} 天内送达`,
            intent.requiresNationalWarranty ? "全国联保" : "保修可选",
          ]
      : base.constraints,
    result: completed
      ? "人工确认后完成订单；物流与鉴证为明确标注的 Demo 模拟事件。"
      : approval
        ? "议价完成，等待你确认下单。"
        : "Buyer Agent 正在向市场采购。",
    offers: offers.length > 0 ? offers : base.offers,
    baselinePref: intent?.priorities ?? base.baselinePref,
    events: events.map(adaptLaptopEvent),
  };
}

function adaptLaptopEvent(event: StoredEvent): DemoEvent {
  const common = { id: event.id, time: timeLabel(event.timestamp) };
  switch (event.type) {
    case "laptop.purchase.requested": {
      const payload = typedPayload<{ requestText: string }>(event)!;
      return {
        ...common,
        kind: "user",
        actor: "你",
        title: "提出购买委托",
        body: payload.requestText,
        origin: "rule",
      };
    }
    case "delegation.search.completed": {
      // 通用委托专属：一次真实商品检索的结果快照，渲染成「搜索命中候选」决策日志行
      const payload = typedPayload<{
        query: string;
        source: "catalog" | "fallback";
        hitCount: number;
        hits: Array<{
          title: string;
          shopName: string;
          priceMin: number;
          priceMax: number;
          image?: string;
        }>;
      }>(event)!;
      const preview = payload.hits
        .slice(0, 3)
        .map((h) => `${h.shopName}·¥${h.priceMin.toLocaleString()}`)
        .join(" / ");
      // 取召回商品里前 6 张非空图作为缩略图，直观体现「真的搜到了真实商品」
      const images = payload.hits
        .map((h) => h.image)
        .filter((url): url is string => Boolean(url))
        .slice(0, 6);
      return {
        ...common,
        kind: "comparison",
        actor: "C-Agent",
        title: "真实商品检索命中",
        body: `按「${payload.query}」检索商品库，召回 ${payload.hitCount} 个真实候选：${preview}${payload.hits.length > 3 ? " 等" : ""}。`,
        evidence:
          payload.source === "catalog"
            ? "来自真实商品数据集的 FTS5 全文检索结果。"
            : "商品库不可用，回退到内置候选。",
        origin: "rule",
        images,
      };
    }
    case "laptop.intent.structured": {
      const payload = typedPayload<LaptopIntentPayload>(event)!;
      return {
        ...common,
        kind: "agent",
        actor: "C-Agent",
        title: "约束结构化",
        body: `预算 ¥${payload.budgetCny.toLocaleString()}；重量 ≤${payload.maxWeightKg}kg；续航 ≥${payload.minBatteryHours}h；${Math.ceil(payload.deadlineHours / 24)} 天内送达。`,
        evidence: "由模型提取后通过服务端 Schema 和合理区间校验。",
        origin: origin(payload.generatedBy),
      };
    }
    case "laptop.proposal.submitted": {
      const payload = typedPayload<LaptopProposalPayload>(event)!;
      return {
        ...common,
        kind: "seller-message",
        actor: `${payload.displayName} S-Agent`,
        title: "提交受约束报价",
        body: `${payload.reasoning} 报价 ¥${payload.quotedPriceCny.toLocaleString()}，${eta(payload.deliveryHours)}，${payload.warrantyYears} 年联保。`,
        origin: origin(payload.generatedBy),
      };
    }
    case "laptop.seller.rejected": {
      const payload = typedPayload<{ displayName: string; reasons: string[] }>(
        event,
      )!;
      return {
        ...common,
        kind: "evidence",
        actor: "C-Agent",
        title: `${payload.displayName} 未通过硬约束`,
        body: payload.reasons.join("；"),
        impact: "候选淘汰",
        origin: "rule",
      };
    }
    case "laptop.seller.selected": {
      const payload = typedPayload<LaptopSelectionPayload>(event)!;
      return {
        ...common,
        kind: "comparison",
        actor: "C-Agent",
        title: "全量比较并选标",
        body: `${payload.displayName}综合匹配 ${payload.score} 分。${payload.reason}`,
        evidence: "确定性权重计算，不由模型直接决定赢家。",
        origin: "rule",
      };
    }
    case "laptop.counter.offer": {
      const payload = typedPayload<{
        originalPriceCny: number;
        targetPriceCny: number;
        reasoning: string;
      }>(event)!;
      return {
        ...common,
        kind: "negotiation",
        actor: "C-Agent",
        title: "发起自动议价",
        body: payload.reasoning,
        impact: `¥${payload.originalPriceCny.toLocaleString()} → 目标 ¥${payload.targetPriceCny.toLocaleString()}`,
        origin: "rule",
      };
    }
    case "laptop.counter.response": {
      const payload = typedPayload<LaptopCounterPayload>(event)!;
      return {
        ...common,
        kind: "negotiation",
        actor: "中标 S-Agent",
        title: "卖家回应议价",
        body: payload.reasoning,
        impact: `最终 ¥${payload.finalPriceCny.toLocaleString()} · 让利 ¥${payload.concessionCny.toLocaleString()}`,
        origin: origin(payload.generatedBy),
      };
    }
    case "laptop.approval.requested": {
      const payload = typedPayload<{
        reason: string;
        expiresInMinutes: number;
      }>(event)!;
      return {
        ...common,
        kind: "approval",
        actor: "C-Agent",
        title: "请求最终确认",
        body: payload.reason,
        impact: `保价 ${payload.expiresInMinutes} 分钟`,
        origin: "rule",
      };
    }
    case "laptop.order.confirmed": {
      const payload = typedPayload<{
        totalPriceCny: number;
        displayName: string;
        approvedBy?: "human" | "agent";
      }>(event)!;
      const byAgent = payload.approvedBy === "agent";
      return {
        ...common,
        kind: "payment",
        actor: "Buyer Agent",
        title: byAgent ? "Agent 授权内自动下单" : "人工授权下单",
        body: `${byAgent ? "在长期授权阈值内自动" : "已"}向${payload.displayName}创建 Agent Order，成交 ¥${payload.totalPriceCny.toLocaleString()}。`,
        origin: "rule",
      };
    }
    case "laptop.fulfillment.updated": {
      const payload = typedPayload<{
        deliveredEarlyHours: number;
        checks: string[];
      }>(event)!;
      return {
        ...common,
        kind: "fulfilment",
        actor: "Demo 物流 Agent",
        title: "模拟履约完成",
        body: `模拟提前 ${payload.deliveredEarlyHours} 小时送达；${payload.checks.join("、")}。`,
        evidence: "Demo 模拟数据，不代表真实外部物流。",
        origin: "simulation",
      };
    }
    case "laptop.attestation.issued": {
      const payload = typedPayload<{
        merchantCreditBefore: number;
        merchantCreditAfter: number;
      }>(event)!;
      return {
        ...common,
        kind: "attestation",
        actor: "RepChain Demo",
        title: "模拟鉴证写入哈希链",
        body: "时效、规格与包装检查结果已写入本地可验证事件链。",
        impact: `商家信用 ${payload.merchantCreditBefore} → ${payload.merchantCreditAfter}`,
        origin: "simulation",
      };
    }
    default: {
      // 未知事件类型的安全兜底：不访问特定字段，避免运行时崩溃
      return {
        ...common,
        kind: "agent",
        actor: "C-Agent",
        title: event.type,
        body: "",
        origin: "rule",
      };
    }
  }
}

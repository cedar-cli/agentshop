import type { StoredEvent } from "../store/event-store.js";

export interface MerchantTransactionProjection {
  id: string;
  kind: string;
  status: string;
  statusLabel: string;
  buyerName: string;
  product: string;
  category: string;
  mechanism: string;
  constraints: string[];
  budget?: number;
  amount?: number;
  currency: "CNY" | "USD";
  winner?: string;
  score?: number;
  updatedAt: string;
  events: StoredEvent[];
  chainValid: boolean;
}

interface TransactionLike {
  id: string;
  kind: string;
  status: string;
  request: unknown;
  events: StoredEvent[];
  chainValid: boolean;
}

function latest<T>(events: StoredEvent[], type: string): T | undefined {
  return [...events].reverse().find((event) => event.type === type)?.payload as
    T | undefined;
}

function statusLabel(status: string): string {
  if (status === "completed") return "已完成";
  if (status === "awaiting-approval") return "待买家确认";
  if (status === "failed") return "执行失败";
  if (status === "queued") return "排队中";
  return "Agent 协商中";
}

export function projectMerchantTransaction(
  transaction: TransactionLike,
): MerchantTransactionProjection | undefined {
  if (transaction.kind === "demand-network-demo") return undefined;
  const { events } = transaction;
  const updatedAt = events.at(-1)?.timestamp ?? new Date().toISOString();

  if (transaction.kind === "laptop-demo") {
    const intent = latest<{
      product: string;
      budgetCny: number;
      deadlineHours: number;
      maxWeightKg: number;
      minBatteryHours: number;
      requiresNationalWarranty: boolean;
    }>(events, "laptop.intent.structured");
    const selected = latest<{ displayName: string; score: number }>(
      events,
      "laptop.seller.selected",
    );
    const order = latest<{ totalPriceCny: number }>(
      events,
      "laptop.order.confirmed",
    );
    const counter = latest<{ finalPriceCny: number }>(
      events,
      "laptop.counter.response",
    );
    return {
      id: transaction.id,
      kind: transaction.kind,
      status: transaction.status,
      statusLabel: statusLabel(transaction.status),
      buyerName: "买家 C-Agent · 出差采购",
      product: intent?.product ?? "14 英寸 AI 轻薄本",
      category: "3C 数码",
      mechanism: "买家意图采购 + 自动议价",
      constraints: intent
        ? [
            `≤${intent.maxWeightKg}kg`,
            `续航 ≥${intent.minBatteryHours}h`,
            `${Math.ceil(intent.deadlineHours / 24)} 天送达`,
            intent.requiresNationalWarranty ? "全国联保" : "保修可选",
          ]
        : [],
      budget: intent?.budgetCny,
      amount: order?.totalPriceCny ?? counter?.finalPriceCny,
      currency: "CNY",
      winner: selected?.displayName,
      score: selected?.score,
      updatedAt,
      events,
      chainValid: transaction.chainValid,
    };
  }

  if (transaction.kind === "household-restock-demo") {
    const intent = latest<{
      product: string;
      budgetCny: number;
      deadlineHours: number;
      constraints: string[];
    }>(events, "restock.intent.created");
    const selected = latest<{ displayName: string; score: number }>(
      events,
      "restock.seller.selected",
    );
    const order = latest<{ totalPriceCny: number }>(
      events,
      "restock.order.confirmed",
    );
    return {
      id: transaction.id,
      kind: transaction.kind,
      status: transaction.status,
      statusLabel: statusLabel(transaction.status),
      buyerName: "家庭补库 C-Agent",
      product: intent?.product ?? "厨房纸 + 洗手液",
      category: "日用百货",
      mechanism: "长期授权自主采购",
      constraints: intent?.constraints ?? [],
      budget: intent?.budgetCny,
      amount: order?.totalPriceCny,
      currency: "CNY",
      winner: selected?.displayName,
      score: selected?.score,
      updatedAt,
      events,
      chainValid: transaction.chainValid,
    };
  }

  if (transaction.kind === "active-sales-demo") {
    const completed = latest<{
      displayName: string;
      productName: string;
      amountUsd: number;
    }>(events, "active-sale.completed");
    const selected = latest<{ displayName: string; score: number }>(
      events,
      "active-sale.buyer.selected",
    );
    return {
      id: transaction.id,
      kind: transaction.kind,
      status: transaction.status,
      statusLabel: statusLabel(transaction.status),
      buyerName: completed?.displayName ?? "Mia Park · Buyer Agent",
      product: completed?.productName ?? "Newborn CalmSleep Kit",
      category: "母婴床品",
      mechanism: "授权 Inbox 主动销售",
      constraints: ["预算 ≤$180", "72 小时送达", "低敏证据可验证"],
      budget: 180,
      amount: completed?.amountUsd,
      currency: "USD",
      winner: "DeepLumen Seller Agent",
      score: selected?.score,
      updatedAt,
      events,
      chainValid: transaction.chainValid,
    };
  }

  if (transaction.kind === "intent-growth-demo") {
    const order = latest<{ buyerName: string; totalUsd: number }>(
      events,
      "intent-growth.order.signed",
    );
    const rank = latest<{ scoreAfter: number }>(
      events,
      "intent-growth.rank.updated",
    );
    const version = latest<{ productName: string; version: string }>(
      events,
      "intent-growth.product.version.published",
    );
    return {
      id: transaction.id,
      kind: transaction.kind,
      status: transaction.status,
      statusLabel: statusLabel(transaction.status),
      buyerName: order?.buyerName ?? "Intent Learning Engine",
      product: version
        ? `${version.productName} · ${version.version}`
        : "LumaCalm Product Output v2.1",
      category: "母婴床品",
      mechanism: "落选对话学习 + 商品进化",
      constraints: ["60°C 清洗", "120 次耐久", "9 天批量 SLA"],
      budget: 9200,
      amount: order?.totalUsd,
      currency: "USD",
      winner: "LumaCalm Seller Agent",
      score: rank?.scoreAfter ?? 96,
      updatedAt,
      events,
      chainValid: transaction.chainValid,
    };
  }

  if (transaction.kind === "newborn-bedding-demo") {
    const intent = latest<{
      productDescription: string;
      budgetUsd: number;
      deadlineHours: number;
    }>(events, "intent.published");
    const receipt = latest<{ amountUsd: number }>(events, "receipt.issued");
    const authorized = latest<{ scoreSnapshot: { totalScore: number } }>(
      events,
      "order.authorized",
    );
    return {
      id: transaction.id,
      kind: transaction.kind,
      status: transaction.status,
      statusLabel: statusLabel(transaction.status),
      buyerName: "New Parent Buyer Agent",
      product: intent?.productDescription ?? "新生儿低敏床品",
      category: "母婴床品",
      mechanism: "机器询证 + 自动购买",
      constraints: intent
        ? [
            `预算 $${intent.budgetUsd}`,
            `${intent.deadlineHours} 小时送达`,
            "证据完整",
          ]
        : [],
      budget: intent?.budgetUsd,
      amount: receipt?.amountUsd,
      currency: "USD",
      winner: "Seller C",
      score: authorized?.scoreSnapshot.totalScore,
      updatedAt,
      events,
      chainValid: transaction.chainValid,
    };
  }

  const request = transaction.request as { product?: string; budget?: number };
  return {
    id: transaction.id,
    kind: transaction.kind,
    status: transaction.status,
    statusLabel: statusLabel(transaction.status),
    buyerName: "Buyer Agent",
    product: request.product ?? "采购请求",
    category: "通用采购",
    mechanism: "A2A 竞价",
    constraints: [],
    budget: request.budget,
    currency: "CNY",
    updatedAt,
    events,
    chainValid: transaction.chainValid,
  };
}

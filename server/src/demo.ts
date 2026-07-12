import "dotenv/config";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { BuyerAgent } from "./agents/buyer-agent.js";
import { SellerAgent } from "./agents/seller-agent.js";
import { sellerProfiles } from "./agents/seller-profiles.js";
import { OpenAIProposalGenerator } from "./llm/openai-proposal-generator.js";
import { OpenAICounterNegotiator } from "./llm/openai-counter-negotiator.js";
import type { AgentEventType } from "./protocol/events.js";
import { EventRouter } from "./router/event-router.js";
import { EventStore } from "./store/event-store.js";

const labels: Record<AgentEventType, string> = {
  "purchase.requested": "买家发布采购需求",
  "proposal.submitted": "卖家提交报价",
  "seller.selected": "买家选定卖家",
  "counter.offer": "买家发起还价",
  "counter.response": "卖家应答还价",
  "order.confirmed": "订单确认",
  // 以下为新增协议事件的展示标签，仅补齐类型完整性；当前 demo 流程不会产生这些事件
  "intent.published": "买家发布可执行意图",
  "seller.matched": "系统匹配候选卖家",
  "evidence.requested": "买家发起证据询证",
  "evidence.submitted": "卖家提交证据作答",
  "seller.score.updated": "更新卖家评分向量",
  "order.authorized": "买家授权自动下单",
  "receipt.issued": "平台签发实时回执",
  "delegation.search.completed": "委托真实搜索命中候选",
  "laptop.purchase.requested": "用户提出轻薄本委托",
  "laptop.intent.structured": "买家结构化轻薄本意图",
  "laptop.proposal.submitted": "轻薄本卖家提交报价",
  "laptop.seller.rejected": "轻薄本卖家未通过硬约束",
  "laptop.seller.selected": "买家选定轻薄本卖家",
  "laptop.counter.offer": "买家发起轻薄本还价",
  "laptop.counter.response": "轻薄本卖家回应还价",
  "laptop.approval.requested": "等待买家确认轻薄本订单",
  "laptop.order.confirmed": "轻薄本订单确认",
  "laptop.fulfillment.updated": "轻薄本模拟履约完成",
  "laptop.attestation.issued": "轻薄本模拟鉴证签发",
  "restock.time.advanced": "补库演示时间推进",
  "restock.inventory.forecasted": "库存预测触发",
  "restock.authorization.checked": "长期授权校验",
  "restock.intent.created": "自动生成补库意图",
  "restock.proposal.submitted": "日用品卖家提交报价",
  "restock.seller.selected": "自动选定补库卖家",
  "restock.bundle.negotiated": "组合采购议价",
  "restock.order.authorized": "授权内自动购买",
  "restock.order.confirmed": "补库订单确认",
  "restock.inventory.updated": "模拟家庭库存更新",
  "restock.memory.updated": "更新消耗记忆",
  "restock.notification.sent": "向人类发送完成摘要",
  "active-sale.product.ingested": "商品进入 Seller Agent",
  "active-sale.passport.published": "发布 Product Passport",
  "active-sale.buyer.matched": "匹配授权买家画像",
  "active-sale.proposal.routed": "主动提案写入授权 Inbox",
  "active-sale.proposal.blocked": "Consent Router 拦截提案",
  "active-sale.buyer.selected": "Buyer Agent 自动选中商品",
  "active-sale.completed": "授权范围内自动成交",
  "demand.need.received": "买家需求进入市场",
  "demand.intent.structured": "需求结构化为 Intent",
  "demand.market.aggregated": "聚合市场需求热力",
  "demand.product.forecasted": "Seller Agent 完成选品预测",
  "demand.supply.negotiated": "Seller 与 Supply Agent 协商",
  "demand.batch.completed": "模拟生产批次完成",
  "distribution.contract.published": "发布分销合约",
  "distribution.agent.matched": "匹配分销 Agent",
  "distribution.orders.completed": "分销网络规模成交",
  "distribution.commission.released": "履约鉴证后释放佣金",
  "intent-growth.market.ranked": "意图市场生成卖家排行榜",
  "intent-growth.seller.shortlisted": "买家选出沟通卖家",
  "intent-growth.dialogue.round": "买卖 Agent 多轮沟通",
  "intent-growth.seller.lost": "卖家落选并进入复盘",
  "intent-growth.learning.started": "Intent Learning Engine 启动",
  "intent-growth.intent.extracted": "提取可用 Intent",
  "intent-growth.gap.detected": "识别商品能力缺口",
  "intent-growth.product.field.updated": "写入商品能力字段",
  "intent-growth.product.version.published": "发布新版 Product Output",
  "intent-growth.buyer.rematched": "新买家重新匹配商品",
  "intent-growth.quote.requested": "Buyer Agent 请求报价",
  "intent-growth.terms.negotiated": "A2A 自动议价",
  "intent-growth.order.signed": "机器可执行订单签署",
  "intent-growth.attestation.issued": "RepChain 履约鉴证",
  "intent-growth.rank.updated": "信用回流并提升排名",
};

mkdirSync("data", { recursive: true });

const store = new EventStore("data/agentshop.db");
const router = new EventRouter(store);
const buyer = new BuyerAgent(sellerProfiles.length);
const proposalGenerator = new OpenAIProposalGenerator();
const counterNegotiator = new OpenAICounterNegotiator();

router.subscribe("purchase.requested", buyer);
router.subscribe("proposal.submitted", buyer);
router.subscribe("seller.selected", buyer);
router.subscribe("counter.response", buyer);

for (const profile of sellerProfiles) {
  const seller = new SellerAgent(profile, proposalGenerator, counterNegotiator);
  router.subscribe("purchase.requested", seller);
  router.subscribe("counter.offer", seller);
}

router.observe((event) => {
  const target = event.target ? ` -> ${event.target}` : "";
  console.log(
    `[${String(event.sequence).padStart(2, "0")}] ${labels[event.type]}: ${event.source}${target}`,
  );

  if (event.type === "proposal.submitted") {
    console.log(
      `     ¥${event.payload.totalPrice} / ${event.payload.deliveryHours}h / 信用 ${event.payload.reputation} / ${event.payload.generatedBy}`,
    );
    console.log(`     ${event.payload.reasoning}`);
    if (event.payload.fallbackReason) {
      console.log(`     fallback: ${event.payload.fallbackReason}`);
    }
  }

  if (event.type === "seller.selected") {
    console.log(
      `     中标 ${event.payload.sellerId}，综合评分 ${event.payload.score}`,
    );
  }

  if (event.type === "counter.offer") {
    console.log(
      `     原价 ¥${event.payload.originalPrice} → 目标价 ¥${event.payload.targetPrice}`,
    );
    console.log(`     ${event.payload.reasoning}`);
  }

  if (event.type === "counter.response") {
    const verb = event.payload.accepted ? "让步" : "坚持原价";
    console.log(
      `     ${verb}，最终价 ¥${event.payload.finalPrice}（让利 ¥${event.payload.concession}）/ ${event.payload.generatedBy}`,
    );
    console.log(`     ${event.payload.reasoning}`);
    if (event.payload.fallbackReason) {
      console.log(`     fallback: ${event.payload.fallbackReason}`);
    }
  }
});

const transactionId = `tx-${randomUUID()}`;

try {
  console.log(`\nAgentShop Demo · ${transactionId}\n`);

  await router.publish({
    transactionId,
    type: "purchase.requested",
    source: buyer.id,
    payload: {
      product: "黑客松能量补给包",
      quantity: 200,
      budget: 8000,
      deadline: "2026-07-12T12:00:00+08:00",
      constraints: {
        allergenFree: ["peanut"],
      },
      weights: {
        price: 0.3,
        reputation: 0.6,
        delivery: 0.1,
      },
    },
  });

  const events = store.list(transactionId);
  console.log(
    `\nRepChain: ${events.length} 条事件，哈希链${
      store.verify(transactionId) ? "校验通过" : "校验失败"
    }。`,
  );
} finally {
  store.close();
}

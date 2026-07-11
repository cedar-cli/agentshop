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
  "proposal.submitted": "商家提交报价",
  "seller.selected": "买家选定商家",
  "counter.offer": "买家发起还价",
  "counter.response": "商家应答还价",
  "order.confirmed": "订单确认",
  // 以下为新增协议事件的展示标签，仅补齐类型完整性；当前 demo 流程不会产生这些事件
  "intent.published": "买家发布可执行意图",
  "seller.matched": "系统匹配候选商家",
  "evidence.requested": "买家发起证据询证",
  "evidence.submitted": "商家提交证据作答",
  "seller.score.updated": "更新商家评分向量",
  "order.authorized": "买家授权自动下单",
  "receipt.issued": "平台签发实时回执",
  "laptop.purchase.requested": "用户提出轻薄本委托",
  "laptop.intent.structured": "买家结构化轻薄本意图",
  "laptop.proposal.submitted": "轻薄本商家提交报价",
  "laptop.seller.rejected": "轻薄本商家未通过硬约束",
  "laptop.seller.selected": "买家选定轻薄本商家",
  "laptop.counter.offer": "买家发起轻薄本还价",
  "laptop.counter.response": "轻薄本商家回应还价",
  "laptop.approval.requested": "等待买家确认轻薄本订单",
  "laptop.order.confirmed": "轻薄本订单确认",
  "laptop.fulfillment.updated": "轻薄本模拟履约完成",
  "laptop.attestation.issued": "轻薄本模拟鉴证签发",
  "restock.time.advanced": "补库演示时间推进",
  "restock.inventory.forecasted": "库存预测触发",
  "restock.authorization.checked": "长期授权校验",
  "restock.intent.created": "自动生成补库意图",
  "restock.proposal.submitted": "日用品商家提交报价",
  "restock.seller.selected": "自动选定补库商家",
  "restock.bundle.negotiated": "组合采购议价",
  "restock.order.authorized": "授权内自动购买",
  "restock.order.confirmed": "补库订单确认",
  "restock.inventory.updated": "模拟家庭库存更新",
  "restock.memory.updated": "更新消耗记忆",
  "restock.notification.sent": "向人类发送完成摘要",
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

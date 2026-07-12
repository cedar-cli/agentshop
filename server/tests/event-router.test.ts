import { describe, expect, it } from "vitest";
import { BuyerAgent } from "../src/agents/buyer-agent.js";
import { SellerAgent } from "../src/agents/seller-agent.js";
import { sellerProfiles } from "../src/agents/seller-profiles.js";
import { EventRouter } from "../src/router/event-router.js";
import { EventStore } from "../src/store/event-store.js";

describe("EventRouter", () => {
  it("completes a purchase flow and creates a valid hash chain", async () => {
    const store = new EventStore(":memory:");
    const router = new EventRouter(store);
    const buyer = new BuyerAgent(3);

    router.subscribe("purchase.requested", buyer);
    router.subscribe("proposal.submitted", buyer);
    router.subscribe("seller.selected", buyer);
    router.subscribe("counter.response", buyer);

    for (const profile of sellerProfiles) {
      const seller = new SellerAgent(profile);
      router.subscribe("purchase.requested", seller);
      router.subscribe("counter.offer", seller);
    }

    const transactionId = "tx-test";
    await router.publish({
      transactionId,
      type: "purchase.requested",
      source: buyer.id,
      payload: {
        product: "能量补给包",
        quantity: 200,
        budget: 8000,
        deadline: "2026-07-12T12:00:00+08:00",
        constraints: { allergenFree: ["peanut"] },
        weights: { price: 0.3, reputation: 0.6, delivery: 0.1 },
      },
    });

    const events = store.list(transactionId);
    expect(events.map((event) => event.type)).toEqual([
      "purchase.requested",
      "proposal.submitted",
      "proposal.submitted",
      "proposal.submitted",
      "seller.selected",
      "counter.offer",
      "counter.response",
      "order.confirmed",
    ]);
    expect(events[4]?.payload).toMatchObject({ sellerId: "seller-b" });

    // 砍价环节：买家向赢家 seller-b 发起还价，卖家应答，最终订单价采用应答的成交价
    const counterResponse = events[6];
    if (counterResponse?.type !== "counter.response") {
      throw new Error("Expected a counter.response event");
    }
    expect(counterResponse.payload.sellerId).toBe("seller-b");

    const order = events[7];
    if (order?.type !== "order.confirmed") {
      throw new Error("Expected an order.confirmed event");
    }
    expect(order.payload.totalPrice).toBe(counterResponse.payload.finalPrice);

    expect(store.verify(transactionId)).toBe(true);

    store.close();
  });
});

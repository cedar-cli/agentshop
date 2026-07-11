import { describe, expect, it } from "vitest";
import type { ProposalGenerator } from "../src/agents/proposal-generator.js";
import { SellerAgent } from "../src/agents/seller-agent.js";
import { sellerProfiles } from "../src/agents/seller-profiles.js";

const requestEvent = {
  id: "event-1",
  transactionId: "tx-1",
  type: "purchase.requested" as const,
  source: "buyer-agent",
  timestamp: "2026-07-11T13:00:00.000Z",
  payload: {
    product: "能量补给包",
    quantity: 200,
    budget: 8000,
    deadline: "2026-07-12T12:00:00+08:00",
    constraints: { allergenFree: ["peanut"] },
    weights: { price: 0.3, reputation: 0.6, delivery: 0.1 },
  },
};

describe("SellerAgent", () => {
  it("uses a valid model proposal", async () => {
    const generator: ProposalGenerator = {
      async generate() {
        return {
          totalPrice: 5800,
          deliveryHours: 10,
          reasoning: "以低价策略争取订单",
        };
      },
    };

    const [event] = await new SellerAgent(
      sellerProfiles[0]!,
      generator,
    ).handle(requestEvent);

    expect(event?.payload).toMatchObject({
      totalPrice: 5800,
      generatedBy: "llm",
    });
  });

  it("falls back when a model violates the cost floor", async () => {
    const generator: ProposalGenerator = {
      async generate() {
        return {
          totalPrice: 1,
          deliveryHours: 1,
          reasoning: "不可履约报价",
        };
      },
    };

    const [event] = await new SellerAgent(
      sellerProfiles[0]!,
      generator,
    ).handle(requestEvent);

    expect(event?.payload).toMatchObject({
      generatedBy: "fallback",
      fallbackReason: "seller-a proposal is below its cost floor",
    });
    expect(event?.type).toBe("proposal.submitted");
    if (event?.type !== "proposal.submitted") {
      throw new Error("Expected a proposal event");
    }
    expect(event.payload.totalPrice).toBeGreaterThan(5600);
  });
});

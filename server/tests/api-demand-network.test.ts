import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createFallbackProposal } from "../src/agents/proposal-generator.js";
import { TransactionService } from "../src/app/transaction-service.js";
import type { DemandNetworkLlmAgent } from "../src/llm/demand-network-agent.js";
import { buildApp } from "../src/server/app.js";

const services: TransactionService[] = [];
afterEach(() => { for (const service of services.splice(0)) service.close(); });

function makeService(demandNetworkLlmAgent?: DemandNetworkLlmAgent) {
  const service = new TransactionService({
    databaseFilename: ":memory:",
    proposalGenerator: { async generate(profile, request) { return createFallbackProposal(profile, request); } },
    demandNetworkLlmAgent,
  });
  services.push(service);
  return service;
}

async function waitForCompletion(service: TransactionService, transactionId: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const snapshot = service.get(transactionId);
    if (snapshot?.status === "completed" || snapshot?.status === "failed") return snapshot;
    await delay(5);
  }
  throw new Error("demand network transaction timed out");
}

describe("demand-to-distribution API", () => {
  it("runs the complete 25-event chain and releases commission after attested orders", async () => {
    const service = makeService();
    const app = buildApp(service);
    const created = await app.inject({
      method: "POST", url: "/api/seller/demand-network",
      payload: { commissionRate: 4.5, maxDiscountPercent: 9 },
    });
    expect(created.statusCode).toBe(202);
    const snapshot = await waitForCompletion(service, created.json<{ transactionId: string }>().transactionId);

    expect(snapshot.status).toBe("completed");
    expect(snapshot.kind).toBe("demand-network-demo");
    expect(snapshot.chainValid).toBe(true);
    expect(snapshot.events).toHaveLength(25);
    expect(snapshot.events.filter((event) => event.type === "demand.need.received")).toHaveLength(6);
    expect(snapshot.events.filter((event) => event.type === "demand.intent.structured")).toHaveLength(6);
    expect(snapshot.events.filter((event) => event.type === "distribution.agent.matched")).toHaveLength(6);

    const contract = snapshot.events.find((event) => event.type === "distribution.contract.published");
    expect(contract?.payload).toMatchObject({ commissionRate: 4.5, maxDiscountPercent: 9, settlementCondition: "fulfilled-and-attested" });
    const ordersIndex = snapshot.events.findIndex((event) => event.type === "distribution.orders.completed");
    const commissionIndex = snapshot.events.findIndex((event) => event.type === "distribution.commission.released");
    expect(commissionIndex).toBeGreaterThan(ordersIndex);
    expect(snapshot.events[ordersIndex]?.payload).toMatchObject({ orderCount: 342, attestedOrders: 342, simulated: true });
    expect(snapshot.events[commissionIndex]?.payload).toMatchObject({
      commissionRate: 4.5, amountUsd: 5787.18, condition: "fulfilled-and-attested", hashChainVerified: true,
    });

    await app.close();
  });

  it("uses LLM for three sample intents and supply negotiation", async () => {
    const parsedIds: string[] = [];
    const llm: DemandNetworkLlmAgent = {
      async parseIntent(need) {
        parsedIds.push(need.id);
        return need.fallbackIntent;
      },
      async negotiateSupply() {
        return { unitPriceUsd: 73, depositPercent: 28, deliveryDays: 8, delayPenaltyPercentPerDay: 2, reasoning: "LLM negotiated" };
      },
    };
    const service = makeService(llm);
    const app = buildApp(service);
    const created = await app.inject({
      method: "POST", url: "/api/seller/demand-network",
      payload: { commissionRate: 3, maxDiscountPercent: 8 },
    });
    const snapshot = await waitForCompletion(service, created.json<{ transactionId: string }>().transactionId);

    expect(parsedIds).toEqual(["A17", "B04", "H09"]);
    const intents = snapshot.events.filter((event) => event.type === "demand.intent.structured");
    expect(intents.slice(0, 3).every((event) => event.payload.generatedBy === "llm")).toBe(true);
    expect(intents.slice(3).every((event) => event.payload.generatedBy === "fallback")).toBe(true);
    expect(snapshot.events.find((event) => event.type === "demand.supply.negotiated")?.payload)
      .toMatchObject({ unitPriceUsd: 73, deliveryDays: 8, generatedBy: "llm" });

    await app.close();
  });

  it("rejects distribution parameters outside contract guardrails", async () => {
    const app = buildApp(makeService());
    const response = await app.inject({
      method: "POST", url: "/api/seller/demand-network",
      payload: { commissionRate: 20, maxDiscountPercent: 1 },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

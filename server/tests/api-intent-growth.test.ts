import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createFallbackProposal } from "../src/agents/proposal-generator.js";
import { TransactionService } from "../src/app/transaction-service.js";
import type { IntentGrowthLlmAgent } from "../src/llm/intent-growth-agent.js";
import { fallbackIntentGrowthAnalysis } from "../src/llm/intent-growth-agent.js";
import { buildApp } from "../src/server/app.js";

const services: TransactionService[] = [];
afterEach(() => { for (const service of services.splice(0)) service.close(); });

function makeService(intentGrowthLlmAgent?: IntentGrowthLlmAgent) {
  const service = new TransactionService({
    databaseFilename: ":memory:",
    proposalGenerator: { async generate(profile, request) { return createFallbackProposal(profile, request); } },
    intentGrowthLlmAgent,
    intentGrowthStepDelayMs: 0,
  });
  services.push(service);
  return service;
}

async function waitForCompletion(service: TransactionService, transactionId: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const snapshot = service.get(transactionId);
    if (snapshot?.status === "completed" || snapshot?.status === "failed") return snapshot;
    await delay(5);
  }
  throw new Error("intent growth transaction timed out");
}

describe("intent growth API", () => {
  it("turns a lost seller conversation into a versioned product, order and rank lift", async () => {
    const service = makeService();
    const app = buildApp(service);
    const created = await app.inject({ method: "POST", url: "/api/seller/intent-growth" });
    expect(created.statusCode).toBe(202);
    const { transactionId } = created.json<{ transactionId: string }>();
    const snapshot = await waitForCompletion(service, transactionId);

    expect(snapshot.status).toBe("completed");
    expect(snapshot.kind).toBe("intent-growth-demo");
    expect(snapshot.chainValid).toBe(true);
    expect(snapshot.events).toHaveLength(32);
    expect(snapshot.events[0]?.type).toBe("intent-growth.market.ranked");
    expect(snapshot.events.at(-1)?.type).toBe("intent-growth.rank.updated");
    expect(snapshot.events.filter((event) => event.type === "intent-growth.dialogue.round")).toHaveLength(12);
    expect(snapshot.events.filter((event) => event.type === "intent-growth.intent.extracted")).toHaveLength(4);

    const version = snapshot.events.find((event) => event.type === "intent-growth.product.version.published");
    expect(version?.payload).toMatchObject({ previousVersion: "v2.1", version: "v2.2", coverageBefore: 61, coverageAfter: 91 });
    expect(snapshot.events.filter((event) => event.type === "intent-growth.product.field.updated").map((event) => event.payload.field))
      .toEqual(["wash_temperature", "use_context", "wash_cycles", "bulk_terms"]);
    const match = snapshot.events.find((event) => event.type === "intent-growth.buyer.rematched");
    expect(match?.payload).toMatchObject({ buyerName: "Little Steps Daycare", scoreBefore: 78, scoreAfter: 96 });
    const order = snapshot.events.find((event) => event.type === "intent-growth.order.signed");
    expect(order?.payload).toMatchObject({ quantity: 80, unitPriceUsd: 112, totalUsd: 8960, deliveryDays: 9 });
    const rank = snapshot.events.at(-1);
    expect(rank?.payload).toMatchObject({ rankBefore: 3, rankAfter: 1, shortlistRateAfter: 31, ordersPerDayAfter: 19, simulatedProjection: true });

    const merchant = await app.inject({ method: "GET", url: "/api/merchant/transactions" });
    expect(merchant.json<{ transactions: Array<{ id: string; amount?: number; mechanism: string }> }>().transactions)
      .toContainEqual(expect.objectContaining({ id: transactionId, amount: 8960, mechanism: "落选对话学习 + 商品进化" }));
    await app.close();
  });

  it("uses the injected LLM analysis and preserves its evidence", async () => {
    const base = fallbackIntentGrowthAnalysis();
    const llm: IntentGrowthLlmAgent = {
      async analyzeLoss() {
        return { ...base, gapSummary: "LLM 识别的商品缺口", optimizationSummary: "LLM 生成的优化摘要" };
      },
    };
    const service = makeService(llm);
    const app = buildApp(service);
    const created = await app.inject({ method: "POST", url: "/api/seller/intent-growth" });
    const snapshot = await waitForCompletion(service, created.json<{ transactionId: string }>().transactionId);

    const learning = snapshot.events.find((event) => event.type === "intent-growth.learning.started");
    expect(learning?.payload.generatedBy).toBe("llm");
    const gap = snapshot.events.find((event) => event.type === "intent-growth.gap.detected");
    expect(gap?.payload).toMatchObject({ summary: "LLM 识别的商品缺口", generatedBy: "llm" });
    const version = snapshot.events.find((event) => event.type === "intent-growth.product.version.published");
    expect(version?.payload.summary).toBe("LLM 生成的优化摘要");
    await app.close();
  });
});

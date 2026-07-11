import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { TransactionService } from "../src/app/transaction-service.js";
import { createFallbackProposal } from "../src/agents/proposal-generator.js";
import type { LaptopLlmAgent } from "../src/llm/laptop-agent.js";
import { buildApp } from "../src/server/app.js";

const services: TransactionService[] = [];

afterEach(() => {
  for (const service of services.splice(0)) service.close();
});
const laptopLlm: LaptopLlmAgent = {
  async parseIntent() {
    return {
      product: "14 英寸 AI 轻薄本",
      budgetCny: 9000,
      deadlineHours: 72,
      maxWeightKg: 1.3,
      minBatteryHours: 12,
      requiresNationalWarranty: true,
      priorities: { timeliness: 30, spec: 30, price: 25, afterSales: 15 },
    };
  },
  async generateProposal(seller) {
    return { quotedPriceCny: seller.preferredPriceCny, reasoning: `${seller.displayName}真实模型报价` };
  },
  async negotiate(seller, _intent, offer) {
    return { finalPriceCny: Math.max(seller.minimumPriceCny, offer.targetPriceCny), reasoning: "接受目标价并保留三年联保" };
  },
};

describe("laptop purchase demo API", () => {
  it("waits for human approval before completing the hashed event chain", async () => {
    const service = new TransactionService({
      databaseFilename: ":memory:",
      proposalGenerator: { async generate(profile, request) { return createFallbackProposal(profile, request); } },
      laptopLlmAgent: laptopLlm,
    });
    services.push(service);
    const app = buildApp(service);
    const merchantUpdates: string[] = [];
    const unsubscribeMerchant = service.subscribeMerchantTransactions((update) => merchantUpdates.push(update.transaction.id));

    const create = await app.inject({
      method: "POST",
      url: "/api/demo/laptop-purchase",
      payload: { requestText: "下周出差前买轻薄本，预算9000元，三天内送达且全国联保" },
    });
    expect(create.statusCode).toBe(202);
    const { transactionId } = create.json<{ transactionId: string }>();

    let snapshot;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      snapshot = service.get(transactionId);
      if (snapshot?.status === "awaiting-approval") break;
      await delay(5);
    }
    expect(snapshot?.status).toBe("awaiting-approval");
    expect(snapshot?.events.at(-1)?.type).toBe("laptop.approval.requested");
    expect(snapshot?.events.filter((event) => event.type === "laptop.proposal.submitted")).toHaveLength(3);
    expect(snapshot?.events.find((event) => event.type === "laptop.seller.selected")?.payload).toMatchObject({
      sellerId: "laptop-seller-cloud",
    });
    expect(snapshot?.events.some((event) => event.type === "laptop.order.confirmed")).toBe(false);

    const approve = await app.inject({
      method: "POST",
      url: `/api/transactions/${transactionId}/approve`,
    });
    expect(approve.statusCode).toBe(200);
    const completed = approve.json<{ status: string; chainValid: boolean; events: Array<{ type: string }> }>();
    expect(completed.status).toBe("completed");
    expect(completed.chainValid).toBe(true);
    expect(completed.events.slice(-3).map((event) => event.type)).toEqual([
      "laptop.order.confirmed",
      "laptop.fulfillment.updated",
      "laptop.attestation.issued",
    ]);

    const merchant = await app.inject({ method: "GET", url: "/api/merchant/transactions" });
    expect(merchant.json<{ transactions: Array<{ id: string; kind: string; product: string; status: string }> }>().transactions)
      .toContainEqual(expect.objectContaining({ id: transactionId, kind: "laptop-demo", product: "14 英寸 AI 轻薄本", status: "completed" }));
    expect(merchantUpdates).toContain(transactionId);

    unsubscribeMerchant();
    await app.close();
  });
});

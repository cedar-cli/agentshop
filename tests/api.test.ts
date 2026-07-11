import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { TransactionService } from "../src/app/transaction-service.js";
import { createFallbackProposal } from "../src/agents/proposal-generator.js";
import { buildApp } from "../src/server/app.js";

const services: TransactionService[] = [];

afterEach(() => {
  for (const service of services.splice(0)) service.close();
});

describe("transaction API", () => {
  it("creates a transaction and exposes its completed event history", async () => {
    const service = new TransactionService({
      databaseFilename: ":memory:",
      proposalGenerator: {
        async generate(profile, request) {
          return createFallbackProposal(profile, request);
        },
      },
    });
    services.push(service);
    const app = buildApp(service);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/transactions",
      payload: {
        product: "黑客松能量补给包",
        quantity: 200,
        budget: 8000,
        deadline: "2026-07-12T12:00:00+08:00",
        constraints: { allergenFree: ["peanut"] },
        weights: { price: 0.3, reputation: 0.6, delivery: 0.1 },
      },
    });

    expect(createResponse.statusCode).toBe(202);
    const { transactionId } = createResponse.json<{ transactionId: string }>();

    let snapshot;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await app.inject({
        method: "GET",
        url: `/api/transactions/${transactionId}`,
      });
      snapshot = response.json<{
        status: string;
        chainValid: boolean;
        events: Array<{ type: string }>;
      }>();
      if (snapshot.status === "completed") break;
      await delay(5);
    }

    expect(snapshot?.status).toBe("completed");
    expect(snapshot?.chainValid).toBe(true);
    expect(snapshot?.events.map((event) => event.type)).toEqual([
      "purchase.requested",
      "proposal.submitted",
      "proposal.submitted",
      "proposal.submitted",
      "seller.selected",
      "counter.offer",
      "counter.response",
      "order.confirmed",
    ]);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/transactions",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(
      listResponse.json<{ transactions: Array<{ id: string }> }>().transactions,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: transactionId })]));

    await app.close();
  });
});

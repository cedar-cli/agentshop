import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createFallbackProposal } from "../src/agents/proposal-generator.js";
import { TransactionService } from "../src/app/transaction-service.js";
import type { ActiveSalesLlmAgent } from "../src/llm/active-sales-agent.js";
import { buildApp } from "../src/server/app.js";

const services: TransactionService[] = [];
afterEach(() => { for (const service of services.splice(0)) service.close(); });

function makeService(activeSalesLlmAgent?: ActiveSalesLlmAgent) {
  const service = new TransactionService({
    databaseFilename: ":memory:",
    proposalGenerator: { async generate(profile, request) { return createFallbackProposal(profile, request); } },
    activeSalesLlmAgent,
  });
  services.push(service);
  return service;
}

async function waitForCompletion(service: TransactionService, transactionId: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const snapshot = service.get(transactionId);
    if (snapshot?.status === "completed" || snapshot?.status === "failed") return snapshot;
    await delay(5);
  }
  throw new Error("active sales transaction timed out");
}

describe("active sales router API", () => {
  it("routes only authorized buyers and projects the completed sale to Inbox", async () => {
    const service = makeService();
    const app = buildApp(service);

    const products = await app.inject({ method: "GET", url: "/api/seller/products" });
    expect(products.statusCode).toBe(200);
    expect(products.json<{ products: Array<{ id: string; sourceCoverage: number }> }>().products)
      .toEqual([expect.objectContaining({ id: "NB-401", sourceCoverage: 58 })]);

    const created = await app.inject({ method: "POST", url: "/api/seller/products/NB-401/activate" });
    expect(created.statusCode).toBe(202);
    const { transactionId } = created.json<{ transactionId: string }>();
    const snapshot = await waitForCompletion(service, transactionId);

    expect(snapshot.status).toBe("completed");
    expect(snapshot.kind).toBe("active-sales-demo");
    expect(snapshot.chainValid).toBe(true);
    expect(snapshot.events).toHaveLength(10);
    expect(snapshot.events[0]?.type).toBe("active-sale.product.ingested");
    expect(snapshot.events.at(-1)?.type).toBe("active-sale.completed");

    const routed = snapshot.events.filter((event) => event.type === "active-sale.proposal.routed");
    expect(routed.map((event) => event.payload.buyerId)).toEqual(["mia", "daycare"]);
    const blocked = snapshot.events.find((event) => event.type === "active-sale.proposal.blocked");
    expect(blocked?.payload).toMatchObject({ buyerId: "noah", consent: "closed", exposedFieldCount: 0 });
    const completed = snapshot.events.at(-1);
    expect(completed?.payload).toMatchObject({ amountUsd: 164, autoApproved: true, humanClicks: 0 });

    const inbox = await app.inject({ method: "GET", url: "/api/inbox" });
    const message = inbox.json<{ messages: Array<{ transactionId?: string; runtime: string; source: string }> }>().messages
      .find((item) => item.transactionId === transactionId);
    expect(message).toMatchObject({ runtime: "live", source: "seller-agent" });

    await app.close();
  });

  it("uses the injected LLM for passport and authorized proposal copy", async () => {
    const llm: ActiveSalesLlmAgent = {
      async buildPassport() {
        return {
          features: ["材料", "凭证", "配送", "退货", "库存"], summary: "LLM 商品摘要",
          passport: { material: "TENCEL 68%", evidence: "DEMO-ID", delivery: "72h", returns: "30d" },
        };
      },
      async writeProposal(_product, buyer) { return `LLM proposal for ${buyer.id}`; },
    };
    const service = makeService(llm);
    const app = buildApp(service);
    const created = await app.inject({ method: "POST", url: "/api/seller/products/NB-401/activate" });
    const snapshot = await waitForCompletion(service, created.json<{ transactionId: string }>().transactionId);

    const passport = snapshot.events.find((event) => event.type === "active-sale.passport.published");
    expect(passport?.payload).toMatchObject({ generatedBy: "llm", summary: "LLM 商品摘要" });
    const proposals = snapshot.events.filter((event) => event.type === "active-sale.proposal.routed");
    expect(proposals).toHaveLength(2);
    expect(proposals.every((event) => event.payload.generatedBy === "llm")).toBe(true);

    await app.close();
  });

  it("returns 404 for an unknown catalog product", async () => {
    const app = buildApp(makeService());
    const response = await app.inject({ method: "POST", url: "/api/seller/products/UNKNOWN/activate" });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

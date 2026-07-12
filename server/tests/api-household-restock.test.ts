import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { TransactionService } from "../src/app/transaction-service.js";
import { createFallbackDecision } from "../src/agents/counter-negotiator.js";
import { createFallbackProposal } from "../src/agents/proposal-generator.js";
import { buildApp } from "../src/server/app.js";

const services: TransactionService[] = [];
afterEach(() => { for (const service of services.splice(0)) service.close(); });

describe("household restock demo API", () => {
  it("autonomously completes without a human approval event", async () => {
    const service = new TransactionService({
      databaseFilename: ":memory:",
      proposalGenerator: { async generate(profile, request) { return createFallbackProposal(profile, request); } },
      counterNegotiator: { async negotiate(profile, request, offer) { return createFallbackDecision(profile, request, offer); } },
    });
    services.push(service);
    const app = buildApp(service);
    const inboxUpdates: string[] = [];
    const unsubscribeInbox = service.subscribeInbox((update) => inboxUpdates.push(update.message.id));
    const initialInbox = await app.inject({ method: "GET", url: "/api/inbox" });
    expect(initialInbox.statusCode).toBe(200);
    expect(initialInbox.json<{ messages: unknown[] }>().messages).toHaveLength(3);
    const initialServices = await app.inject({ method: "GET", url: "/api/active-services" });
    expect(initialServices.statusCode).toBe(200);
    expect(initialServices.json<{ services: Array<{ id: string; runtime: string; status: string }> }>().services).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "household-restock", runtime: "live", status: "monitoring" })]),
    );

    const created = await app.inject({ method: "POST", url: "/api/active-services/household-restock/trigger" });
    expect(created.statusCode).toBe(202);
    const { transactionId } = created.json<{ transactionId: string }>();

    let snapshot;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      snapshot = service.get(transactionId);
      if (snapshot?.status === "completed") break;
      await delay(5);
    }
    expect(snapshot?.status).toBe("completed");
    expect(snapshot?.chainValid).toBe(true);
    expect(snapshot?.events[0]?.type).toBe("restock.time.advanced");
    expect(snapshot?.events.at(-1)?.type).toBe("restock.notification.sent");
    expect(snapshot?.events.find((event) => event.type === "restock.order.authorized")?.payload).toMatchObject({
      autoApproved: true,
      humanInteractions: 0,
    });
    expect(snapshot?.events.some((event) => event.type === "laptop.approval.requested")).toBe(false);

    const inbox = await app.inject({ method: "GET", url: "/api/inbox" });
    const liveMessage = inbox.json<{ messages: Array<{ id: string; runtime: string; transactionId?: string; valueScore: number }> }>().messages
      .find((message) => message.transactionId === transactionId);
    expect(liveMessage).toMatchObject({ runtime: "live", transactionId, valueScore: 100 });
    expect(inboxUpdates).toContain(`inbox-restock-${transactionId}`);

    const memory = await app.inject({
      method: "POST", url: `/api/inbox/${liveMessage!.id}/memory`, payload: { recommended: false },
    });
    expect(memory.statusCode).toBe(200);
    expect(memory.json<{ memoryRecommended: boolean }>().memoryRecommended).toBe(false);
    const archive = await app.inject({ method: "POST", url: `/api/inbox/${liveMessage!.id}/archive` });
    expect(archive.statusCode).toBe(200);
    expect(archive.json<{ status: string }>().status).toBe("archived");

    const completedServices = await app.inject({ method: "GET", url: "/api/active-services" });
    expect(completedServices.json<{ services: Array<{ id: string; status: string; transactionId?: string }> }>().services).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "household-restock", status: "completed", transactionId })]),
    );

    unsubscribeInbox();
    await app.close();
  });
});

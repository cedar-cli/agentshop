import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { TransactionService } from "../src/app/transaction-service.js";
import { createFallbackProposal } from "../src/agents/proposal-generator.js";
import { buildApp } from "../src/server/app.js";

// 每个用例起一套 service，用后统一关闭，避免句柄泄漏
const services: TransactionService[] = [];

afterEach(() => {
  for (const service of services.splice(0)) service.close();
});

/** 构造一套 stepDelayMs=0（不真实等待）的 service，供演示 Demo 测试使用。 */
function makeService(): TransactionService {
  const service = new TransactionService({
    databaseFilename: ":memory:",
    proposalGenerator: {
      async generate(profile, request) {
        return createFallbackProposal(profile, request);
      },
    },
    // 测试必须用 0，绝不真实等待
    newbornBeddingStepDelayMs: 0,
  });
  services.push(service);
  return service;
}

// 任务三锁定的 18 事件顺序
const EXPECTED_TYPES = [
  "intent.published",
  "seller.matched",
  "seller.matched",
  "seller.matched",
  "seller.score.updated",
  "seller.score.updated",
  "seller.score.updated",
  "evidence.requested",
  "evidence.requested",
  "evidence.requested",
  "evidence.submitted",
  "evidence.submitted",
  "evidence.submitted",
  "seller.score.updated",
  "seller.score.updated",
  "seller.score.updated",
  "order.authorized",
  "receipt.issued",
];

interface DemoSnapshot {
  status: string;
  kind: string;
  chainValid: boolean;
  events: Array<{
    type: string;
    sequence: number;
    payload: Record<string, unknown>;
  }>;
}

/** 轮询直到该交易 completed（或超时），返回其快照。 */
async function waitForCompletion(
  app: ReturnType<typeof buildApp>,
  transactionId: string,
): Promise<DemoSnapshot> {
  let snapshot: DemoSnapshot | undefined;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/api/transactions/${transactionId}`,
    });
    snapshot = response.json<DemoSnapshot>();
    if (snapshot.status === "completed" || snapshot.status === "failed") break;
    await delay(5);
  }
  if (!snapshot) throw new Error("no snapshot");
  return snapshot;
}

describe("newborn bedding demo API · scenario endpoint", () => {
  it("GET /api/demo/newborn-bedding returns fresh intent and sellers", async () => {
    const app = buildApp(makeService());

    const response = await app.inject({
      method: "GET",
      url: "/api/demo/newborn-bedding",
    });
    expect(response.statusCode).toBe(200);

    const body = response.json<{
      intent: { budgetUsd: number; deadlineHours: number };
      sellers: Array<{ sellerId: string; finalPriceUsd: number }>;
    }>();

    expect(body.intent.budgetUsd).toBe(180);
    expect(body.intent.deadlineHours).toBe(72);
    expect(body.sellers.map((seller) => seller.sellerId)).toEqual([
      "seller-a",
      "seller-b",
      "seller-c",
    ]);
    const sellerC = body.sellers.find((seller) => seller.sellerId === "seller-c");
    expect(sellerC?.finalPriceUsd).toBe(164);

    await app.close();
  });

  it("does not leak internal mutable references between two GET calls", async () => {
    const app = buildApp(makeService());

    const first = await app.inject({
      method: "GET",
      url: "/api/demo/newborn-bedding",
    });
    // 篡改第一次响应体不应影响第二次（每次都是全新深构造）
    const mutated = first.json<{ intent: { budgetUsd: number } }>();
    mutated.intent.budgetUsd = 999;

    const second = await app.inject({
      method: "GET",
      url: "/api/demo/newborn-bedding",
    });
    expect(second.json<{ intent: { budgetUsd: number } }>().intent.budgetUsd).toBe(
      180,
    );

    await app.close();
  });
});

describe("newborn bedding demo API · run lifecycle", () => {
  it("POST /api/demo/newborn-bedding starts a demo and returns 202 with links", async () => {
    const app = buildApp(makeService());

    const response = await app.inject({
      method: "POST",
      url: "/api/demo/newborn-bedding",
    });
    expect(response.statusCode).toBe(202);

    const body = response.json<{
      transactionId: string;
      status: string;
      transactionUrl: string;
      eventsUrl: string;
    }>();
    expect(body.status).toBe("queued");
    expect(body.transactionId).toMatch(/^tx-/);
    expect(body.transactionUrl).toBe(`/api/transactions/${body.transactionId}`);
    expect(body.eventsUrl).toBe(
      `/api/transactions/${body.transactionId}/events`,
    );

    // 交易 kind 为 newborn-bedding-demo
    const snapshot = await waitForCompletion(app, body.transactionId);
    expect(snapshot.kind).toBe("newborn-bedding-demo");

    await app.close();
  });

  it("completes with 18 ordered events, valid chain and Seller C authorized at 164", async () => {
    const app = buildApp(makeService());

    const created = await app.inject({
      method: "POST",
      url: "/api/demo/newborn-bedding",
    });
    const { transactionId } = created.json<{ transactionId: string }>();

    const snapshot = await waitForCompletion(app, transactionId);

    expect(snapshot.status).toBe("completed");
    expect(snapshot.chainValid).toBe(true);
    expect(snapshot.events).toHaveLength(18);
    expect(snapshot.events.map((event) => event.type)).toEqual(EXPECTED_TYPES);

    // 最后一条是 receipt.issued
    const last = snapshot.events[snapshot.events.length - 1];
    expect(last?.type).toBe("receipt.issued");

    // Seller C 成交、金额 164
    const authorized = snapshot.events.find(
      (event) => event.type === "order.authorized",
    );
    expect(authorized?.payload.sellerId).toBe("seller-c");
    expect(authorized?.payload.authorizedAmountUsd).toBe(164);

    const receipt = snapshot.events.find(
      (event) => event.type === "receipt.issued",
    );
    expect(receipt?.payload.sellerId).toBe("seller-c");
    expect(receipt?.payload.amountUsd).toBe(164);

    await app.close();
  });

  it("lists the demo transaction with correct kind and eventCount 18", async () => {
    const app = buildApp(makeService());

    const created = await app.inject({
      method: "POST",
      url: "/api/demo/newborn-bedding",
    });
    const { transactionId } = created.json<{ transactionId: string }>();
    await waitForCompletion(app, transactionId);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/transactions",
    });
    expect(listResponse.statusCode).toBe(200);
    const transactions = listResponse.json<{
      transactions: Array<{ id: string; kind: string; eventCount: number }>;
    }>().transactions;

    const demo = transactions.find((item) => item.id === transactionId);
    expect(demo).toBeDefined();
    expect(demo?.kind).toBe("newborn-bedding-demo");
    expect(demo?.eventCount).toBe(18);

    await app.close();
  });

  it("runs two demos with distinct ids and no cross-contamination", async () => {
    const app = buildApp(makeService());

    const first = (
      await app.inject({ method: "POST", url: "/api/demo/newborn-bedding" })
    ).json<{ transactionId: string }>();
    const second = (
      await app.inject({ method: "POST", url: "/api/demo/newborn-bedding" })
    ).json<{ transactionId: string }>();

    expect(first.transactionId).not.toBe(second.transactionId);

    const snapshotOne = await waitForCompletion(app, first.transactionId);
    const snapshotTwo = await waitForCompletion(app, second.transactionId);

    expect(snapshotOne.events).toHaveLength(18);
    expect(snapshotTwo.events).toHaveLength(18);
    expect(snapshotOne.events.map((e) => e.type)).toEqual(EXPECTED_TYPES);
    expect(snapshotTwo.events.map((e) => e.type)).toEqual(EXPECTED_TYPES);
    // 两笔交易各自独立
    expect(snapshotOne.chainValid).toBe(true);
    expect(snapshotTwo.chainValid).toBe(true);

    await app.close();
  });
});

describe("newborn bedding demo API · SSE replay", () => {
  it("replays stored events over text/event-stream without duplicate sequences", async () => {
    const app = buildApp(makeService());
    // 真实监听一个临时端口，用 fetch 读取 SSE 流；读满 18 条即主动关闭，绝不永久挂起
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind test server");
    }
    const base = `http://127.0.0.1:${address.port}`;

    try {
      // 先跑完 Demo，使 18 条事件全部落库，随后晚连 SSE 应能完整回放
      const created = await app.inject({
        method: "POST",
        url: "/api/demo/newborn-bedding",
      });
      const { transactionId } = created.json<{ transactionId: string }>();
      await waitForCompletion(app, transactionId);

      const controller = new AbortController();
      const response = await fetch(
        `${base}/api/transactions/${transactionId}/events`,
        { headers: { accept: "text/event-stream" }, signal: controller.signal },
      );

      // 响应类型必须是 text/event-stream
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );

      const reader = response.body?.getReader();
      if (!reader) throw new Error("no SSE body");
      const decoder = new TextDecoder();

      const seenSequences: number[] = [];
      const seenTypes: string[] = [];
      let buffer = "";

      // 读取直到集齐 18 条事件（或读到 receipt.issued）再主动中断
      // 设读取次数上限，防御性避免任何理论上的挂起
      for (let chunk = 0; chunk < 200; chunk += 1) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 以空行分隔事件块，逐块解析 data: 行
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const dataLine = block
            .split("\n")
            .find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const json = dataLine.slice("data:".length).trim();
          const event = JSON.parse(json) as {
            sequence: number;
            type: string;
            hash: string;
            previousHash: string;
          };
          seenSequences.push(event.sequence);
          seenTypes.push(event.type);
          // 每条事件都带 sequence/type/payload/hash/previousHash
          expect(typeof event.hash).toBe("string");
          expect(typeof event.previousHash).toBe("string");
        }
        if (seenTypes.includes("receipt.issued")) break;
      }

      // 主动关闭连接（cancel + abort），不永久挂起
      await reader.cancel();
      controller.abort();

      // 回放到全部 18 条，且 sequence 无重复，最后一条是 receipt.issued
      expect(seenTypes).toEqual(EXPECTED_TYPES);
      expect(new Set(seenSequences).size).toBe(seenSequences.length);
      expect(seenTypes[seenTypes.length - 1]).toBe("receipt.issued");
    } finally {
      await app.close();
    }
  });
});

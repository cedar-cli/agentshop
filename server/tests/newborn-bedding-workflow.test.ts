import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../src/protocol/events.js";
import { EventRouter } from "../src/router/event-router.js";
import type { StoredEvent } from "../src/store/event-store.js";
import { EventStore } from "../src/store/event-store.js";
import { createNewbornBeddingScenario } from "../src/scenario/newborn-bedding.js";
import {
  computeEvidenceSnapshotHash,
  registerNewbornBeddingWorkflow,
  runNewbornBeddingWorkflow,
  WORKFLOW_ACTORS,
} from "../src/scenario/newborn-bedding-workflow.js";

// 固定时间源，保证 issuedAt 确定性
const FIXED_NOW = () => new Date("2026-07-11T10:00:00Z");

/** 起一套内存 store + router + 已注册的工作流，返回三者。 */
function setup() {
  const store = new EventStore(":memory:");
  const router = new EventRouter(store);
  registerNewbornBeddingWorkflow(router, { now: FIXED_NOW });
  return { store, router };
}

/** 运行一笔交易并返回其全部事件（0 延迟）。 */
async function runOnce(transactionId: string): Promise<StoredEvent[]> {
  const { store, router } = setup();
  await runNewbornBeddingWorkflow(router, transactionId, {
    stepDelayMs: 0,
    now: FIXED_NOW,
  });
  const events = store.list(transactionId);
  store.close();
  return events;
}

// 期望的 18 个事件类型顺序
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

describe("newborn bedding A2A workflow · event chain", () => {
  it("produces exactly the 18 expected events in strict order", async () => {
    const events = await runOnce("tx-chain");
    expect(events).toHaveLength(18);
    expect(events.map((event) => event.type)).toEqual(EXPECTED_TYPES);
  });

  it("applies the configured delay between all 18 events", async () => {
    const { store, router } = setup();
    const delays: number[] = [];
    await runNewbornBeddingWorkflow(router, "tx-paced", {
      stepDelayMs: 25,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    expect(store.list("tx-paced")).toHaveLength(18);
    expect(delays).toEqual(Array.from({ length: 17 }, () => 25));
    store.close();
  });

  it("matches, requests, submits and scores all three sellers", async () => {
    const events = await runOnce("tx-coverage");
    const sellers = ["seller-a", "seller-b", "seller-c"];

    for (const type of [
      "seller.matched",
      "evidence.requested",
      "evidence.submitted",
    ] as const) {
      const targets = events
        .filter((event) => event.type === type)
        .map((event) =>
          type === "evidence.submitted"
            ? // 提交事件的 sellerId 在 payload 内
              (event.payload as { sellerId: string }).sellerId
            : event.target,
        );
      expect(new Set(targets)).toEqual(new Set(sellers));
    }

    // 每家都有验证前 + 验证后两条评分，共 6 条 score.updated
    const scoreEvents = events.filter(
      (event) => event.type === "seller.score.updated",
    );
    expect(scoreEvents).toHaveLength(6);
    // 验证前评分由 buyer 发布，验证后由 evaluator 发布，各 3 条
    const preScores = scoreEvents.filter(
      (event) => event.source === WORKFLOW_ACTORS.buyer,
    );
    const postScores = scoreEvents.filter(
      (event) => event.source === WORKFLOW_ACTORS.evaluator,
    );
    expect(preScores).toHaveLength(3);
    expect(postScores).toHaveLength(3);
  });
});

describe("newborn bedding A2A workflow · evidence protocol", () => {
  it("keeps every credential structured and typed to its requirement", async () => {
    const events = await runOnce("tx-evidence");
    const submissions = events.filter(
      (event) => event.type === "evidence.submitted",
    );

    // 组装 requirementId → kind 的映射，用于逐张凭证校对
    const intentEvent = events.find(
      (event) => event.type === "intent.published",
    );
    if (intentEvent?.type !== "intent.published") {
      throw new Error("missing intent.published");
    }
    const kindByRequirement = new Map(
      intentEvent.payload.evidenceRequirements.map((requirement) => [
        requirement.id,
        requirement.kind,
      ]),
    );

    for (const submission of submissions) {
      if (submission.type !== "evidence.submitted") continue;
      for (const document of submission.payload.documents) {
        // 每张证据都必须携带结构化 credential（不拼进 title）
        expect(document.credential).toBeDefined();
        const credential = document.credential;
        if (!credential) continue;
        // 凭证类型与其 requirement 的 kind 一致
        expect(credential.type).toBe(
          kindByRequirement.get(document.requirementId),
        );
        // 六要素 + demo 标记齐备
        expect(credential.issuer).toBeTruthy();
        expect(credential.referenceId).toBeTruthy();
        expect(credential.hash).toBeTruthy();
        expect(credential.validFrom).toBeTruthy();
        expect(credential.validUntil).toBeTruthy();
        expect(credential.verificationStatus).toBe("demo-verifiable");
        expect(credential.isDemoCredential).toBe(true);
        expect(credential.disclaimer).toBeTruthy();
        // contentHash 与凭证 hash 一致，回执快照才可复算
        expect(document.contentHash).toBe(credential.hash);
      }
    }
  });

  it("makes sellers answer the evidence questions differently per scenario facts", async () => {
    const events = await runOnce("tx-answers");
    const answersBySeller = new Map<string, Record<string, string>>();
    for (const event of events) {
      if (event.type !== "evidence.submitted") continue;
      answersBySeller.set(event.payload.sellerId, event.payload.answers);
    }

    const a = answersBySeller.get("seller-a");
    const b = answersBySeller.get("seller-b");
    const c = answersBySeller.get("seller-c");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();

    // 72h 覆盖问题：A(48h) true、B(120h) false、C(72h) true
    expect(a?.["q-delivery-72h"]).toBe("true");
    expect(b?.["q-delivery-72h"]).toBe("false");
    expect(c?.["q-delivery-72h"]).toBe("true");
    // bundle 问题：只有 C 为 true
    expect(a?.["q-bundle-offer"]).toBe("false");
    expect(c?.["q-bundle-offer"]).toMatch(/^true/);
    // 三家答案不完全相同
    expect(
      new Set([JSON.stringify(a), JSON.stringify(b), JSON.stringify(c)]).size,
    ).toBe(3);
    // 覆盖全部 5 个问题
    for (const answers of [a, b, c]) {
      expect(Object.keys(answers ?? {}).sort()).toEqual([
        "q-bundle-offer",
        "q-delivery-72h",
        "q-hypoallergenic-proof",
        "q-price-premium",
        "q-return-policy",
      ]);
    }
  });
});

describe("newborn bedding A2A workflow · auto purchase outcome", () => {
  it("rejects A and B, authorizes C at 164 with a compliant score", async () => {
    const events = await runOnce("tx-outcome");

    const authorized = events.find(
      (event) => event.type === "order.authorized",
    );
    if (authorized?.type !== "order.authorized") {
      throw new Error("missing order.authorized");
    }
    // 赢家是 Seller C
    expect(authorized.payload.sellerId).toBe("seller-c");
    expect(authorized.payload.authorizedAmountUsd).toBe(164);
    expect(authorized.payload.autoApproved).toBe(true);
    expect(authorized.payload.scoreSnapshot.stage).toBe("authorized");

    // 验证后评分中，A、B 均为 rejected（分别因证据不足、交期超限）
    const postScores = events.filter(
      (event) =>
        event.type === "seller.score.updated" &&
        event.source === WORKFLOW_ACTORS.evaluator,
    );
    const stageBySeller = new Map(
      postScores.map((event) => {
        if (event.type !== "seller.score.updated") {
          throw new Error("unexpected event type");
        }
        return [event.payload.sellerId, event.payload.stage];
      }),
    );
    expect(stageBySeller.get("seller-a")).toBe("rejected");
    expect(stageBySeller.get("seller-b")).toBe("rejected");
    expect(stageBySeller.get("seller-c")).toBe("authorized");
  });

  it("issues a receipt for C with a recomputable evidence snapshot hash", async () => {
    const events = await runOnce("tx-receipt");
    const receipt = events.find((event) => event.type === "receipt.issued");
    if (receipt?.type !== "receipt.issued") {
      throw new Error("missing receipt.issued");
    }

    expect(receipt.payload.sellerId).toBe("seller-c");
    expect(receipt.payload.amountUsd).toBe(164);
    expect(receipt.payload.deliveryHours).toBe(72);
    // issuedAt 是合法 ISO 时间
    expect(() =>
      new Date(receipt.payload.issuedAt).toISOString(),
    ).not.toThrow();
    expect(new Date(receipt.payload.issuedAt).toISOString()).toBe(
      receipt.payload.issuedAt,
    );

    // 快照哈希必须从本次事件链中 Seller C 的实际提交独立复算
    const sellerCSubmission = events.find(
      (event) =>
        event.type === "evidence.submitted" &&
        event.payload.sellerId === "seller-c",
    );
    if (sellerCSubmission?.type !== "evidence.submitted") {
      throw new Error("missing Seller C evidence submission");
    }
    const expectedHash = computeEvidenceSnapshotHash(
      sellerCSubmission.payload.documents,
    );
    expect(receipt.payload.evidenceSnapshotHash).toBe(expectedHash);
    // 且确实是 64 位十六进制 SHA-256，而非占位串
    expect(receipt.payload.evidenceSnapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("newborn bedding A2A workflow · integrity", () => {
  it("keeps a valid hash chain", async () => {
    const { store, router } = setup();
    await runNewbornBeddingWorkflow(router, "tx-hash", { now: FIXED_NOW });
    expect(store.verify("tx-hash")).toBe(true);
    store.close();
  });

  it("links causationId to sensible upstream events", async () => {
    const events = await runOnce("tx-causation");
    const byIndex = (index: number): StoredEvent => {
      const event = events[index];
      if (!event) throw new Error(`missing event at ${index}`);
      return event;
    };

    const intent = byIndex(0);
    // 首个事件无 causationId
    expect(intent.causationId).toBeUndefined();
    // 三个匹配事件均因意图而生
    for (const matched of events.filter((e) => e.type === "seller.matched")) {
      expect(matched.causationId).toBe(intent.id);
    }
    // 授权 → 回执的因果直接相连
    const authorized = events.find((e) => e.type === "order.authorized");
    const receipt = events.find((e) => e.type === "receipt.issued");
    expect(receipt?.causationId).toBe(authorized?.id);

    // 每个提交都因某个发给同一卖家的证据请求而生
    const requests = events.filter((e) => e.type === "evidence.requested");
    for (const submission of events.filter(
      (e) => e.type === "evidence.submitted",
    )) {
      if (submission.type !== "evidence.submitted") continue;
      const cause = requests.find((r) => r.id === submission.causationId);
      expect(cause).toBeDefined();
      expect(cause?.target).toBe(submission.payload.sellerId);
    }

    const matchedBySeller = new Map(
      events
        .filter((event) => event.type === "seller.matched")
        .map((event) => [event.payload.sellerId, event.id]),
    );
    const submissionBySeller = new Map(
      events
        .filter((event) => event.type === "evidence.submitted")
        .map((event) => [event.payload.sellerId, event.id]),
    );
    for (const event of events) {
      if (
        (event.type === "evidence.requested" ||
          event.type === "seller.score.updated") &&
        event.source === WORKFLOW_ACTORS.buyer
      ) {
        expect(event.causationId).toBe(
          matchedBySeller.get(event.payload.sellerId),
        );
      }
      if (
        event.type === "seller.score.updated" &&
        event.source === WORKFLOW_ACTORS.evaluator
      ) {
        expect(event.causationId).toBe(
          submissionBySeller.get(event.payload.sellerId),
        );
      }
    }
  });
});

describe("newborn bedding A2A workflow · rejection paths", () => {
  it("does not derive scores or authorization from unsolicited empty submissions", async () => {
    const { store, router } = setup();
    for (const sellerId of ["seller-a", "seller-b", "seller-c"]) {
      await router.publish({
        transactionId: "tx-forged",
        type: "evidence.submitted",
        source: sellerId,
        payload: {
          sellerId,
          intentId: "intent-newborn-bedding",
          documents: [],
          answers: {},
          // 协议要求携带生成来源标记；伪造提交按规则兜底标注，断言（不派生评分/授权）不变
          generatedBy: "fallback",
        },
      });
    }

    expect(store.list("tx-forged").map((event) => event.type)).toEqual([
      "evidence.submitted",
      "evidence.submitted",
      "evidence.submitted",
    ]);
    store.close();
  });

  it("rejects Seller C when its actual submission lacks mandatory evidence", async () => {
    const scenario = createNewbornBeddingScenario();
    const sellerC = scenario.sellers.find(
      (seller) => seller.sellerId === "seller-c",
    );
    if (!sellerC) throw new Error("missing Seller C scenario");
    sellerC.credentials = [];

    const store = new EventStore(":memory:");
    const router = new EventRouter(store);
    registerNewbornBeddingWorkflow(router, { scenario, now: FIXED_NOW });
    await runNewbornBeddingWorkflow(router, "tx-missing-evidence");

    const events = store.list("tx-missing-evidence");
    const sellerCScore = events.find(
      (event) =>
        event.type === "seller.score.updated" &&
        event.source === WORKFLOW_ACTORS.evaluator &&
        event.payload.sellerId === "seller-c",
    );
    expect(sellerCScore?.type).toBe("seller.score.updated");
    if (sellerCScore?.type === "seller.score.updated") {
      expect(sellerCScore.payload.stage).toBe("rejected");
    }
    expect(events.some((event) => event.type === "order.authorized")).toBe(
      false,
    );
    expect(events.some((event) => event.type === "receipt.issued")).toBe(false);
    store.close();
  });

  it("does not authorize when automatic purchasing is disabled", async () => {
    const scenario = createNewbornBeddingScenario();
    scenario.intent.autoPurchasePolicy.enabled = false;
    const store = new EventStore(":memory:");
    const router = new EventRouter(store);
    registerNewbornBeddingWorkflow(router, { scenario, now: FIXED_NOW });
    await runNewbornBeddingWorkflow(router, "tx-manual-only");

    const events = store.list("tx-manual-only");
    expect(events.some((event) => event.type === "order.authorized")).toBe(
      false,
    );
    expect(events.some((event) => event.type === "receipt.issued")).toBe(false);
    store.close();
  });
});

describe("newborn bedding A2A workflow · transaction isolation", () => {
  it("does not leak state across two sequential transactions on one router", async () => {
    const { store, router } = setup();
    await runNewbornBeddingWorkflow(router, "tx-seq-1", { now: FIXED_NOW });
    await runNewbornBeddingWorkflow(router, "tx-seq-2", { now: FIXED_NOW });

    expect(store.list("tx-seq-1")).toHaveLength(18);
    expect(store.list("tx-seq-2")).toHaveLength(18);
    expect(store.verify("tx-seq-1")).toBe(true);
    expect(store.verify("tx-seq-2")).toBe(true);
    store.close();
  });

  it("does not cross state when two transactions run concurrently on one router", async () => {
    const { store, router } = setup();
    await Promise.all([
      runNewbornBeddingWorkflow(router, "tx-par-1", { now: FIXED_NOW }),
      runNewbornBeddingWorkflow(router, "tx-par-2", { now: FIXED_NOW }),
    ]);

    const one = store.list("tx-par-1");
    const two = store.list("tx-par-2");
    expect(one).toHaveLength(18);
    expect(two).toHaveLength(18);
    // 每笔交易的事件只属于自己，绝不串单
    expect(
      one.every((event: AgentEvent) => event.transactionId === "tx-par-1"),
    ).toBe(true);
    expect(
      two.every((event: AgentEvent) => event.transactionId === "tx-par-2"),
    ).toBe(true);
    // 两笔交易的类型序列各自都是完整 18 事件链
    expect(one.map((e) => e.type)).toEqual(EXPECTED_TYPES);
    expect(two.map((e) => e.type)).toEqual(EXPECTED_TYPES);
    expect(store.verify("tx-par-1")).toBe(true);
    expect(store.verify("tx-par-2")).toBe(true);
    store.close();
  });
});

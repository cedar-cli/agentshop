/**
 * demo-state 纯函数单元测试
 *
 * 用**手工构造的事件序列**驱动纯函数，验证：
 *  - 四幕与关键事件的映射
 *  - 事件按 id/sequence 去重
 *  - Seller C 排名从 #3 翻转到 #1
 *  - Seller A/B 验证后 rejected
 *  - 回执只在 receipt.issued 后存在
 *
 * 事件数值对齐后端 src/scenario/newborn-bedding.ts 的场景锚点（不重复其业务逻辑，
 * 只在测试里构造最小可用的事件形状）。
 */

import { describe, expect, it } from "vitest";
import {
  ACTORS,
  authorization,
  currentAct,
  isVerified,
  mergeEvent,
  postVerificationScore,
  preVerificationScore,
  publishedIntent,
  ranking,
  receipt,
  sellerAnswer,
} from "./demo-state";
import type {
  ExecutableIntent,
  NewbornEvent,
  SellerScoreVector,
} from "./types";

// ---------------------------------------------------------------------------
// 测试用事件构造工具
// ---------------------------------------------------------------------------

let sequence = 0;

/** 构造一条带公共字段的事件（sequence 自增，hash 用占位）。 */
function makeEvent(
  partial: Pick<NewbornEvent, "type" | "source" | "payload"> &
    Partial<Pick<NewbornEvent, "target" | "id" | "sequence">>,
): NewbornEvent {
  sequence += 1;
  const seq = partial.sequence ?? sequence;
  return {
    id: partial.id ?? `evt-${seq}`,
    transactionId: "tx-test",
    sequence: seq,
    source: partial.source,
    target: partial.target,
    timestamp: "2026-07-11T00:00:00+08:00",
    previousHash: "PREV",
    hash: `hash-${seq}`,
    type: partial.type,
    payload: partial.payload,
  } as NewbornEvent;
}

/** 最小可用意图（仅测试需要的字段）。 */
const INTENT: ExecutableIntent = {
  intentId: "intent-newborn-bedding",
  productDescription: "新生儿低敏床品",
  budgetUsd: 180,
  deadlineHours: 72,
  riskThreshold: 0.15,
  unacceptable: ["材料声明无可验证证据"],
  evidenceRequirements: [],
  autoPurchasePolicy: {
    enabled: true,
    minTotalScore: 75,
    minTrustScore: 70,
    maxAutoSpendUsd: 180,
    requireAllMandatoryEvidence: true,
  },
};

/** 构造一个评分向量。 */
function score(
  sellerId: string,
  rank: number,
  stage: SellerScoreVector["stage"],
  overrides: Partial<SellerScoreVector> = {},
): SellerScoreVector {
  return {
    sellerId,
    matchScore: 80,
    trustScore: 85,
    deliveryConfidence: 88,
    priceFit: 80,
    riskScore: 0.1,
    totalScore: 82,
    rank,
    stage,
    ...overrides,
  };
}

// intent.published
const intentEvent = () =>
  makeEvent({ type: "intent.published", source: ACTORS.buyer, payload: INTENT });

// seller.matched（A/B/C）
const matchedEvent = (sellerId: string) =>
  makeEvent({
    type: "seller.matched",
    source: ACTORS.matcher,
    target: sellerId,
    payload: {
      intentId: INTENT.intentId,
      sellerId,
      matchScore: 80,
      reason: "matched",
    },
  });

// 验证前评分（由 buyer 发布）
const preScoreEvent = (sellerId: string, rank: number) =>
  makeEvent({
    type: "seller.score.updated",
    source: ACTORS.buyer,
    target: sellerId,
    payload: score(sellerId, rank, "matched"),
  });

// 验证后评分（由 evaluator 发布）
const postScoreEvent = (
  sellerId: string,
  rank: number,
  stage: SellerScoreVector["stage"],
) =>
  makeEvent({
    type: "seller.score.updated",
    source: ACTORS.evaluator,
    target: sellerId,
    payload: score(sellerId, rank, stage),
  });

// evidence.requested
const requestedEvent = (sellerId: string) =>
  makeEvent({
    type: "evidence.requested",
    source: ACTORS.buyer,
    target: sellerId,
    payload: {
      intentId: INTENT.intentId,
      sellerId,
      requirements: [],
      questions: [
        { id: "q-bundle-offer", prompt: "是否能提供 bundle 优惠？", expectedAnswer: "boolean" },
      ],
    },
  });

// evidence.submitted
const submittedEvent = (sellerId: string, answers: Record<string, string>) =>
  makeEvent({
    type: "evidence.submitted",
    source: `seller-agent-${sellerId}`,
    target: ACTORS.evaluator,
    payload: {
      sellerId,
      intentId: INTENT.intentId,
      documents: [],
      answers,
    },
  });

// order.authorized
const authorizedEvent = (sellerId: string, amountUsd: number) =>
  makeEvent({
    type: "order.authorized",
    source: ACTORS.autoPurchase,
    target: sellerId,
    payload: {
      intentId: INTENT.intentId,
      sellerId,
      authorizedAmountUsd: amountUsd,
      scoreSnapshot: score(sellerId, 1, "authorized"),
      autoApproved: true,
    },
  });

// receipt.issued
const receiptEvent = (sellerId: string, amountUsd: number) =>
  makeEvent({
    type: "receipt.issued",
    source: ACTORS.receiptIssuer,
    target: sellerId,
    payload: {
      receiptId: `receipt-tx-test-${sellerId}`,
      intentId: INTENT.intentId,
      sellerId,
      amountUsd,
      deliveryHours: 72,
      evidenceSnapshotHash: "snapshot-hash",
      issuedAt: "2026-07-11T00:00:10+08:00",
    },
  });

/**
 * 构造一整条 18 事件的完整链（顺序与后端一致），供整体断言复用。
 * 数值锚点：C 验证后 rank1 authorized、A/B 验证后 rejected，回执金额 164。
 */
function fullChain(): NewbornEvent[] {
  return [
    intentEvent(),
    matchedEvent("seller-a"),
    matchedEvent("seller-b"),
    matchedEvent("seller-c"),
    preScoreEvent("seller-a", 1),
    preScoreEvent("seller-b", 2),
    preScoreEvent("seller-c", 3),
    requestedEvent("seller-a"),
    requestedEvent("seller-b"),
    requestedEvent("seller-c"),
    submittedEvent("seller-a", { "q-bundle-offer": "false" }),
    submittedEvent("seller-b", { "q-bundle-offer": "false" }),
    submittedEvent("seller-c", { "q-bundle-offer": "true（bundle 后最终价 164 USD）" }),
    postScoreEvent("seller-a", 3, "rejected"),
    postScoreEvent("seller-b", 2, "rejected"),
    postScoreEvent("seller-c", 1, "authorized"),
    authorizedEvent("seller-c", 164),
    receiptEvent("seller-c", 164),
  ];
}

// ---------------------------------------------------------------------------
// 四幕映射
// ---------------------------------------------------------------------------

describe("currentAct · 四幕由真实事件推导", () => {
  it("无事件时为第 0 幕（尚未发布）", () => {
    expect(currentAct([])).toBe(0);
  });

  it("intent.published 进入第一幕", () => {
    expect(currentAct([intentEvent()])).toBe(1);
  });

  it("seller.matched / 验证前评分进入第二幕", () => {
    expect(currentAct([intentEvent(), matchedEvent("seller-a")])).toBe(2);
    expect(
      currentAct([intentEvent(), preScoreEvent("seller-a", 1)]),
    ).toBe(2);
  });

  it("evidence.submitted / 验证后评分进入第三幕", () => {
    expect(
      currentAct([
        intentEvent(),
        matchedEvent("seller-a"),
        submittedEvent("seller-a", {}),
      ]),
    ).toBe(3);
    // 仅验证后评分（evaluator 发布）也应进入第三幕
    expect(
      currentAct([
        intentEvent(),
        matchedEvent("seller-a"),
        postScoreEvent("seller-a", 3, "rejected"),
      ]),
    ).toBe(3);
  });

  it("order.authorized / receipt.issued 进入第四幕", () => {
    expect(currentAct([intentEvent(), authorizedEvent("seller-c", 164)])).toBe(4);
    expect(currentAct(fullChain())).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 意图
// ---------------------------------------------------------------------------

describe("publishedIntent", () => {
  it("发布前返回 undefined，发布后返回意图", () => {
    expect(publishedIntent([])).toBeUndefined();
    expect(publishedIntent([intentEvent()])?.budgetUsd).toBe(180);
  });
});

// ---------------------------------------------------------------------------
// 事件去重
// ---------------------------------------------------------------------------

describe("mergeEvent · 去重与排序", () => {
  it("同一 id 重复到达不会重复", () => {
    const first = intentEvent();
    const duplicateId = { ...first };
    const merged = mergeEvent(mergeEvent([], first), duplicateId);
    expect(merged).toHaveLength(1);
  });

  it("同一 sequence 重复到达不会重复", () => {
    const a = makeEvent({
      type: "seller.matched",
      source: ACTORS.matcher,
      payload: {
        intentId: INTENT.intentId,
        sellerId: "seller-a",
        matchScore: 80,
        reason: "x",
      },
      id: "id-x",
      sequence: 42,
    });
    const b = { ...a, id: "id-y" }; // 不同 id，但同 sequence
    const merged = mergeEvent(mergeEvent([], a), b);
    expect(merged).toHaveLength(1);
  });

  it("乱序到达按 sequence 升序排列", () => {
    const e1 = makeEvent({
      type: "intent.published",
      source: ACTORS.buyer,
      payload: INTENT,
      sequence: 5,
    });
    const e2 = makeEvent({
      type: "seller.matched",
      source: ACTORS.matcher,
      payload: {
        intentId: INTENT.intentId,
        sellerId: "seller-a",
        matchScore: 80,
        reason: "x",
      },
      sequence: 2,
    });
    const merged = mergeEvent(mergeEvent([], e1), e2);
    expect(merged.map((event) => event.sequence)).toEqual([2, 5]);
  });
});

// ---------------------------------------------------------------------------
// 评分与排名翻转
// ---------------------------------------------------------------------------

describe("评分区分验证前/后", () => {
  it("验证前评分只来自 buyer，验证后只来自 evaluator", () => {
    const events = [
      preScoreEvent("seller-c", 3),
      postScoreEvent("seller-c", 1, "authorized"),
    ];
    expect(preVerificationScore(events, "seller-c")?.rank).toBe(3);
    expect(postVerificationScore(events, "seller-c")?.rank).toBe(1);
    expect(isVerified(events, "seller-c")).toBe(true);
  });

  it("仅验证前评分时 isVerified 为 false", () => {
    const events = [preScoreEvent("seller-c", 3)];
    expect(isVerified(events, "seller-c")).toBe(false);
  });
});

describe("ranking · Seller C 从 #3 翻转到 #1", () => {
  it("验证前 A#1 B#2 C#3", () => {
    const events = [
      preScoreEvent("seller-a", 1),
      preScoreEvent("seller-b", 2),
      preScoreEvent("seller-c", 3),
    ];
    const order = ranking(events).map((row) => row.sellerId);
    expect(order).toEqual(["seller-a", "seller-b", "seller-c"]);
  });

  it("验证后 C#1，A/B 掉到后面且 rejected", () => {
    const rows = ranking(fullChain());
    expect(rows[0]?.sellerId).toBe("seller-c");
    expect(rows[0]?.rank).toBe(1);
    expect(rows[0]?.rejected).toBe(false);

    const a = rows.find((row) => row.sellerId === "seller-a");
    const b = rows.find((row) => row.sellerId === "seller-b");
    expect(a?.rejected).toBe(true);
    expect(b?.rejected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 谈判作答
// ---------------------------------------------------------------------------

describe("sellerAnswer · 从 evidence.submitted 读取，不写死", () => {
  it("返回 Seller C 对 bundle 问题的真实回答", () => {
    const answer = sellerAnswer(fullChain(), "seller-c", "q-bundle-offer");
    expect(answer).toContain("164");
  });

  it("未提交时返回 undefined", () => {
    expect(sellerAnswer([], "seller-c", "q-bundle-offer")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 授权与回执
// ---------------------------------------------------------------------------

describe("授权与回执", () => {
  it("授权 payload 为 Seller C，金额 164", () => {
    const auth = authorization(fullChain());
    expect(auth?.sellerId).toBe("seller-c");
    expect(auth?.authorizedAmountUsd).toBe(164);
  });

  it("回执只在 receipt.issued 到达后存在", () => {
    // 到授权为止（含 order.authorized）尚无回执
    const beforeReceipt = fullChain().slice(0, 17);
    expect(receipt(beforeReceipt)).toBeUndefined();

    // 完整链有回执，金额 164
    expect(receipt(fullChain())?.amountUsd).toBe(164);
  });
});

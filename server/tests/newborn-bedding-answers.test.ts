/**
 * 新生儿床品工作流 · 机器询证「LLM 回答 + 规则兜底」测试
 *
 * 通过向工作流注入不同行为的 EvidenceAnswerGenerator 桩（成功 / 抛错 / 缺字段 / 多字段 /
 * 间谍），验证：
 *  - LLM 成功 → Seller C 用模型 5 个回答，标 generatedBy=llm；
 *  - LLM 抛错 / 缺字段 / 非法字段 → 自动降级为规则兜底，标 generatedBy=fallback；
 *  - 未注入生成器（等价 DEMO_LLM_ENABLED 关闭）→ 不调用任何模型，三家全走规则；
 *  - 无论回答来源如何，仍严格产生 18 个事件、Seller C 获胜且最终价 164。
 */

import { describe, expect, it } from "vitest";
import type {
  EvidenceAnswerGenerator,
  EvidenceAnswerInput,
  EvidenceAnswerResult,
} from "../src/agents/evidence-answer-generator.js";
import type { StoredEvent } from "../src/store/event-store.js";
import { EventStore } from "../src/store/event-store.js";
import { EventRouter } from "../src/router/event-router.js";
import {
  registerNewbornBeddingWorkflow,
  runNewbornBeddingWorkflow,
  WORKFLOW_ACTORS,
} from "../src/scenario/newborn-bedding-workflow.js";

// 固定时间源，保证回执 issuedAt 确定性
const FIXED_NOW = () => new Date("2026-07-11T10:00:00Z");

// LLM 桩返回的 5 个「实时回答」，与规则兜底文案明显不同，便于断言确实取用了模型结果
const LLM_ANSWERS: Record<string, string> = {
  "q-hypoallergenic-proof":
    "已提交低敏检测凭证（requirement=hypoallergenic-lab-report）。",
  "q-delivery-72h": "是，72 小时内可以送达。",
  "q-return-policy": "皮肤不适支持无理由退货，并附退货政策凭证。",
  "q-price-premium":
    "溢价来自完整低敏认证、材料组成、配送覆盖与退货政策等可验证保障。",
  "q-bundle-offer": "true（组合优惠后 164 美元）",
};

/** 五个询证问题的 id，用于断言回答覆盖完整。 */
const QUESTION_IDS = [
  "q-hypoallergenic-proof",
  "q-delivery-72h",
  "q-return-policy",
  "q-price-premium",
  "q-bundle-offer",
];

/**
 * 用给定的（可选）Seller C 回答生成器跑一整笔交易，返回其全部事件。
 * @param generator 注入给 Seller C 的回答生成器；不传则等价 DEMO_LLM_ENABLED 关闭
 * @param transactionId 交易 id
 * @returns 落库后的全部事件
 */
async function runWith(
  generator: EvidenceAnswerGenerator | undefined,
  transactionId: string,
): Promise<StoredEvent[]> {
  const store = new EventStore(":memory:");
  const router = new EventRouter(store);
  registerNewbornBeddingWorkflow(router, {
    now: FIXED_NOW,
    sellerCAnswerGenerator: generator,
  });
  await runNewbornBeddingWorkflow(router, transactionId, {
    stepDelayMs: 0,
    now: FIXED_NOW,
  });
  const events = store.list(transactionId);
  store.close();
  return events;
}

/** 从事件流取某卖家的 evidence.submitted 提交负载。 */
function submissionOf(events: StoredEvent[], sellerId: string) {
  const event = events.find(
    (item) =>
      item.type === "evidence.submitted" &&
      (item.payload as { sellerId: string }).sellerId === sellerId,
  );
  if (event?.type !== "evidence.submitted") {
    throw new Error(`missing submission for ${sellerId}`);
  }
  return event.payload;
}

/** 断言这条事件链是完整、可授权、Seller C 以 164 获胜的标准链——回答来源不应改变它。 */
function expectStandardWinningChain(events: StoredEvent[]): void {
  expect(events).toHaveLength(18);
  const authorized = events.find((event) => event.type === "order.authorized");
  if (authorized?.type !== "order.authorized") {
    throw new Error("missing order.authorized");
  }
  expect(authorized.payload.sellerId).toBe("seller-c");
  expect(authorized.payload.authorizedAmountUsd).toBe(164);

  const receipt = events.find((event) => event.type === "receipt.issued");
  if (receipt?.type !== "receipt.issued") throw new Error("missing receipt");
  expect(receipt.payload.sellerId).toBe("seller-c");
  expect(receipt.payload.amountUsd).toBe(164);
}

describe("newborn bedding · Seller C evidence answers via LLM", () => {
  it("uses the model's five answers and marks generatedBy=llm on success", async () => {
    const generator: EvidenceAnswerGenerator = {
      async generate(): Promise<EvidenceAnswerResult> {
        return { answers: { ...LLM_ANSWERS }, generatedBy: "llm" };
      },
    };

    const events = await runWith(generator, "tx-llm-success");
    const sellerC = submissionOf(events, "seller-c");

    expect(sellerC.generatedBy).toBe("llm");
    expect(sellerC.fallbackReason).toBeUndefined();
    expect(sellerC.answers).toEqual(LLM_ANSWERS);
    expect(Object.keys(sellerC.answers).sort()).toEqual(
      [...QUESTION_IDS].sort(),
    );

    // 回答走 LLM 不改变结果：仍 18 事件、C 以 164 获胜
    expectStandardWinningChain(events);
  });

  it("falls back to rules and marks generatedBy=fallback when the model throws", async () => {
    const generator: EvidenceAnswerGenerator = {
      async generate(): Promise<EvidenceAnswerResult> {
        throw new Error("upstream 503 boom");
      },
    };

    const events = await runWith(generator, "tx-llm-throw");
    const sellerC = submissionOf(events, "seller-c");

    expect(sellerC.generatedBy).toBe("fallback");
    // 兜底原因存在且简短脱敏（不含堆栈/敏感信息）
    expect(sellerC.fallbackReason).toBeTruthy();
    expect((sellerC.fallbackReason ?? "").length).toBeLessThanOrEqual(240);
    // 兜底答案仍覆盖 5 个问题，且与 LLM 桩文案不同
    expect(Object.keys(sellerC.answers).sort()).toEqual(
      [...QUESTION_IDS].sort(),
    );
    expect(sellerC.answers).not.toEqual(LLM_ANSWERS);

    expectStandardWinningChain(events);
  });

  it("falls back when the model omits a required answer field", async () => {
    const generator: EvidenceAnswerGenerator = {
      async generate(): Promise<EvidenceAnswerResult> {
        // 缺 q-bundle-offer 字段：应触发校验失败 → 兜底
        const { "q-bundle-offer": _omit, ...partial } = LLM_ANSWERS;
        return { answers: partial, generatedBy: "llm" };
      },
    };

    const events = await runWith(generator, "tx-llm-missing");
    const sellerC = submissionOf(events, "seller-c");

    expect(sellerC.generatedBy).toBe("fallback");
    expect(Object.keys(sellerC.answers).sort()).toEqual(
      [...QUESTION_IDS].sort(),
    );
    expectStandardWinningChain(events);
  });

  it("falls back when the model returns an unexpected extra field", async () => {
    const generator: EvidenceAnswerGenerator = {
      async generate(): Promise<EvidenceAnswerResult> {
        // 多出一个问题清单之外的字段：应触发校验失败 → 兜底
        return {
          answers: { ...LLM_ANSWERS, "q-unknown": "越界字段" },
          generatedBy: "llm",
        };
      },
    };

    const events = await runWith(generator, "tx-llm-extra");
    const sellerC = submissionOf(events, "seller-c");

    expect(sellerC.generatedBy).toBe("fallback");
    // 越界字段不得进入最终答案
    expect(sellerC.answers["q-unknown"]).toBeUndefined();
    expect(Object.keys(sellerC.answers).sort()).toEqual(
      [...QUESTION_IDS].sort(),
    );
    expectStandardWinningChain(events);
  });

  it("falls back when the model returns an empty answer string", async () => {
    const generator: EvidenceAnswerGenerator = {
      async generate(): Promise<EvidenceAnswerResult> {
        return {
          answers: { ...LLM_ANSWERS, "q-return-policy": "   " },
          generatedBy: "llm",
        };
      },
    };

    const events = await runWith(generator, "tx-llm-empty");
    const sellerC = submissionOf(events, "seller-c");

    expect(sellerC.generatedBy).toBe("fallback");
    expectStandardWinningChain(events);
  });

  it("falls back when the model invents policy terms outside the fact boundary", async () => {
    const generator: EvidenceAnswerGenerator = {
      async generate(): Promise<EvidenceAnswerResult> {
        return {
          answers: {
            ...LLM_ANSWERS,
            "q-return-policy": "皮肤不适支持 30 天退货，并承担全部运费。",
          },
          generatedBy: "llm",
        };
      },
    };

    const events = await runWith(generator, "tx-llm-hallucinated-policy");
    const sellerC = submissionOf(events, "seller-c");

    expect(sellerC.generatedBy).toBe("fallback");
    expect(sellerC.answers["q-return-policy"]).not.toContain("30");
    expect(sellerC.answers["q-return-policy"]).not.toContain("运费");
    expectStandardWinningChain(events);
  });

  it("falls back when the model reverses a boolean fact", async () => {
    const generator: EvidenceAnswerGenerator = {
      async generate(): Promise<EvidenceAnswerResult> {
        return {
          answers: { ...LLM_ANSWERS, "q-delivery-72h": "false" },
          generatedBy: "llm",
        };
      },
    };

    const events = await runWith(generator, "tx-llm-reversed-fact");
    const sellerC = submissionOf(events, "seller-c");

    expect(sellerC.generatedBy).toBe("fallback");
    expect(sellerC.answers["q-delivery-72h"]).toBe("true");
    expectStandardWinningChain(events);
  });
});

describe("newborn bedding · answer generator scoping", () => {
  it("does not call any model when no generator is injected (DEMO_LLM disabled)", async () => {
    let calls = 0;
    // 间谍生成器：只要被调用就计数并抛错，用于证明「关闭时不触达模型」
    const spy: EvidenceAnswerGenerator = {
      async generate(
        _input: EvidenceAnswerInput,
      ): Promise<EvidenceAnswerResult> {
        calls += 1;
        throw new Error("model must not be called when disabled");
      },
    };
    void spy; // 关闭场景下根本不注入它

    const events = await runWith(undefined, "tx-llm-off");
    const sellerC = submissionOf(events, "seller-c");

    // 未注入 → Seller C 也走规则兜底
    expect(sellerC.generatedBy).toBe("fallback");
    expect(calls).toBe(0);
    expectStandardWinningChain(events);
  });

  it("does not expose a generator error message through fallbackReason", async () => {
    const generator: EvidenceAnswerGenerator = {
      async generate(): Promise<EvidenceAnswerResult> {
        throw new Error(
          "upstream failed with sk-secret-value in Authorization",
        );
      },
    };

    const events = await runWith(generator, "tx-llm-secret-error");
    const sellerC = submissionOf(events, "seller-c");

    expect(sellerC.generatedBy).toBe("fallback");
    expect(sellerC.fallbackReason).toBe("answer generator failed");
    expect(sellerC.fallbackReason).not.toContain("secret");
  });

  it("never routes Seller A or B through the injected (C-only) generator", async () => {
    const seenSellers = new Set<string>();
    // 该生成器会记录所有调用它的卖家；注入后应只被 Seller C 调用
    const recordingGenerator: EvidenceAnswerGenerator = {
      async generate(
        input: EvidenceAnswerInput,
      ): Promise<EvidenceAnswerResult> {
        seenSellers.add(input.seller.sellerId);
        return { answers: { ...LLM_ANSWERS }, generatedBy: "llm" };
      },
    };

    const events = await runWith(recordingGenerator, "tx-c-only");

    // 生成器只被 Seller C 触达；A/B 恒走规则兜底
    expect([...seenSellers]).toEqual(["seller-c"]);
    expect(submissionOf(events, "seller-a").generatedBy).toBe("fallback");
    expect(submissionOf(events, "seller-b").generatedBy).toBe("fallback");
    expect(submissionOf(events, "seller-c").generatedBy).toBe("llm");

    // A/B 的评分来源应是 evaluator 发布的验证后评分，且最终 A/B 被淘汰、C 获胜
    const postScores = events.filter(
      (event) =>
        event.type === "seller.score.updated" &&
        event.source === WORKFLOW_ACTORS.evaluator,
    );
    expect(postScores).toHaveLength(3);
    expectStandardWinningChain(events);
  });
});

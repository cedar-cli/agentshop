/**
 * EvidenceAnswerGenerator 抽象层纯函数测试
 *
 * 覆盖回答生成的「事实边界 + 校验 + 规则兜底生成器」三块纯逻辑：
 *  - buildFallbackAnswers 依场景事实推导，不同卖家不同答案，覆盖 5 个问题；
 *  - validateEvidenceAnswers 接受合法回答、拒绝缺字段/空答案/多余字段，并 trim/截断；
 *  - FallbackEvidenceAnswerGenerator 恒返回规则答案并标记 fallback。
 */

import { describe, expect, it } from "vitest";
import {
  buildFallbackAnswers,
  FallbackEvidenceAnswerGenerator,
  validateEvidenceAnswers,
} from "../src/agents/evidence-answer-generator.js";
import type { EvidenceQuestion } from "../src/protocol/events.js";
import {
  createNewbornBeddingIntent,
  createSellerA,
  createSellerC,
} from "../src/scenario/newborn-bedding.js";

// 五个询证问题（与工作流一致），供校验器测试使用
const QUESTIONS: EvidenceQuestion[] = [
  { id: "q-hypoallergenic-proof", prompt: "低敏声明的证据是什么？", expectedAnswer: "text" },
  { id: "q-delivery-72h", prompt: "72 小时配送是否覆盖？", expectedAnswer: "boolean" },
  { id: "q-return-policy", prompt: "皮肤不适如何退货？", expectedAnswer: "text" },
  { id: "q-price-premium", prompt: "为什么更贵？", expectedAnswer: "text" },
  { id: "q-bundle-offer", prompt: "是否有 bundle 优惠？", expectedAnswer: "boolean" },
];

/** 构造一份覆盖全部 5 个问题的合法回答。 */
function fullAnswers(): Record<string, string> {
  return {
    "q-hypoallergenic-proof": "有低敏检测报告",
    "q-delivery-72h": "true",
    "q-return-policy": "支持退货",
    "q-price-premium": "认证更全",
    "q-bundle-offer": "true",
  };
}

describe("buildFallbackAnswers · 依场景事实推导", () => {
  it("覆盖全部 5 个问题", () => {
    const answers = buildFallbackAnswers(
      createSellerC(),
      createNewbornBeddingIntent(),
    );
    expect(Object.keys(answers).sort()).toEqual([
      "q-bundle-offer",
      "q-delivery-72h",
      "q-hypoallergenic-proof",
      "q-price-premium",
      "q-return-policy",
    ]);
  });

  it("Seller C 交期 72h 覆盖、有 bundle；Seller A 无低敏凭证、无 bundle", () => {
    const intent = createNewbornBeddingIntent();
    const c = buildFallbackAnswers(createSellerC(), intent);
    const a = buildFallbackAnswers(createSellerA(), intent);

    // C：72h 恰好覆盖、bundle 为 true 并含最终价 164
    expect(c["q-delivery-72h"]).toBe("true");
    expect(c["q-bundle-offer"]).toMatch(/^true/);
    expect(c["q-bundle-offer"]).toContain("164");

    // A：无低敏实验室凭证，如实承认缺失；无 bundle
    expect(a["q-hypoallergenic-proof"]).toContain("暂无");
    expect(a["q-bundle-offer"]).toBe("false");

    // 两家答案不相同
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });
});

describe("validateEvidenceAnswers · 收敛 LLM 原始输出", () => {
  it("接受覆盖全部问题的合法回答", () => {
    const cleaned = validateEvidenceAnswers(fullAnswers(), QUESTIONS);
    expect(Object.keys(cleaned).sort()).toEqual(
      QUESTIONS.map((q) => q.id).sort(),
    );
  });

  it("对回答做 trim 与长度截断", () => {
    const answers = { ...fullAnswers(), "q-price-premium": `  ${"很贵".repeat(200)}  ` };
    const cleaned = validateEvidenceAnswers(answers, QUESTIONS);
    // 去除首尾空白后不超过 240
    expect(cleaned["q-price-premium"]!.length).toBeLessThanOrEqual(240);
    expect(cleaned["q-price-premium"]!.startsWith(" ")).toBe(false);
  });

  it("缺字段时抛错", () => {
    const { "q-bundle-offer": _omit, ...partial } = fullAnswers();
    expect(() => validateEvidenceAnswers(partial, QUESTIONS)).toThrow();
  });

  it("空答案时抛错", () => {
    const answers = { ...fullAnswers(), "q-return-policy": "   " };
    expect(() => validateEvidenceAnswers(answers, QUESTIONS)).toThrow();
  });

  it("含问题清单之外的多余字段时抛错", () => {
    const answers = { ...fullAnswers(), "q-unknown": "越界" };
    expect(() => validateEvidenceAnswers(answers, QUESTIONS)).toThrow();
  });

  it("拒绝事实边界之外的新期限和服务承诺", () => {
    const boundary = fullAnswers();
    const answers = {
      ...boundary,
      "q-return-policy": "支持 30 天退货并承担全部运费",
    };
    expect(() =>
      validateEvidenceAnswers(answers, QUESTIONS, boundary),
    ).toThrow();
  });

  it("拒绝与事实边界相反的 boolean 结论", () => {
    const boundary = fullAnswers();
    const answers = { ...boundary, "q-delivery-72h": "false" };
    expect(() =>
      validateEvidenceAnswers(answers, QUESTIONS, boundary),
    ).toThrow();
  });
});

describe("FallbackEvidenceAnswerGenerator", () => {
  it("恒返回规则答案并标记 fallback", async () => {
    const fallbackAnswers = fullAnswers();
    const result = await new FallbackEvidenceAnswerGenerator().generate({
      seller: createSellerC(),
      intent: createNewbornBeddingIntent(),
      questions: QUESTIONS,
      fallbackAnswers,
    });

    expect(result.generatedBy).toBe("fallback");
    expect(result.answers).toEqual(fallbackAnswers);
    // 返回的是拷贝，不泄露内部引用
    expect(result.answers).not.toBe(fallbackAnswers);
  });
});

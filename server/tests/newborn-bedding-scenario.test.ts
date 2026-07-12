import { describe, expect, it } from "vitest";
import {
  createNewbornBeddingIntent,
  createNewbornBeddingScenario,
  createSellerA,
  createSellerB,
  createSellerC,
  DEMO_CREDENTIAL_DISCLAIMER,
} from "../src/scenario/newborn-bedding.js";
import {
  evidenceRequirementSchema,
  executableIntentSchema,
  sellerScoreVectorSchema,
} from "../src/protocol/schemas.js";

// ---------------------------------------------------------------------------
// 买家意图：锁定预算、交期、风险阈值、不可接受项与自动购买条件。
// ---------------------------------------------------------------------------

describe("newborn bedding intent", () => {
  it("locks budget, deadline and auto-purchase risk threshold", () => {
    const intent = createNewbornBeddingIntent();
    expect(intent.budgetUsd).toBe(180);
    expect(intent.deadlineHours).toBe(72);
    // 风险分低于 0.15 时自动购买
    expect(intent.riskThreshold).toBe(0.15);
    expect(intent.autoPurchasePolicy.enabled).toBe(true);
    // 自动成交上限不得超过预算（协议层 superRefine 亦会强制）
    expect(intent.autoPurchasePolicy.maxAutoSpendUsd).toBeLessThanOrEqual(
      intent.budgetUsd,
    );
    expect(intent.autoPurchasePolicy.requireAllMandatoryEvidence).toBe(true);
  });

  it("declares the three unacceptable conditions", () => {
    const intent = createNewbornBeddingIntent();
    expect(intent.unacceptable).toEqual([
      "材料声明无可验证证据",
      "配送超过 72 小时",
      "无皮肤不适退货政策",
    ]);
  });

  it("requires verifiable material and hypoallergenic evidence as mandatory", () => {
    const intent = createNewbornBeddingIntent();
    const mandatoryIds = intent.evidenceRequirements
      .filter((requirement) => requirement.mandatory)
      .map((requirement) => requirement.id);
    expect(mandatoryIds).toContain("material-composition");
    expect(mandatoryIds).toContain("hypoallergenic-lab-report");
    expect(mandatoryIds).toContain("return-policy");
  });

  it("passes the protocol executable-intent schema", () => {
    const intent = createNewbornBeddingIntent();
    // 场景数据必须与协议层严格校验保持一致
    expect(executableIntentSchema.safeParse(intent).success).toBe(true);
    for (const requirement of intent.evidenceRequirements) {
      expect(evidenceRequirementSchema.safeParse(requirement).success).toBe(
        true,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 各卖家关键价格与交期。
// ---------------------------------------------------------------------------

describe("seller pricing and delivery", () => {
  it("locks Seller A price and 2-day delivery", () => {
    const a = createSellerA();
    expect(a.initialPriceUsd).toBe(151);
    expect(a.finalPriceUsd).toBe(151);
    expect(a.deliveryHours).toBe(48);
    expect(a.bundle).toBeNull();
  });

  it("locks Seller B price and 5-day (over-deadline) delivery", () => {
    const b = createSellerB();
    expect(b.initialPriceUsd).toBe(156);
    expect(b.deliveryHours).toBe(120);
    // 5 天 = 120h，超出意图的 72h 上限
    expect(b.deliveryHours).toBeGreaterThan(
      createNewbornBeddingIntent().deadlineHours,
    );
    expect(b.bundle).toBeNull();
  });

  it("locks Seller C initial 172, bundled final 164 and 3-day delivery", () => {
    const a = createSellerA();
    const c = createSellerC();
    expect(c.initialPriceUsd).toBe(172);
    expect(c.finalPriceUsd).toBe(164);
    expect(c.deliveryHours).toBe(72);
    expect(c.bundle).not.toBeNull();
    expect(c.bundle?.bundledPriceUsd).toBe(164);
    // 最终价与 bundle 价一致，且不超预算
    expect(c.finalPriceUsd).toBe(c.bundle?.bundledPriceUsd);
    expect(c.finalPriceUsd).toBeLessThanOrEqual(180);
    // 询价阶段 Seller C 比 Seller A 贵约 14%，与演示谈判台词一致
    const initialPremiumPercent =
      ((c.initialPriceUsd - a.initialPriceUsd) / a.initialPriceUsd) * 100;
    expect(Math.round(initialPremiumPercent)).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// 证据缺口：Seller A 缺硬性证据，B/C 齐备。
// ---------------------------------------------------------------------------

describe("evidence gaps", () => {
  it("Seller A misses the hypoallergenic lab report and return policy", () => {
    const a = createSellerA();
    expect(a.evidenceGaps).toContain("hypoallergenic-lab-report");
    expect(a.evidenceGaps).toContain("return-policy");
    // A 只提交了材料成分这一张凭证
    expect(a.credentials).toHaveLength(1);
    expect(a.credentials[0]?.requirementId).toBe("material-composition");
  });

  it("Seller B and Seller C have no evidence gaps", () => {
    expect(createSellerB().evidenceGaps).toEqual([]);
    expect(createSellerC().evidenceGaps).toEqual([]);
  });

  it("every credential is explicitly a demo credential, never a real certification", () => {
    const scenario = createNewbornBeddingScenario();
    const allCredentials = scenario.sellers.flatMap(
      (seller) => seller.credentials,
    );
    // 场景中确实存在凭证，避免"空数组恒真"的假通过
    expect(allCredentials.length).toBeGreaterThan(0);
    for (const credential of allCredentials) {
      expect(credential.isDemoCredential).toBe(true);
      expect(credential.disclaimer).toBe(DEMO_CREDENTIAL_DISCLAIMER);
      expect(credential.verificationStatus).toBe("demo-verifiable");
      // 六要素齐备：类型/签发方/referenceId/hash/有效期/验证状态
      expect(credential.type).toBeTruthy();
      expect(credential.issuer).toBeTruthy();
      expect(credential.referenceId).toBeTruthy();
      expect(credential.hash).toBeTruthy();
      expect(credential.validFrom).toBeTruthy();
      expect(credential.validUntil).toBeTruthy();
    }
  });

  it("matches every credential type to its referenced evidence requirement", () => {
    const scenario = createNewbornBeddingScenario();
    const requirements = new Map(
      scenario.intent.evidenceRequirements.map((requirement) => [
        requirement.id,
        requirement,
      ]),
    );

    for (const seller of scenario.sellers) {
      for (const credential of seller.credentials) {
        const requirement = requirements.get(credential.requirementId);
        expect(requirement).toBeDefined();
        expect(credential.type).toBe(requirement?.kind);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 排名变化：验证前后的关键叙事。
// ---------------------------------------------------------------------------

describe("ranking before and after verification", () => {
  it("Seller A starts rank 1 then drops after verification", () => {
    const a = createSellerA();
    expect(a.preVerificationScore.rank).toBe(1);
    // 验证后掉出可成交区间
    expect(a.postVerificationScore.rank).toBeGreaterThan(1);
    expect(a.postVerificationScore.stage).toBe("rejected");
    // 证据不足导致风险冲高越过意图阈值 0.15
    expect(a.postVerificationScore.riskScore).toBeGreaterThan(0.15);
  });

  it("rejects Seller B for violating the hard delivery deadline", () => {
    const intent = createNewbornBeddingIntent();
    const b = createSellerB();
    // 交期超限使验证后的交付信心显著低于验证前
    expect(b.postVerificationScore.deliveryConfidence).toBeLessThan(
      b.preVerificationScore.deliveryConfidence,
    );
    expect(b.deliveryHours).toBeGreaterThan(intent.deadlineHours);
    expect(b.postVerificationScore.stage).toBe("rejected");
    expect(b.postVerificationScore.riskScore).toBeGreaterThan(
      intent.riskThreshold,
    );
  });

  it("Seller C rises from rank 3 to rank 1 after verification", () => {
    const c = createSellerC();
    expect(c.preVerificationScore.rank).toBe(3);
    expect(c.postVerificationScore.rank).toBe(1);
    expect(c.postVerificationScore.stage).toBe("authorized");
  });

  it("Seller C final state satisfies the intent auto-purchase conditions", () => {
    const intent = createNewbornBeddingIntent();
    const c = createSellerC();
    const score = c.postVerificationScore;
    // 风险低于自动购买阈值
    expect(score.riskScore).toBeLessThan(intent.riskThreshold);
    // 总分与信任分越过自动购买门槛
    expect(score.totalScore).toBeGreaterThanOrEqual(
      intent.autoPurchasePolicy.minTotalScore,
    );
    expect(score.trustScore).toBeGreaterThanOrEqual(
      intent.autoPurchasePolicy.minTrustScore,
    );
    // 最终价落在自动成交上限内
    expect(c.finalPriceUsd).toBeLessThanOrEqual(
      intent.autoPurchasePolicy.maxAutoSpendUsd,
    );
    // 无证据缺口，满足"所有硬性证据齐备"
    expect(c.evidenceGaps).toEqual([]);
  });

  it("every score vector conforms to the protocol schema", () => {
    const scenario = createNewbornBeddingScenario();
    for (const seller of scenario.sellers) {
      expect(
        sellerScoreVectorSchema.safeParse(seller.preVerificationScore).success,
      ).toBe(true);
      expect(
        sellerScoreVectorSchema.safeParse(seller.postVerificationScore).success,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 工厂纯净性：每次调用返回全新、独立、可安全修改的对象。
// ---------------------------------------------------------------------------

describe("factory purity", () => {
  it("returns fresh intent objects that do not share mutable state", () => {
    const first = createNewbornBeddingIntent();
    const second = createNewbornBeddingIntent();
    expect(first).not.toBe(second);
    expect(first.evidenceRequirements).not.toBe(second.evidenceRequirements);
    // 改动一个不影响另一个
    first.unacceptable.push("被污染的项");
    first.budgetUsd = 999;
    expect(second.unacceptable).toHaveLength(3);
    expect(second.budgetUsd).toBe(180);
  });

  it("returns fresh seller scenarios that do not share mutable state", () => {
    const first = createNewbornBeddingScenario();
    const second = createNewbornBeddingScenario();
    expect(first.sellers).not.toBe(second.sellers);
    // 深层数组也应是独立副本
    first.sellers[0]?.credentials.push({
      type: "photo",
      requirementId: "polluted",
      issuer: "polluted",
      referenceId: "polluted",
      hash: "polluted",
      validFrom: "2026-01-01T00:00:00+08:00",
      validUntil: "2027-01-01T00:00:00+08:00",
      verificationStatus: "demo-verifiable",
      isDemoCredential: true,
      disclaimer: DEMO_CREDENTIAL_DISCLAIMER,
    });
    expect(second.sellers[0]?.credentials).toHaveLength(1);
  });
});

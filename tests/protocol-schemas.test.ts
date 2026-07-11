import { describe, expect, it } from "vitest";
import {
  agentEventSchema,
  autoPurchasePolicySchema,
  evidenceDocumentSchema,
  evidenceQuestionSchema,
  evidenceRequirementSchema,
  evidenceRequestedSchema,
  evidenceSubmissionSchema,
  executableIntentSchema,
  liveReceiptSchema,
  orderAuthorizedSchema,
  sellerMatchedSchema,
  sellerScoreVectorSchema,
} from "../src/protocol/schemas.js";

// ---------------------------------------------------------------------------
// 共享 fixture：一份合法的证据要求、评分向量与可执行意图，
// 供各 schema 的「解析成功」用例复用，避免重复构造。
// ---------------------------------------------------------------------------

// 合法的单条证据要求
const validRequirement = {
  id: "oeko-tex-cert",
  kind: "certification" as const,
  description: "OEKO-TEX Standard 100 婴幼儿等级认证",
  mandatory: true,
};

// 合法的自动购买协议
const validPolicy = {
  enabled: true,
  minTotalScore: 80,
  minTrustScore: 70,
  maxAutoSpendUsd: 180,
  requireAllMandatoryEvidence: true,
};

// 合法的可执行意图：符合任务要求（USD 180 预算、72 小时交期、风险阈值、不可接受项、证据要求、自动购买条件）
const validIntent = {
  intentId: "intent-1",
  productDescription: "新生儿低敏纯棉床品四件套",
  budgetUsd: 180,
  deadlineHours: 72,
  riskThreshold: 0.2,
  unacceptable: ["含荧光增白剂", "甲醛超标"],
  evidenceRequirements: [validRequirement],
  autoPurchasePolicy: validPolicy,
};

// 合法的卖家评分向量
const validScoreVector = {
  sellerId: "seller-b",
  matchScore: 88,
  trustScore: 91,
  deliveryConfidence: 84,
  priceFit: 79,
  riskScore: 0.12,
  totalScore: 86,
  rank: 1,
  stage: "scored" as const,
};

describe("evidenceRequirementSchema", () => {
  it("accepts a well-formed evidence requirement", () => {
    expect(evidenceRequirementSchema.parse(validRequirement)).toEqual(
      validRequirement,
    );
  });

  it("rejects an unknown evidence kind", () => {
    const bad = { ...validRequirement, kind: "video" };
    expect(evidenceRequirementSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty id", () => {
    const bad = { ...validRequirement, id: "" };
    expect(evidenceRequirementSchema.safeParse(bad).success).toBe(false);
  });
});

describe("autoPurchasePolicySchema", () => {
  it("accepts a well-formed policy", () => {
    expect(autoPurchasePolicySchema.parse(validPolicy)).toEqual(validPolicy);
  });

  it("rejects a total-score threshold above 100", () => {
    const bad = { ...validPolicy, minTotalScore: 120 };
    expect(autoPurchasePolicySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-positive auto-spend cap", () => {
    const bad = { ...validPolicy, maxAutoSpendUsd: 0 };
    expect(autoPurchasePolicySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing boolean flag", () => {
    const { requireAllMandatoryEvidence: _omit, ...bad } = validPolicy;
    expect(autoPurchasePolicySchema.safeParse(bad).success).toBe(false);
  });
});

describe("executableIntentSchema", () => {
  it("accepts a well-formed executable intent", () => {
    expect(executableIntentSchema.parse(validIntent)).toEqual(validIntent);
  });

  it("rejects a risk threshold outside 0-1", () => {
    const bad = { ...validIntent, riskThreshold: 1.5 };
    expect(executableIntentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-positive budget", () => {
    const bad = { ...validIntent, budgetUsd: -1 };
    expect(executableIntentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty evidence-requirement list", () => {
    const bad = { ...validIntent, evidenceRequirements: [] };
    expect(executableIntentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an auto-purchase limit above the intent budget", () => {
    const bad = {
      ...validIntent,
      autoPurchasePolicy: { ...validPolicy, maxAutoSpendUsd: 181 },
    };
    expect(executableIntentSchema.safeParse(bad).success).toBe(false);
  });
});

describe("evidenceDocumentSchema", () => {
  const validDocument = {
    requirementId: "oeko-tex-cert",
    title: "OEKO-TEX 认证证书 2026",
    uri: "https://example.com/certs/oeko-tex.pdf",
    contentHash: "sha256:abcdef",
  };

  it("accepts a well-formed evidence document", () => {
    expect(evidenceDocumentSchema.parse(validDocument)).toEqual(validDocument);
  });

  it("rejects a missing content hash", () => {
    const { contentHash: _omit, ...bad } = validDocument;
    expect(evidenceDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty uri", () => {
    const bad = { ...validDocument, uri: "" };
    expect(evidenceDocumentSchema.safeParse(bad).success).toBe(false);
  });

  // ---- 结构化凭证（credential 可选子对象）----
  const validCredentialDocument = {
    requirementId: "hypoallergenic-lab-report",
    title: "低敏实验室检测报告",
    uri: "https://example.com/certs/lab.pdf",
    contentHash: "demohash-lab-0001",
    credential: {
      type: "lab-report" as const,
      issuer: "Demo 低敏检测中心",
      referenceId: "LAB-0001",
      hash: "demohash-lab-0001",
      validFrom: "2026-01-01T00:00:00+08:00",
      validUntil: "2027-01-01T00:00:00+08:00",
      verificationStatus: "demo-verifiable",
      isDemoCredential: true as const,
      disclaimer: "演示用可验证凭证，非真实认证。",
    },
  };

  it("accepts a document carrying a structured credential", () => {
    expect(evidenceDocumentSchema.parse(validCredentialDocument)).toEqual(
      validCredentialDocument,
    );
  });

  it("rejects a credential claiming to be a real (non-demo) certification", () => {
    const bad = {
      ...validCredentialDocument,
      credential: {
        ...validCredentialDocument.credential,
        isDemoCredential: false,
      },
    };
    expect(evidenceDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a credential with an unknown type", () => {
    const bad = {
      ...validCredentialDocument,
      credential: { ...validCredentialDocument.credential, type: "video" },
    };
    expect(evidenceDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a credential whose validity date lacks a timezone offset", () => {
    const bad = {
      ...validCredentialDocument,
      credential: {
        ...validCredentialDocument.credential,
        validUntil: "2027-01-01T00:00:00",
      },
    };
    expect(evidenceDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a credential with an unknown verification status", () => {
    const bad = {
      ...validCredentialDocument,
      credential: {
        ...validCredentialDocument.credential,
        verificationStatus: "trusted-by-default",
      },
    };
    expect(evidenceDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a credential whose validity ends before it starts", () => {
    const bad = {
      ...validCredentialDocument,
      credential: {
        ...validCredentialDocument.credential,
        validUntil: "2025-01-01T00:00:00+08:00",
      },
    };
    expect(evidenceDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a document whose content hash differs from its credential", () => {
    const bad = {
      ...validCredentialDocument,
      contentHash: "demohash-tampered",
    };
    expect(evidenceDocumentSchema.safeParse(bad).success).toBe(false);
  });
});

describe("evidenceQuestionSchema", () => {
  const validQuestion = {
    id: "q-formaldehyde",
    prompt: "该床品是否通过婴幼儿级甲醛限量检测？",
    expectedAnswer: "boolean" as const,
  };

  it("accepts a well-formed question", () => {
    expect(evidenceQuestionSchema.parse(validQuestion)).toEqual(validQuestion);
  });

  it("rejects an unknown expected-answer form", () => {
    const bad = { ...validQuestion, expectedAnswer: "date" };
    expect(evidenceQuestionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty prompt", () => {
    const bad = { ...validQuestion, prompt: "" };
    expect(evidenceQuestionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("evidenceSubmissionSchema", () => {
  const validSubmission = {
    sellerId: "seller-b",
    intentId: "intent-1",
    documents: [
      {
        requirementId: "oeko-tex-cert",
        title: "OEKO-TEX 认证证书 2026",
        uri: "https://example.com/certs/oeko-tex.pdf",
        contentHash: "sha256:abcdef",
      },
    ],
    answers: { "q-formaldehyde": "true" },
  };

  it("accepts a well-formed submission", () => {
    expect(evidenceSubmissionSchema.parse(validSubmission)).toEqual(
      validSubmission,
    );
  });

  it("accepts a submission with no documents but keeps answers as a string map", () => {
    const submission = { ...validSubmission, documents: [] };
    expect(evidenceSubmissionSchema.parse(submission)).toEqual(submission);
  });

  it("rejects a non-string answer value", () => {
    const bad = { ...validSubmission, answers: { "q-formaldehyde": true } };
    expect(evidenceSubmissionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing intentId", () => {
    const { intentId: _omit, ...bad } = validSubmission;
    expect(evidenceSubmissionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("sellerScoreVectorSchema", () => {
  it("accepts a well-formed score vector", () => {
    expect(sellerScoreVectorSchema.parse(validScoreVector)).toEqual(
      validScoreVector,
    );
  });

  it("rejects a score above 100", () => {
    const bad = { ...validScoreVector, trustScore: 101 };
    expect(sellerScoreVectorSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a risk score outside 0-1", () => {
    const bad = { ...validScoreVector, riskScore: 12 };
    expect(sellerScoreVectorSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-integer rank", () => {
    const bad = { ...validScoreVector, rank: 1.5 };
    expect(sellerScoreVectorSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown stage", () => {
    const bad = { ...validScoreVector, stage: "pending" };
    expect(sellerScoreVectorSchema.safeParse(bad).success).toBe(false);
  });
});

describe("sellerMatchedSchema", () => {
  const validMatch = {
    intentId: "intent-1",
    sellerId: "seller-c",
    matchScore: 88,
    reason: "Verified materials and three-day delivery",
  };

  it("accepts a well-formed seller match", () => {
    expect(sellerMatchedSchema.parse(validMatch)).toEqual(validMatch);
  });

  it("rejects a match score above 100", () => {
    const bad = { ...validMatch, matchScore: 101 };
    expect(sellerMatchedSchema.safeParse(bad).success).toBe(false);
  });
});

describe("evidenceRequestedSchema", () => {
  const validRequest = {
    intentId: "intent-1",
    sellerId: "seller-c",
    requirements: [validRequirement],
    questions: [
      {
        id: "q-delivery",
        prompt: "Can you guarantee delivery within three days?",
        expectedAnswer: "boolean" as const,
      },
    ],
  };

  it("accepts a well-formed evidence request", () => {
    expect(evidenceRequestedSchema.parse(validRequest)).toEqual(validRequest);
  });

  it("rejects a request with an invalid nested question", () => {
    const bad = {
      ...validRequest,
      questions: [{ ...validRequest.questions[0], expectedAnswer: "date" }],
    };
    expect(evidenceRequestedSchema.safeParse(bad).success).toBe(false);
  });
});

describe("orderAuthorizedSchema", () => {
  const validAuthorization = {
    intentId: "intent-1",
    sellerId: "seller-c",
    authorizedAmountUsd: 164,
    scoreSnapshot: validScoreVector,
    autoApproved: true,
  };

  it("accepts a well-formed order authorization", () => {
    expect(orderAuthorizedSchema.parse(validAuthorization)).toEqual(
      validAuthorization,
    );
  });

  it("rejects a non-positive authorized amount", () => {
    const bad = { ...validAuthorization, authorizedAmountUsd: 0 };
    expect(orderAuthorizedSchema.safeParse(bad).success).toBe(false);
  });
});

describe("liveReceiptSchema", () => {
  const validReceipt = {
    receiptId: "receipt-1",
    intentId: "intent-1",
    sellerId: "seller-b",
    amountUsd: 176,
    deliveryHours: 48,
    evidenceSnapshotHash: "sha256:snapshot",
    issuedAt: "2026-07-11T13:00:00+08:00",
  };

  it("accepts a well-formed receipt", () => {
    expect(liveReceiptSchema.parse(validReceipt)).toEqual(validReceipt);
  });

  it("rejects a timestamp without a timezone offset", () => {
    const bad = { ...validReceipt, issuedAt: "2026-07-11T13:00:00" };
    expect(liveReceiptSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    const bad = { ...validReceipt, amountUsd: 0 };
    expect(liveReceiptSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 事件信封层：验证新事件能被 agentEventSchema 正确判别并解析，
// 且现有事件（order.confirmed）仍然照常解析——确认扩展没有破坏既有行为。
// ---------------------------------------------------------------------------

describe("agentEventSchema with new event types", () => {
  const envelope = {
    id: "event-1",
    transactionId: "tx-1",
    source: "buyer-agent",
    timestamp: "2026-07-11T13:00:00+08:00",
  };

  it("parses an intent.published event", () => {
    const result = agentEventSchema.safeParse({
      ...envelope,
      type: "intent.published",
      payload: validIntent,
    });
    expect(result.success).toBe(true);
  });

  it("parses a seller.score.updated event", () => {
    const result = agentEventSchema.safeParse({
      ...envelope,
      type: "seller.score.updated",
      payload: validScoreVector,
    });
    expect(result.success).toBe(true);
  });

  it("parses an order.authorized event carrying a score snapshot", () => {
    const result = agentEventSchema.safeParse({
      ...envelope,
      type: "order.authorized",
      payload: {
        intentId: "intent-1",
        sellerId: "seller-b",
        authorizedAmountUsd: 176,
        scoreSnapshot: validScoreVector,
        autoApproved: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a new event whose payload violates its schema", () => {
    const result = agentEventSchema.safeParse({
      ...envelope,
      type: "intent.published",
      payload: { ...validIntent, riskThreshold: 5 },
    });
    expect(result.success).toBe(false);
  });

  it("still parses a pre-existing order.confirmed event unchanged", () => {
    const result = agentEventSchema.safeParse({
      ...envelope,
      type: "order.confirmed",
      payload: {
        orderId: "order-1",
        sellerId: "seller-b",
        totalPrice: 176,
        status: "confirmed",
      },
    });
    expect(result.success).toBe(true);
  });
});

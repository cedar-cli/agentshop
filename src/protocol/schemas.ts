import { z } from "zod";

const decisionWeightsSchema = z
  .object({
    price: z.number().min(0).max(1),
    reputation: z.number().min(0).max(1),
    delivery: z.number().min(0).max(1),
  })
  .refine(
    ({ price, reputation, delivery }) =>
      Math.abs(price + reputation + delivery - 1) < 0.0001,
    "Decision weights must add up to 1",
  );

export const purchaseRequestSchema = z.object({
  product: z.string().min(1),
  quantity: z.number().int().positive(),
  budget: z.number().positive(),
  deadline: z.iso.datetime({ offset: true }),
  constraints: z.object({
    allergenFree: z.array(z.string()),
  }),
  weights: decisionWeightsSchema,
});

export const proposalSchema = z.object({
  sellerId: z.string().min(1),
  totalPrice: z.number().positive(),
  deliveryHours: z.number().positive(),
  reputation: z.number().min(0).max(100),
  allergenSafe: z.boolean(),
  reasoning: z.string().min(1).max(240),
  generatedBy: z.enum(["llm", "fallback"]),
  fallbackReason: z.string().max(240).optional(),
});

const sellerSelectionSchema = z.object({
  sellerId: z.string().min(1),
  score: z.number(),
  reason: z.string().min(1),
  proposal: proposalSchema,
});

// 买家还价请求：目标价必须为正，理由用于 demo 展示谈判话术
const counterOfferSchema = z.object({
  sellerId: z.string().min(1),
  originalPrice: z.number().positive(),
  targetPrice: z.number().positive(),
  reasoning: z.string().min(1).max(240),
});

// 商家还价应答：让利金额不得为负，最终价必须为正
const counterResponseSchema = z.object({
  sellerId: z.string().min(1),
  accepted: z.boolean(),
  finalPrice: z.number().positive(),
  concession: z.number().min(0),
  reasoning: z.string().min(1).max(240),
  generatedBy: z.enum(["llm", "fallback"]),
  fallbackReason: z.string().max(240).optional(),
});

const confirmedOrderSchema = z.object({
  orderId: z.string().min(1),
  sellerId: z.string().min(1),
  totalPrice: z.number().positive(),
  status: z.literal("confirmed"),
});

// ===========================================================================
// 新增负载 Schema：可执行意图、机器询证、动态评分、自动购买协议
//
// 全部为严格校验（拒绝非法/越界/缺字段的数据），仅扩展协议，不影响现有事件解析。
// 这些 schema 一并 export，方便针对单个负载做「解析成功 / 非法拒绝」测试。
// ===========================================================================

// 单条证据要求：id 非空、类别为固定枚举、描述非空、是否必需为布尔
export const evidenceRequirementSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["certification", "lab-report", "material-spec", "photo", "attestation"]),
  description: z.string().min(1).max(240),
  mandatory: z.boolean(),
});

// 自动购买协议：各评分门槛限定在 0-100，自动成交上限必须为正
export const autoPurchasePolicySchema = z.object({
  enabled: z.boolean(),
  minTotalScore: z.number().min(0).max(100),
  minTrustScore: z.number().min(0).max(100),
  maxAutoSpendUsd: z.number().positive(),
  requireAllMandatoryEvidence: z.boolean(),
});

// 可执行意图：预算/交期为正、风险阈值落在 0-1、至少一条证据要求
export const executableIntentSchema = z.object({
  intentId: z.string().min(1),
  productDescription: z.string().min(1).max(240),
  budgetUsd: z.number().positive(),
  deadlineHours: z.number().positive(),
  riskThreshold: z.number().min(0).max(1),
  unacceptable: z.array(z.string().min(1)),
  evidenceRequirements: z.array(evidenceRequirementSchema).min(1),
  autoPurchasePolicy: autoPurchasePolicySchema,
});

// 证据文档：回指的要求 id、标题、地址与内容哈希均非空
export const evidenceDocumentSchema = z.object({
  requirementId: z.string().min(1),
  title: z.string().min(1).max(240),
  uri: z.string().min(1),
  contentHash: z.string().min(1),
});

// 机器询证问题：id 与问题文本非空，期望作答形态为固定枚举
export const evidenceQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1).max(240),
  expectedAnswer: z.enum(["boolean", "number", "text", "enum"]),
});

// 证据提交：卖家/意图 id 非空，文档为数组，作答为「问题 id → 字符串答案」映射
export const evidenceSubmissionSchema = z.object({
  sellerId: z.string().min(1),
  intentId: z.string().min(1),
  documents: z.array(evidenceDocumentSchema),
  answers: z.record(z.string().min(1), z.string()),
});

// 卖家评分向量：各分项限定在 0-100，排名为正整数，阶段为固定枚举
export const sellerScoreVectorSchema = z.object({
  sellerId: z.string().min(1),
  matchScore: z.number().min(0).max(100),
  trustScore: z.number().min(0).max(100),
  deliveryConfidence: z.number().min(0).max(100),
  priceFit: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
  totalScore: z.number().min(0).max(100),
  rank: z.number().int().positive(),
  stage: z.enum([
    "matched",
    "evidence-pending",
    "scored",
    "authorized",
    "rejected",
  ]),
});

// 卖家匹配：意图/卖家 id 非空，匹配度 0-100，理由非空
export const sellerMatchedSchema = z.object({
  intentId: z.string().min(1),
  sellerId: z.string().min(1),
  matchScore: z.number().min(0).max(100),
  reason: z.string().min(1).max(240),
});

// 证据请求：意图/卖家 id 非空，要求与问题均为数组
export const evidenceRequestedSchema = z.object({
  intentId: z.string().min(1),
  sellerId: z.string().min(1),
  requirements: z.array(evidenceRequirementSchema),
  questions: z.array(evidenceQuestionSchema),
});

// 授权下单：授权金额为正，携带评分快照，是否自动审批为布尔
export const orderAuthorizedSchema = z.object({
  intentId: z.string().min(1),
  sellerId: z.string().min(1),
  authorizedAmountUsd: z.number().positive(),
  scoreSnapshot: sellerScoreVectorSchema,
  autoApproved: z.boolean(),
});

// 实时回执：金额与交期为正，证据快照哈希非空，签发时间为带时区 ISO 时间
export const liveReceiptSchema = z.object({
  receiptId: z.string().min(1),
  intentId: z.string().min(1),
  sellerId: z.string().min(1),
  amountUsd: z.number().positive(),
  deliveryHours: z.number().positive(),
  evidenceSnapshotHash: z.string().min(1),
  issuedAt: z.iso.datetime({ offset: true }),
});

export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("purchase.requested"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: purchaseRequestSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("proposal.submitted"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: proposalSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("seller.selected"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: sellerSelectionSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("counter.offer"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: counterOfferSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("counter.response"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: counterResponseSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("order.confirmed"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: confirmedOrderSchema,
  }),
  // ---- 新增事件分支：可执行意图与机器询证 ----
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("intent.published"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: executableIntentSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("seller.matched"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: sellerMatchedSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("evidence.requested"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: evidenceRequestedSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("evidence.submitted"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: evidenceSubmissionSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("seller.score.updated"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: sellerScoreVectorSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("order.authorized"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: orderAuthorizedSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("receipt.issued"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: liveReceiptSchema,
  }),
]);

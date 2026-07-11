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

export const laptopPurchaseRequestSchema = z.object({
  requestText: z.string().min(8).max(500),
});

const laptopPrioritiesSchema = z.object({
  timeliness: z.number().min(0).max(100),
  spec: z.number().min(0).max(100),
  price: z.number().min(0).max(100),
  afterSales: z.number().min(0).max(100),
});

export const laptopIntentSchema = z.object({
  requestText: z.string().min(1).max(500),
  product: z.string().min(1).max(120),
  budgetCny: z.number().positive(),
  deadlineHours: z.number().positive(),
  maxWeightKg: z.number().positive(),
  minBatteryHours: z.number().positive(),
  requiresNationalWarranty: z.boolean(),
  priorities: laptopPrioritiesSchema,
  generatedBy: z.enum(["llm", "fallback"]),
  fallbackReason: z.string().max(240).optional(),
});

const laptopMetricsSchema = z.object({
  timeliness: z.number().min(0).max(100),
  spec: z.number().min(0).max(100),
  afterSales: z.number().min(0).max(100),
  price: z.number().min(0).max(100),
});

export const laptopProposalSchema = z.object({
  sellerId: z.string().min(1),
  displayName: z.string().min(1),
  quotedPriceCny: z.number().positive(),
  listPriceCny: z.number().positive(),
  deliveryHours: z.number().positive(),
  weightKg: z.number().positive(),
  batteryHours: z.number().positive(),
  warrantyYears: z.number().int().positive(),
  nationalWarranty: z.boolean(),
  reputation: z.number().min(0).max(100),
  metrics: laptopMetricsSchema,
  reasoning: z.string().min(1).max(240),
  generatedBy: z.enum(["llm", "fallback"]),
  fallbackReason: z.string().max(240).optional(),
});

const laptopSellerRejectedSchema = z.object({
  sellerId: z.string().min(1),
  displayName: z.string().min(1),
  reasons: z.array(z.string().min(1)).min(1),
});

const laptopSellerSelectedSchema = z.object({
  sellerId: z.string().min(1),
  displayName: z.string().min(1),
  score: z.number().min(0).max(100),
  reason: z.string().min(1).max(240),
  proposal: laptopProposalSchema,
});

const laptopCounterOfferSchema = z.object({
  sellerId: z.string().min(1),
  originalPriceCny: z.number().positive(),
  targetPriceCny: z.number().positive(),
  reasoning: z.string().min(1).max(240),
});

const laptopCounterResponseSchema = z.object({
  sellerId: z.string().min(1),
  finalPriceCny: z.number().positive(),
  concessionCny: z.number().min(0),
  reasoning: z.string().min(1).max(240),
  generatedBy: z.enum(["llm", "fallback"]),
  fallbackReason: z.string().max(240).optional(),
});

const laptopApprovalRequestedSchema = z.object({
  sellerId: z.string().min(1),
  displayName: z.string().min(1),
  finalPriceCny: z.number().positive(),
  expiresInMinutes: z.number().int().positive(),
  reason: z.string().min(1).max(240),
});

const laptopOrderConfirmedSchema = z.object({
  orderId: z.string().min(1),
  sellerId: z.string().min(1),
  displayName: z.string().min(1),
  totalPriceCny: z.number().positive(),
  status: z.literal("confirmed"),
  approvedBy: z.literal("human"),
});

const laptopFulfillmentUpdatedSchema = z.object({
  orderId: z.string().min(1),
  status: z.literal("delivered"),
  deliveredEarlyHours: z.number().min(0),
  checks: z.array(z.string().min(1)).min(1),
  simulated: z.literal(true),
});

const laptopAttestationIssuedSchema = z.object({
  orderId: z.string().min(1),
  attestationId: z.string().min(1),
  scores: z.object({
    timeliness: z.number().min(0).max(100),
    specification: z.number().min(0).max(100),
    packaging: z.number().min(0).max(100),
  }),
  merchantCreditBefore: z.number().min(0).max(100),
  merchantCreditAfter: z.number().min(0).max(100),
  simulatedEvidence: z.literal(true),
});

const restockTimeAdvancedSchema = z.object({
  days: z.number().int().positive(), beforePercent: z.number().min(0).max(100),
  afterPercent: z.number().min(0).max(100), simulated: z.literal(true),
});
const restockInventoryForecastSchema = z.object({
  item: z.string().min(1), remainingPercent: z.number().min(0).max(100),
  hoursUntilEmpty: z.number().positive(), confidence: z.number().min(0).max(100),
  simulatedSensor: z.literal(true),
});
const restockAuthorizationCheckSchema = z.object({
  authorizationId: z.string().min(1), allowedCategories: z.array(z.string().min(1)).min(1),
  singlePurchaseLimitCny: z.number().positive(), monthlyLimitCny: z.number().positive(),
  monthlyRemainingCny: z.number().min(0), cooldownDays: z.number().int().min(0),
  daysSinceLastPurchase: z.number().int().min(0), hardConstraints: z.array(z.string().min(1)),
  passed: z.literal(true),
});
const restockIntentSchema = z.object({
  product: z.string().min(1), budgetCny: z.number().positive(), deadlineHours: z.number().positive(),
  quantity: z.number().int().positive(), constraints: z.array(z.string().min(1)), reason: z.string().min(1),
});
const restockProposalSchema = z.object({
  sellerId: z.string().min(1), displayName: z.string().min(1), totalPriceCny: z.number().positive(),
  deliveryHours: z.number().positive(), reputation: z.number().min(0).max(100), reasoning: z.string().min(1).max(240),
  generatedBy: z.enum(["llm", "fallback"]), fallbackReason: z.string().max(240).optional(),
});
const restockSellerSelectedSchema = z.object({
  sellerId: z.string().min(1), displayName: z.string().min(1), score: z.number().min(0).max(100),
  reason: z.string().min(1), proposal: restockProposalSchema,
});
const restockBundleNegotiatedSchema = z.object({
  sellerId: z.string().min(1), originalPriceCny: z.number().positive(), finalPriceCny: z.number().positive(),
  concessionCny: z.number().min(0), bundle: z.array(z.string().min(1)).min(1), benefits: z.array(z.string().min(1)),
  reasoning: z.string().min(1).max(240), generatedBy: z.enum(["llm", "fallback"]),
  fallbackReason: z.string().max(240).optional(),
});
const restockOrderAuthorizedSchema = z.object({
  authorizationId: z.string().min(1), sellerId: z.string().min(1), amountCny: z.number().positive(),
  checks: z.array(z.string().min(1)).min(1), autoApproved: z.literal(true), humanInteractions: z.literal(0),
});
const restockOrderConfirmedSchema = z.object({
  orderId: z.string().min(1), sellerId: z.string().min(1), displayName: z.string().min(1),
  totalPriceCny: z.number().positive(), status: z.literal("confirmed"),
});
const restockInventoryUpdatedSchema = z.object({
  orderId: z.string().min(1), items: z.array(z.object({ name: z.string().min(1), quantity: z.number().int().positive() })).min(1),
  simulated: z.literal(true),
});
const restockMemoryUpdatedSchema = z.object({
  consumptionCycleDays: z.number().positive(), nextTriggerLeadDays: z.number().positive(), memory: z.string().min(1),
});
const restockNotificationSentSchema = z.object({
  channel: z.literal("inbox"), requiresAction: z.literal(false), summary: z.string().min(1),
});

const activeSalesProductIngestedSchema = z.object({
  productId: z.string().min(1), name: z.string().min(1), category: z.string().min(1),
  priceUsd: z.number().positive(), stock: z.number().int().min(0),
  sourceCoverage: z.number().min(0).max(100), rawDescription: z.string().min(1).max(1000),
});
const activeSalesPassportPublishedSchema = z.object({
  productId: z.string().min(1), features: z.array(z.string().min(1)).min(1).max(12),
  summary: z.string().min(1).max(300),
  passport: z.object({
    material: z.string().min(1), evidence: z.string().min(1),
    delivery: z.string().min(1), returns: z.string().min(1),
  }),
  coverageBefore: z.number().min(0).max(100), coverageAfter: z.number().min(0).max(100),
  generatedBy: z.enum(["llm", "fallback"]), fallbackReason: z.string().max(240).optional(),
});
const activeSalesBuyerMatchedSchema = z.object({
  buyerId: z.string().min(1), displayName: z.string().min(1), profile: z.string().min(1),
  consent: z.enum(["open", "limited", "closed"]), exposedFields: z.array(z.string().min(1)),
  matchScore: z.number().min(0).max(100), reasons: z.array(z.string().min(1)),
});
const activeSalesProposalRoutedSchema = z.object({
  buyerId: z.string().min(1), displayName: z.string().min(1), routeId: z.string().min(1),
  consent: z.enum(["open", "limited"]), matchScore: z.number().min(0).max(100),
  pitch: z.string().min(1).max(300), generatedBy: z.enum(["llm", "fallback"]),
  fallbackReason: z.string().max(240).optional(),
});
const activeSalesProposalBlockedSchema = z.object({
  buyerId: z.string().min(1), displayName: z.string().min(1), consent: z.literal("closed"),
  reason: z.string().min(1).max(240), exposedFieldCount: z.literal(0),
});
const activeSalesBuyerSelectedSchema = z.object({
  buyerId: z.string().min(1), displayName: z.string().min(1), score: z.number().min(0).max(100),
  reason: z.string().min(1).max(300),
  comparison: z.array(z.object({
    product: z.string().min(1), priceUsd: z.number().positive(), evidence: z.string().min(1),
    delivery: z.string().min(1), score: z.number().min(0).max(100),
  })).min(1),
});
const activeSalesCompletedSchema = z.object({
  orderId: z.string().min(1), buyerId: z.string().min(1), displayName: z.string().min(1),
  productId: z.string().min(1), productName: z.string().min(1), amountUsd: z.number().positive(),
  autoApproved: z.literal(true), humanClicks: z.literal(0),
});

export const demandNetworkRequestSchema = z.object({
  commissionRate: z.number().min(1).max(8),
  maxDiscountPercent: z.number().min(2).max(15),
});
const demandNeedReceivedSchema = z.object({
  needId: z.string().min(1), buyerType: z.enum(["consumer", "business"]),
  text: z.string().min(1).max(500), source: z.enum(["demo-fixture", "consumer-transaction"]),
});
const demandIntentStructuredSchema = z.object({
  needId: z.string().min(1), scene: z.string().min(1), quantity: z.number().int().positive(),
  budgetUsd: z.number().positive(), deadlineDays: z.number().positive(),
  requirements: z.array(z.string().min(1)).min(1), generatedBy: z.enum(["llm", "fallback"]),
  fallbackReason: z.string().max(240).optional(),
});
const demandMarketAggregatedSchema = z.object({
  sampleSize: z.number().int().positive(), simulatedMarketIntents: z.number().int().positive(),
  clusters: z.array(z.object({
    label: z.string().min(1), sampleHits: z.number().int().min(0),
    simulatedDemand: z.number().int().min(0), growthPercent: z.number(),
  })).min(1), simulated: z.literal(true),
});
const demandProductForecastedSchema = z.object({
  selectedProduct: z.string().min(1), candidates: z.array(z.object({
    product: z.string().min(1), marketHeat: z.number().min(0).max(100),
    supplyFit: z.number().min(0).max(100), marginFit: z.number().min(0).max(100),
    totalScore: z.number().min(0).max(100),
  })).min(1), reason: z.string().min(1).max(300),
});
const demandSupplyNegotiatedSchema = z.object({
  supplierId: z.string().min(1), quantity: z.number().int().positive(), unitPriceUsd: z.number().positive(),
  depositPercent: z.number().min(0).max(100), deliveryDays: z.number().positive(),
  delayPenaltyPercentPerDay: z.number().min(0).max(100), reasoning: z.string().min(1).max(300),
  generatedBy: z.enum(["llm", "fallback"]), fallbackReason: z.string().max(240).optional(),
});
const demandBatchCompletedSchema = z.object({
  batchId: z.string().min(1), quantity: z.number().int().positive(), status: z.literal("released"),
  checks: z.array(z.string().min(1)).min(1), productPassportId: z.string().min(1), simulated: z.literal(true),
});
const distributionContractPublishedSchema = z.object({
  contractId: z.string().min(1), commissionRate: z.number().min(1).max(8),
  maxDiscountPercent: z.number().min(2).max(15), minimumMarginPercent: z.number().min(0).max(100),
  settlementCondition: z.literal("fulfilled-and-attested"),
});
const distributionAgentMatchedSchema = z.object({
  agentId: z.string().min(1), label: z.string().min(1), channel: z.string().min(1),
  authorizedIntentCount: z.number().int().min(0), matchScore: z.number().min(0).max(100),
});
const distributionOrdersCompletedSchema = z.object({
  orderCount: z.number().int().positive(), gmvUsd: z.number().positive(),
  b2cOrders: z.number().int().min(0), b2bOrders: z.number().int().min(0),
  attestedOrders: z.number().int().min(0), sampleOrders: z.array(z.object({
    source: z.string().min(1), buyer: z.string().min(1), amountUsd: z.number().positive(),
  })).min(1), simulated: z.literal(true),
});
const distributionCommissionReleasedSchema = z.object({
  contractId: z.string().min(1), orderCount: z.number().int().positive(),
  commissionRate: z.number().min(1).max(8), amountUsd: z.number().min(0),
  condition: z.literal("fulfilled-and-attested"), hashChainVerified: z.literal(true),
});

const intentGrowthMarketRankedSchema = z.object({
  intentId: z.string().min(1), buyerName: z.string().min(1), title: z.string().min(1), currentSellerId: z.string().min(1),
  currentRank: z.number().int().positive(), currentScore: z.number().min(0).max(100), candidates: z.array(z.object({
    sellerId: z.string().min(1), displayName: z.string().min(1), score: z.number().min(0).max(100), rank: z.number().int().positive(),
  })).min(3),
});
const intentGrowthSellerShortlistedSchema = z.object({ intentId: z.string().min(1), sellerId: z.string().min(1), shortlistSize: z.number().int().positive(), rank: z.number().int().positive(), reason: z.string().min(1) });
const intentGrowthDialogueRoundSchema = z.object({ buyerId: z.string().min(1), buyerName: z.string().min(1), context: z.string().min(1), round: z.number().int().positive(), role: z.enum(["buyer", "seller"]), text: z.string().min(1).max(300) });
const intentGrowthSellerLostSchema = z.object({ intentId: z.string().min(1), sellerId: z.string().min(1), winnerId: z.string().min(1), finalRank: z.number().int().positive(), reason: z.string().min(1), uncoveredFields: z.array(z.string().min(1)).min(1) });
const intentGrowthLearningStartedSchema = z.object({ conversationGroups: z.number().int().positive(), dialogueRounds: z.number().int().positive(), observedSignals: z.number().int().positive(), simulatedSignalVolume: z.literal(true), generatedBy: z.enum(["llm", "fallback"]), fallbackReason: z.string().max(240).optional() });
const intentGrowthIntentExtractedSchema = z.object({ key: z.enum(["wash_temp", "use_context", "wash_cycles", "bulk_sla"]), label: z.string().min(1), value: z.string().min(1), confidence: z.number().min(0).max(100), productField: z.string().min(1), evidence: z.array(z.string().min(1)).min(2), status: z.literal("ready"), generatedBy: z.enum(["llm", "fallback"]), fallbackReason: z.string().max(240).optional() });
const intentGrowthGapDetectedSchema = z.object({ productId: z.string().min(1), coverageBefore: z.number().min(0).max(100), missingFields: z.array(z.string().min(1)).min(1), summary: z.string().min(1).max(300), generatedBy: z.enum(["llm", "fallback"]) });
const intentGrowthProductFieldUpdatedSchema = z.object({ productId: z.string().min(1), field: z.string().min(1), value: z.string().min(1), status: z.literal("written"), version: z.literal("v2.2"), coverageAfter: z.number().min(0).max(100), evidence: z.array(z.string().min(1)).min(1) });
const intentGrowthProductVersionPublishedSchema = z.object({ productId: z.string().min(1), productName: z.string().min(1), previousVersion: z.literal("v2.1"), version: z.literal("v2.2"), coverageBefore: z.number().min(0).max(100), coverageAfter: z.number().min(0).max(100), writtenFields: z.array(z.string().min(1)).min(1), summary: z.string().min(1).max(300) });
const intentGrowthBuyerRematchedSchema = z.object({ intentId: z.string().min(1), buyerName: z.string().min(1), quantity: z.number().int().positive(), deadlineDays: z.number().positive(), requirements: z.array(z.string().min(1)).min(1), scoreBefore: z.number().min(0).max(100), scoreAfter: z.number().min(0).max(100), rankBefore: z.number().int().positive(), rankAfter: z.number().int().positive(), scoreBreakdown: z.object({ context: z.number().min(0).max(100), wash: z.number().min(0).max(100), durability: z.number().min(0).max(100), bulkSla: z.number().min(0).max(100) }) });
const intentGrowthQuoteRequestedSchema = z.object({ quoteId: z.string().min(1), quantity: z.number().int().positive(), budgetUsd: z.number().positive(), requestedDeliveryDays: z.number().positive(), requestedTerms: z.array(z.string().min(1)).min(1) });
const intentGrowthTermsNegotiatedSchema = z.object({ quoteId: z.string().min(1), unitPriceUsd: z.number().positive(), quantity: z.number().int().positive(), deliveryDays: z.number().positive(), delayPenaltyPercent: z.number().min(0).max(100), totalUsd: z.number().positive(), messages: z.array(z.string().min(1)).min(2) });
const intentGrowthOrderSignedSchema = z.object({ orderId: z.string().min(1), buyerName: z.string().min(1), quantity: z.number().int().positive(), unitPriceUsd: z.number().positive(), totalUsd: z.number().positive(), deliveryDays: z.number().positive(), delayPenaltyPercent: z.number().min(0).max(100), status: z.literal("signed") });
const intentGrowthAttestationIssuedSchema = z.object({ attestationId: z.string().min(1), deliveredInDays: z.number().positive(), evidenceVerified: z.boolean(), slaHonored: z.boolean(), afterSalesExecutable: z.boolean(), trustDelta: z.number(), simulatedFulfillment: z.literal(true) });
const intentGrowthRankUpdatedSchema = z.object({ rankBefore: z.number().int().positive(), rankAfter: z.number().int().positive(), scoreBefore: z.number().min(0).max(100), scoreAfter: z.number().min(0).max(100), shortlistRateBefore: z.number().min(0).max(100), shortlistRateAfter: z.number().min(0).max(100), ordersPerDayBefore: z.number().min(0), ordersPerDayAfter: z.number().min(0), projectedNewIntents: z.number().int().min(0), simulatedProjection: z.literal(true) });

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
export const executableIntentSchema = z
  .object({
    intentId: z.string().min(1),
    productDescription: z.string().min(1).max(240),
    budgetUsd: z.number().positive(),
    deadlineHours: z.number().positive(),
    riskThreshold: z.number().min(0).max(1),
    unacceptable: z.array(z.string().min(1)),
    evidenceRequirements: z.array(evidenceRequirementSchema).min(1),
    autoPurchasePolicy: autoPurchasePolicySchema,
  })
  .superRefine((intent, context) => {
    if (intent.autoPurchasePolicy.maxAutoSpendUsd > intent.budgetUsd) {
      context.addIssue({
        code: "custom",
        path: ["autoPurchasePolicy", "maxAutoSpendUsd"],
        message: "Auto-purchase limit cannot exceed the intent budget",
      });
    }
  });

// 结构化凭证：证据文档可选携带的可验证凭证要素。
// isDemoCredential 强制为字面量 true——协议层据此拒绝任何伪装成真实外部认证的凭证。
export const evidenceCredentialSchema = z
  .object({
    // 凭证类型必须落在与 EvidenceRequirement.kind 相同的枚举内
    type: z.enum([
      "certification",
      "lab-report",
      "material-spec",
      "photo",
      "attestation",
    ]),
    issuer: z.string().min(1),
    referenceId: z.string().min(1),
    hash: z.string().min(1),
    validFrom: z.iso.datetime({ offset: true }),
    validUntil: z.iso.datetime({ offset: true }),
    verificationStatus: z.enum(["demo-verifiable", "unverifiable"]),
    // 恒为 true：明确这是演示可验证凭证，不是真实认证
    isDemoCredential: z.literal(true),
    disclaimer: z.string().min(1).max(240),
  })
  .superRefine((credential, context) => {
    if (Date.parse(credential.validFrom) >= Date.parse(credential.validUntil)) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Credential validity must end after it starts",
      });
    }
  });

// 证据文档：回指的要求 id、标题、地址与内容哈希均非空；可选携带结构化凭证
export const evidenceDocumentSchema = z
  .object({
    requirementId: z.string().min(1),
    title: z.string().min(1).max(240),
    uri: z.string().min(1),
    contentHash: z.string().min(1),
    credential: evidenceCredentialSchema.optional(),
  })
  .superRefine((document, context) => {
    if (
      document.credential &&
      document.contentHash !== document.credential.hash
    ) {
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Document content hash must match its credential hash",
      });
    }
  });

// 机器询证问题：id 与问题文本非空，期望作答形态为固定枚举
export const evidenceQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1).max(240),
  expectedAnswer: z.enum(["boolean", "number", "text", "enum"]),
});

// 证据提交：卖家/意图 id 非空，文档为数组，作答为「问题 id → 字符串答案」映射。
// generatedBy 限定为固定枚举，据此拒绝任何非法的生成来源标记；fallbackReason 简短可选。
export const evidenceSubmissionSchema = z.object({
  sellerId: z.string().min(1),
  intentId: z.string().min(1),
  documents: z.array(evidenceDocumentSchema),
  answers: z.record(z.string().min(1), z.string()),
  generatedBy: z.enum(["llm", "fallback"]),
  fallbackReason: z.string().max(240).optional(),
});

// 卖家评分向量：风险分限定在 0-1，其余分项限定在 0-100
export const sellerScoreVectorSchema = z.object({
  sellerId: z.string().min(1),
  matchScore: z.number().min(0).max(100),
  trustScore: z.number().min(0).max(100),
  deliveryConfidence: z.number().min(0).max(100),
  priceFit: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(1),
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
  z.object({
    id: z.string().min(1), transactionId: z.string().min(1),
    type: z.literal("laptop.purchase.requested"), source: z.string().min(1),
    target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(), payload: laptopPurchaseRequestSchema,
  }),
  z.object({
    id: z.string().min(1), transactionId: z.string().min(1),
    type: z.literal("laptop.intent.structured"), source: z.string().min(1),
    target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(), payload: laptopIntentSchema,
  }),
  z.object({
    id: z.string().min(1), transactionId: z.string().min(1),
    type: z.literal("laptop.proposal.submitted"), source: z.string().min(1),
    target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(), payload: laptopProposalSchema,
  }),
  z.object({
    id: z.string().min(1), transactionId: z.string().min(1),
    type: z.literal("laptop.seller.rejected"), source: z.string().min(1),
    target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(), payload: laptopSellerRejectedSchema,
  }),
  z.object({
    id: z.string().min(1), transactionId: z.string().min(1),
    type: z.literal("laptop.seller.selected"), source: z.string().min(1),
    target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(), payload: laptopSellerSelectedSchema,
  }),
  z.object({
    id: z.string().min(1), transactionId: z.string().min(1),
    type: z.literal("laptop.counter.offer"), source: z.string().min(1),
    target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(), payload: laptopCounterOfferSchema,
  }),
  z.object({
    id: z.string().min(1), transactionId: z.string().min(1),
    type: z.literal("laptop.counter.response"), source: z.string().min(1),
    target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(), payload: laptopCounterResponseSchema,
  }),
  z.object({
    id: z.string().min(1), transactionId: z.string().min(1),
    type: z.literal("laptop.approval.requested"), source: z.string().min(1),
    target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(), payload: laptopApprovalRequestedSchema,
  }),
  z.object({
    id: z.string().min(1), transactionId: z.string().min(1),
    type: z.literal("laptop.order.confirmed"), source: z.string().min(1),
    target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(), payload: laptopOrderConfirmedSchema,
  }),
  z.object({
    id: z.string().min(1), transactionId: z.string().min(1),
    type: z.literal("laptop.fulfillment.updated"), source: z.string().min(1),
    target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(), payload: laptopFulfillmentUpdatedSchema,
  }),
  z.object({
    id: z.string().min(1), transactionId: z.string().min(1),
    type: z.literal("laptop.attestation.issued"), source: z.string().min(1),
    target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(), payload: laptopAttestationIssuedSchema,
  }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.time.advanced"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockTimeAdvancedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.inventory.forecasted"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockInventoryForecastSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.authorization.checked"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockAuthorizationCheckSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.intent.created"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockIntentSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.proposal.submitted"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockProposalSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.seller.selected"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockSellerSelectedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.bundle.negotiated"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockBundleNegotiatedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.order.authorized"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockOrderAuthorizedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.order.confirmed"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockOrderConfirmedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.inventory.updated"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockInventoryUpdatedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.memory.updated"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockMemoryUpdatedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("restock.notification.sent"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: restockNotificationSentSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("active-sale.product.ingested"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: activeSalesProductIngestedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("active-sale.passport.published"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: activeSalesPassportPublishedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("active-sale.buyer.matched"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: activeSalesBuyerMatchedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("active-sale.proposal.routed"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: activeSalesProposalRoutedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("active-sale.proposal.blocked"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: activeSalesProposalBlockedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("active-sale.buyer.selected"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: activeSalesBuyerSelectedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("active-sale.completed"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: activeSalesCompletedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("demand.need.received"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: demandNeedReceivedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("demand.intent.structured"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: demandIntentStructuredSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("demand.market.aggregated"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: demandMarketAggregatedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("demand.product.forecasted"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: demandProductForecastedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("demand.supply.negotiated"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: demandSupplyNegotiatedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("demand.batch.completed"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: demandBatchCompletedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("distribution.contract.published"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: distributionContractPublishedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("distribution.agent.matched"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: distributionAgentMatchedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("distribution.orders.completed"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: distributionOrdersCompletedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("distribution.commission.released"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: distributionCommissionReleasedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.market.ranked"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthMarketRankedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.seller.shortlisted"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthSellerShortlistedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.dialogue.round"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthDialogueRoundSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.seller.lost"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthSellerLostSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.learning.started"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthLearningStartedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.intent.extracted"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthIntentExtractedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.gap.detected"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthGapDetectedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.product.field.updated"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthProductFieldUpdatedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.product.version.published"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthProductVersionPublishedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.buyer.rematched"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthBuyerRematchedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.quote.requested"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthQuoteRequestedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.terms.negotiated"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthTermsNegotiatedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.order.signed"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthOrderSignedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.attestation.issued"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthAttestationIssuedSchema }),
  z.object({ id: z.string().min(1), transactionId: z.string().min(1), type: z.literal("intent-growth.rank.updated"), source: z.string().min(1), target: z.string().optional(), timestamp: z.iso.datetime({ offset: true }), causationId: z.string().optional(), payload: intentGrowthRankUpdatedSchema }),
]);

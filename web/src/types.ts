/**
 * 前端领域类型 · 新生儿低敏床品实时 Demo
 *
 * 本文件完整建模后端「可执行意图 + 机器询证 + 动态评分 + 自动购买」链路对外
 * 暴露的数据结构，与后端 src/protocol/events.ts、src/scenario/newborn-bedding.ts
 * 一一对应（字段名保持一致，前端不做重命名，避免解析歧义）。
 *
 * 设计原则：
 *  - 事件用**判别联合**（以 type 字段判别）建模，读取 payload 时用 event.type
 *    收窄类型，杜绝到处 `as` 强转和 `Record<string, unknown>`。
 *  - 仅建模前端真正会渲染的字段；结构与后端严格对齐，后端改动时此处需同步。
 */

// ---------------------------------------------------------------------------
// 可执行意图与其子结构
// ---------------------------------------------------------------------------

/** 证据类别（与后端 EvidenceRequirement.kind 对齐）。 */
export type EvidenceKind =
  | "certification"
  | "lab-report"
  | "material-spec"
  | "photo"
  | "attestation";

/** 单条证据要求：买家在意图中声明卖家必须提供哪一类证明。 */
export interface EvidenceRequirement {
  // 证据要求的稳定标识，供请求/提交/评分相互引用
  id: string;
  // 证据类别
  kind: EvidenceKind;
  // 人类可读的要求描述
  description: string;
  // 是否为硬性必需项（true 时缺失即判不合格）
  mandatory: boolean;
}

/** 自动购买协议：机器在何种条件下可以不经人工直接下单。 */
export interface AutoPurchasePolicy {
  // 是否启用自动购买
  enabled: boolean;
  // 触发自动下单所需的最低总评分（0-100）
  minTotalScore: number;
  // 触发自动下单所需的最低信任分（0-100）
  minTrustScore: number;
  // 允许自动成交的单笔最高金额（USD）
  maxAutoSpendUsd: number;
  // 是否要求所有 mandatory 证据齐备后才允许自动成交
  requireAllMandatoryEvidence: boolean;
}

/** 可执行意图：买家发布的、可被机器直接执行的采购意图。 */
export interface ExecutableIntent {
  // 意图唯一标识
  intentId: string;
  // 商品描述
  productDescription: string;
  // 预算（USD）
  budgetUsd: number;
  // 交期上限（小时）
  deadlineHours: number;
  // 风险阈值（0-1）：可容忍的最高风险分
  riskThreshold: number;
  // 不可接受项清单，命中任意一项即淘汰
  unacceptable: string[];
  // 证据要求清单
  evidenceRequirements: EvidenceRequirement[];
  // 自动购买协议
  autoPurchasePolicy: AutoPurchasePolicy;
}

// ---------------------------------------------------------------------------
// 证据与凭证
// ---------------------------------------------------------------------------

/** 凭证验证状态。 */
export type CredentialStatus = "demo-verifiable" | "unverifiable";

/**
 * 结构化凭证：证据文档携带的可验证凭证元数据。
 * isDemoCredential 恒为 true，明确这是演示可验证凭证，不是真实外部认证。
 */
export interface EvidenceCredential {
  // 凭证类型（与所满足的证据要求 kind 对齐）
  type: EvidenceKind;
  // 签发方名称（演示用虚构机构）
  issuer: string;
  // 凭证在签发方处的引用编号
  referenceId: string;
  // 凭证内容哈希（供本地复算比对）
  hash: string;
  // 有效期起始（ISO-8601，带时区偏移）
  validFrom: string;
  // 有效期截止（ISO-8601，带时区偏移）
  validUntil: string;
  // 验证状态
  verificationStatus: CredentialStatus;
  // Demo 标记：恒为 true
  isDemoCredential: true;
  // 免责说明
  disclaimer: string;
}

/** 证据文档：卖家为满足某条证据要求而提交的一份材料。 */
export interface EvidenceDocument {
  // 对应的证据要求 id
  requirementId: string;
  // 文档标题（人类可读，不含结构化字段）
  title: string;
  // 文档可访问地址（Demo 中为占位 URI）
  uri: string;
  // 文档内容哈希
  contentHash: string;
  // 结构化凭证（可选）
  credential?: EvidenceCredential;
}

/** 机器询证问题。 */
export interface EvidenceQuestion {
  // 问题唯一标识
  id: string;
  // 问题文本
  prompt: string;
  // 期望作答形态
  expectedAnswer: "boolean" | "number" | "text" | "enum";
}

/** 证据提交：卖家针对一次证据请求的完整回应。 */
export interface EvidenceSubmission {
  // 提交方卖家 id
  sellerId: string;
  // 所属意图 id
  intentId: string;
  // 提交的证据文档列表
  documents: EvidenceDocument[];
  // 对机器询证问题的作答：key 为问题 id，value 为字符串答案
  answers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// 评分与授权
// ---------------------------------------------------------------------------

/** 卖家在候选池中的阶段。 */
export type SellerStage =
  | "matched"
  | "evidence-pending"
  | "scored"
  | "authorized"
  | "rejected";

/** 卖家动态评分向量。 */
export interface SellerScoreVector {
  // 被评分的卖家 id
  sellerId: string;
  // 匹配度（0-100）
  matchScore: number;
  // 信任分（0-100）
  trustScore: number;
  // 交付信心（0-100）
  deliveryConfidence: number;
  // 价格契合度（0-100）
  priceFit: number;
  // 风险分（0-1，越高越危险）
  riskScore: number;
  // 综合总分（0-100）
  totalScore: number;
  // 候选池排名（1 为最优）
  rank: number;
  // 当前阶段
  stage: SellerStage;
}

/** 卖家匹配记录。 */
export interface SellerMatched {
  // 所属意图 id
  intentId: string;
  // 被匹配的卖家 id
  sellerId: string;
  // 初步匹配度（0-100）
  matchScore: number;
  // 匹配理由
  reason: string;
}

/** 证据请求：买家 Agent 向某卖家发起的一次询证。 */
export interface EvidenceRequested {
  // 所属意图 id
  intentId: string;
  // 被询证的卖家 id
  sellerId: string;
  // 本次请求覆盖的证据要求清单
  requirements: EvidenceRequirement[];
  // 本次请求附带的机器询证问题
  questions: EvidenceQuestion[];
}

/** 授权下单：买家 Agent 在自动购买条件满足后对赢家下达的成交授权。 */
export interface OrderAuthorized {
  // 所属意图 id
  intentId: string;
  // 被授权成交的卖家 id
  sellerId: string;
  // 授权成交金额（USD）
  authorizedAmountUsd: number;
  // 触发授权时该卖家的评分快照
  scoreSnapshot: SellerScoreVector;
  // 是否由自动购买协议自动触发
  autoApproved: boolean;
}

/** 实时电子回执：授权成交后签发的成交凭证。 */
export interface LiveReceipt {
  // 回执唯一标识
  receiptId: string;
  // 所属意图 id
  intentId: string;
  // 成交卖家 id
  sellerId: string;
  // 最终成交金额（USD）
  amountUsd: number;
  // 卖家承诺交期（小时）
  deliveryHours: number;
  // 证据快照哈希
  evidenceSnapshotHash: string;
  // 回执签发时间（ISO-8601）
  issuedAt: string;
}

// ---------------------------------------------------------------------------
// 场景数据（GET /api/demo/newborn-bedding 返回）
// ---------------------------------------------------------------------------

/** 单个卖家的完整画像（含验证前/后评分、凭证、bundle 等）。 */
export interface SellerScenario {
  // 卖家 id（seller-a / seller-b / seller-c）
  sellerId: string;
  // 卖家展示名
  displayName: string;
  // 初始报价（USD）
  initialPriceUsd: number;
  // 最终成交价（USD）
  finalPriceUsd: number;
  // 承诺交期（小时）
  deliveryHours: number;
  // 已提交的结构化证据凭证
  credentials: EvidenceCredential[];
  // 证据缺口：意图要求但未能提供可验证证据的要求 id 列表
  evidenceGaps: string[];
  // 验证前评分
  preVerificationScore: SellerScoreVector;
  // 验证后评分
  postVerificationScore: SellerScoreVector;
  // bundle 让利说明（无则为 null）
  bundle: {
    description: string;
    bundledPriceUsd: number;
  } | null;
}

/** 整个新生儿床品演示场景：一份买家意图 + 三个卖家画像。 */
export interface NewbornBeddingScenario {
  intent: ExecutableIntent;
  sellers: SellerScenario[];
}

// ---------------------------------------------------------------------------
// 事件（SSE / 快照返回）
// ---------------------------------------------------------------------------

/** 本 Demo 使用的 7 类事件类型。 */
export type NewbornEventType =
  | "intent.published"
  | "seller.matched"
  | "evidence.requested"
  | "evidence.submitted"
  | "seller.score.updated"
  | "order.authorized"
  | "receipt.issued";

/** 存储事件公共字段（后端 StoredEvent 的公共部分）。 */
interface StoredEventBase {
  // 事件 UUID（去重主键之一）
  id: string;
  // 交易 id
  transactionId: string;
  // 全局递增序号（去重主键之一，也用于排序）
  sequence: number;
  // 事件来源 Agent id
  source: string;
  // 事件目标 Agent / 卖家 id（可选）
  target?: string;
  // 事件时间戳（ISO-8601）
  timestamp: string;
  // 因果关联的上游事件 id（可选）
  causationId?: string;
  // 前一事件哈希（哈希链）
  previousHash: string;
  // 本事件哈希
  hash: string;
}

/**
 * 新生儿床品事件的判别联合。
 * 用 event.type 判别后即可安全读取对应 payload，无需强转。
 */
export type NewbornEvent =
  | (StoredEventBase & { type: "intent.published"; payload: ExecutableIntent })
  | (StoredEventBase & { type: "seller.matched"; payload: SellerMatched })
  | (StoredEventBase & {
      type: "evidence.requested";
      payload: EvidenceRequested;
    })
  | (StoredEventBase & {
      type: "evidence.submitted";
      payload: EvidenceSubmission;
    })
  | (StoredEventBase & {
      type: "seller.score.updated";
      payload: SellerScoreVector;
    })
  | (StoredEventBase & { type: "order.authorized"; payload: OrderAuthorized })
  | (StoredEventBase & { type: "receipt.issued"; payload: LiveReceipt });

// ---------------------------------------------------------------------------
// 交易与 API 响应
// ---------------------------------------------------------------------------

/** 交易运行状态。 */
export type TransactionStatus = "queued" | "running" | "completed" | "failed";

/** 交易类型。 */
export type TransactionKind = "purchase" | "newborn-bedding-demo";

/** GET /api/transactions/:id 返回的交易快照。 */
export interface TransactionSnapshot {
  // 交易 id
  id: string;
  // 交易类型
  kind: TransactionKind;
  // 交易状态
  status: TransactionStatus;
  // 失败原因（仅 failed 时存在）
  error?: string;
  // 哈希链是否校验通过
  chainValid: boolean;
  // 事件列表（按 sequence 升序）
  events: NewbornEvent[];
}

/** POST /api/demo/newborn-bedding 返回体。 */
export interface DemoStartResponse {
  // 新交易 id
  transactionId: string;
  // 初始状态（queued）
  status: string;
  // 交易快照查询地址
  transactionUrl: string;
  // SSE 事件流地址
  eventsUrl: string;
}

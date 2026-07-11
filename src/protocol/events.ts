export const EVENT_TYPES = [
  "purchase.requested",
  "proposal.submitted",
  "seller.selected",
  // 买家在选标后对赢家发起的一轮还价（砍价请求）
  "counter.offer",
  // 商家对还价的应答：接受或坚持底线
  "counter.response",
  "order.confirmed",
  // ---- 新增：可执行意图与机器询证事件（不改变现有流程行为，仅扩展协议词汇表）----
  // 买家发布一份「可执行意图」，声明商品、预算、交期、风险阈值、证据要求与自动购买条件
  "intent.published",
  // 系统/买家 Agent 将某个卖家与该意图初步匹配（进入询证与评分流程的候选池）
  "seller.matched",
  // 买家 Agent 针对某卖家发起证据请求（要求提交合规证明并回答机器询证问题）
  "evidence.requested",
  // 卖家 Agent 回应证据请求，提交证明文档与问题作答
  "evidence.submitted",
  // 系统根据证据与匹配情况，更新某卖家在本意图下的动态评分向量
  "seller.score.updated",
  // 买家 Agent 在自动购买条件满足时，对赢家下达授权下单指令
  "order.authorized",
  // 平台在授权成交后签发一张实时电子回执（含金额、交期承诺与证据快照哈希）
  "receipt.issued",
] as const;

export type AgentEventType = (typeof EVENT_TYPES)[number];

export interface DecisionWeights {
  price: number;
  reputation: number;
  delivery: number;
}

export interface PurchaseRequest {
  product: string;
  quantity: number;
  budget: number;
  deadline: string;
  constraints: {
    allergenFree: string[];
  };
  weights: DecisionWeights;
}

export interface Proposal {
  sellerId: string;
  totalPrice: number;
  deliveryHours: number;
  reputation: number;
  allergenSafe: boolean;
  reasoning: string;
  generatedBy: "llm" | "fallback";
  fallbackReason?: string;
}

export interface SellerSelection {
  sellerId: string;
  score: number;
  reason: string;
  proposal: Proposal;
}

/**
 * 买家发起的还价请求。
 * 买家选出赢家后，基于预算与市场最低价推算一个目标价，向赢家争取进一步让利。
 */
export interface CounterOffer {
  // 被还价的目标商家
  sellerId: string;
  // 商家原始报价（用于对照让步幅度）
  originalPrice: number;
  // 买家期望达成的目标价
  targetPrice: number;
  // 还价理由（用于 demo 展示买家 Agent 的谈判话术）
  reasoning: string;
}

/**
 * 商家对还价的应答。
 * 商家可以接受买家目标价、部分让步，或坚持原价拒绝让步——但任何情况下都不得跌破成本底线。
 */
export interface CounterResponse {
  sellerId: string;
  // 商家是否作出了让步（最终价低于原始报价即视为让步）
  accepted: boolean;
  // 本轮谈判后的最终成交价
  finalPrice: number;
  // 相对原始报价的让利金额（originalPrice - finalPrice，>= 0）
  concession: number;
  // 应答话术（用于 demo 展示商家 Agent 的谈判姿态）
  reasoning: string;
  // 应答由 LLM 生成还是规则兜底
  generatedBy: "llm" | "fallback";
  // 触发兜底的原因（仅在 fallback 时存在）
  fallbackReason?: string;
}

export interface ConfirmedOrder {
  orderId: string;
  sellerId: string;
  totalPrice: number;
  status: "confirmed";
}

// ===========================================================================
// 新增领域模型：可执行意图、机器询证、动态评分、自动购买协议
//
// 这些类型只扩展协议的「词汇表」，不改变任何 Agent/Router/API/前端的既有行为。
// 现有购买流程（purchase.requested → ... → order.confirmed）完全不受影响。
// ===========================================================================

/**
 * 单条证据要求：买家在意图中声明「卖家必须提供哪一类证明」。
 * 用于把「新生儿低敏床品」这类高敏感采购的合规门槛显式建模，供机器询证使用。
 */
export interface EvidenceRequirement {
  // 证据要求的稳定标识（如 "oeko-tex-cert"），供请求/提交/评分环节相互引用
  id: string;
  // 证据类别：认证 / 实验室检测报告 / 材质成分说明 / 图片 / 自证声明
  kind: "certification" | "lab-report" | "material-spec" | "photo" | "attestation";
  // 人类可读的要求描述（如 "OEKO-TEX Standard 100 婴幼儿等级认证"）
  description: string;
  // 是否为硬性必需项（true 时缺失将直接判为不合格）
  mandatory: boolean;
}

/**
 * 自动购买条件：在无需人工复核的情况下，买家 Agent 何时可以自动下单。
 * 把「什么条件下允许机器直接成交」这一关键授权边界显式落到协议里。
 */
export interface AutoPurchasePolicy {
  // 是否启用自动购买（false 时永远需要人工确认，只做撮合与评分）
  enabled: boolean;
  // 触发自动下单所需的最低总评分（0-100），低于此分不自动成交
  minTotalScore: number;
  // 触发自动下单所需的最低信任分（0-100），用于单独兜住信任维度
  minTrustScore: number;
  // 允许自动成交的单笔最高金额（USD），超出则回退人工确认
  maxAutoSpendUsd: number;
  // 是否要求所有 mandatory 证据齐备后才允许自动成交
  requireAllMandatoryEvidence: boolean;
}

/**
 * 可执行意图：买家发布的、可被机器直接执行的采购意图。
 * 相比 PurchaseRequest 更进一步，携带风险阈值、不可接受项、证据要求与自动购买协议，
 * 使整条链路从「请求报价」升级为「可自动履约的意图」。
 */
export interface ExecutableIntent {
  // 意图唯一标识
  intentId: string;
  // 商品描述（如 "新生儿低敏纯棉床品四件套"）
  productDescription: string;
  // 预算（USD），本 Demo 场景固定语义为 180 美元预算
  budgetUsd: number;
  // 交期上限（小时），本 Demo 场景固定语义为 72 小时
  deadlineHours: number;
  // 风险阈值（0-1）：可容忍的最高风险分，越低越保守
  riskThreshold: number;
  // 不可接受项清单（如 "含荧光增白剂"、"甲醛超标"），命中任意一项即淘汰
  unacceptable: string[];
  // 证据要求清单：卖家进入成交前必须满足的机器询证门槛
  evidenceRequirements: EvidenceRequirement[];
  // 自动购买协议：定义机器可自动成交的边界
  autoPurchasePolicy: AutoPurchasePolicy;
}

/**
 * 结构化凭证：证据文档所携带的可验证凭证元数据。
 *
 * 这是对 EvidenceDocument 的**最小扩展**，用于把凭证的结构化要素（类型、签发方、
 * 引用编号、内容哈希、有效期、验证状态、Demo 免责声明）以字段形式承载，
 * 而**不是**把它们拼进 title 字符串。整个证据体系仍只有 EvidenceDocument 这一套结构，
 * credential 只是其中一个可选子对象，向后兼容不带凭证的旧文档。
 */
export interface EvidenceCredential {
  // 凭证类型（与其所满足的 EvidenceRequirement.kind 对齐，便于逐项核对）
  type: EvidenceRequirement["kind"];
  // 签发方名称
  issuer: string;
  // 凭证在签发方处的引用编号
  referenceId: string;
  // 凭证内容哈希（供本地复算比对、防篡改）
  hash: string;
  // 有效期起始（ISO-8601，带时区偏移）
  validFrom: string;
  // 有效期截止（ISO-8601，带时区偏移）
  validUntil: string;
  // 验证状态（如 "demo-verifiable" / "unverifiable"）
  verificationStatus: string;
  // Demo 标记：明确这是演示可验证凭证，不是真实外部认证
  isDemoCredential: boolean;
  // 免责说明，杜绝把 Demo 凭证误当成真实认证
  disclaimer: string;
}

/**
 * 证据文档：卖家为满足某条证据要求而提交的一份材料。
 * 可选携带一个结构化 credential 子对象承载凭证要素（见 EvidenceCredential）。
 */
export interface EvidenceDocument {
  // 对应的证据要求 id（回指 EvidenceRequirement.id）
  requirementId: string;
  // 文档标题（人类可读描述，不塞结构化字段，如 "低敏实验室检测报告"）
  title: string;
  // 文档可访问地址（Demo 中可为占位 URL）
  uri: string;
  // 文档内容的哈希（用于回执快照与防篡改校验；有 credential 时应与其 hash 一致）
  contentHash: string;
  // 结构化凭证（可选）：承载类型/签发方/引用编号/有效期/验证状态/免责声明等要素
  credential?: EvidenceCredential;
}

/**
 * 机器询证问题：买家 Agent 向卖家提出、要求以结构化方式作答的问题。
 */
export interface EvidenceQuestion {
  // 问题唯一标识（用于把作答与问题对应起来）
  id: string;
  // 问题文本（如 "该床品是否通过婴幼儿级甲醛限量检测？"）
  prompt: string;
  // 期望的作答形态：布尔 / 数值 / 文本 / 枚举
  expectedAnswer: "boolean" | "number" | "text" | "enum";
}

/**
 * 证据提交：卖家针对一次证据请求的完整回应。
 * 既包含提交的文档，也包含对机器询证问题的逐条作答。
 */
export interface EvidenceSubmission {
  // 提交方卖家 id
  sellerId: string;
  // 所属意图 id（回指 ExecutableIntent.intentId）
  intentId: string;
  // 提交的证据文档列表
  documents: EvidenceDocument[];
  // 对机器询证问题的作答：key 为问题 id，value 为归一化后的字符串答案
  answers: Record<string, string>;
}

/**
 * 卖家评分向量：卖家在某意图下经匹配与询证后得到的动态多维评分。
 * 除 riskScore 使用 0-1 风险概率外，其余评分项均归一到 0-100；
 * totalScore 为加权综合分，rank/stage 反映其在候选池中的位次与阶段。
 */
export interface SellerScoreVector {
  // 被评分的卖家 id
  sellerId: string;
  // 匹配度：卖家能力与意图诉求的契合程度（0-100）
  matchScore: number;
  // 信任分：基于历史信誉与证据可信度（0-100）
  trustScore: number;
  // 交付信心：按承诺交期与意图交期上限估算的达成信心（0-100）
  deliveryConfidence: number;
  // 价格契合度：报价相对预算的合理性（0-100，越贴近预算且不超支越高）
  priceFit: number;
  // 风险分：综合不可接受项命中与证据缺口估算（0-1，越高越危险）
  riskScore: number;
  // 综合总分（0-100），由上述分项加权得到
  totalScore: number;
  // 在候选池中的排名（1 为最优）
  rank: number;
  // 当前所处阶段：匹配 / 询证中 / 已评分 / 已授权 / 已淘汰
  stage: "matched" | "evidence-pending" | "scored" | "authorized" | "rejected";
}

/**
 * 卖家匹配：某卖家被纳入某意图候选池的记录。
 */
export interface SellerMatched {
  // 所属意图 id
  intentId: string;
  // 被匹配的卖家 id
  sellerId: string;
  // 初步匹配度（0-100），用于决定询证优先级
  matchScore: number;
  // 匹配理由（用于 demo 展示撮合逻辑）
  reason: string;
}

/**
 * 证据请求：买家 Agent 向某卖家发起的一次询证。
 * 携带需满足的证据要求与需作答的机器询证问题。
 */
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

/**
 * 授权下单：买家 Agent 在自动购买条件满足后对赢家下达的成交授权。
 */
export interface OrderAuthorized {
  // 所属意图 id
  intentId: string;
  // 被授权成交的卖家 id
  sellerId: string;
  // 授权成交金额（USD）
  authorizedAmountUsd: number;
  // 触发本次授权时该卖家的评分快照（用于审计为何自动成交）
  scoreSnapshot: SellerScoreVector;
  // 是否由自动购买协议自动触发（false 表示人工确认后授权）
  autoApproved: boolean;
}

/**
 * 实时电子回执：授权成交后平台签发的成交凭证。
 * 记录成交金额、交期承诺以及证据快照哈希，作为一次可执行意图履约的终点。
 */
export interface LiveReceipt {
  // 回执唯一标识
  receiptId: string;
  // 所属意图 id
  intentId: string;
  // 成交卖家 id
  sellerId: string;
  // 最终成交金额（USD）
  amountUsd: number;
  // 卖家承诺的交期（小时）
  deliveryHours: number;
  // 证据快照哈希：签发时对全部已提交证据的聚合哈希，供事后核验
  evidenceSnapshotHash: string;
  // 回执签发时间（ISO-8601，带时区偏移）
  issuedAt: string;
}

export interface EventPayloadMap {
  "purchase.requested": PurchaseRequest;
  "proposal.submitted": Proposal;
  "seller.selected": SellerSelection;
  "counter.offer": CounterOffer;
  "counter.response": CounterResponse;
  "order.confirmed": ConfirmedOrder;
  // ---- 新增事件的负载映射 ----
  "intent.published": ExecutableIntent;
  "seller.matched": SellerMatched;
  "evidence.requested": EvidenceRequested;
  "evidence.submitted": EvidenceSubmission;
  "seller.score.updated": SellerScoreVector;
  "order.authorized": OrderAuthorized;
  "receipt.issued": LiveReceipt;
}

export type AgentEvent<T extends AgentEventType = AgentEventType> =
  T extends AgentEventType
    ? {
        id: string;
        transactionId: string;
        type: T;
        source: string;
        target?: string;
        timestamp: string;
        causationId?: string;
        payload: EventPayloadMap[T];
      }
    : never;

export type NewAgentEvent<T extends AgentEventType = AgentEventType> =
  T extends AgentEventType
    ? Omit<AgentEvent<T>, "id" | "timestamp"> & {
        id?: string;
        timestamp?: string;
      }
    : never;

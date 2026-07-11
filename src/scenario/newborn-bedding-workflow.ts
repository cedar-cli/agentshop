/**
 * 新生儿低敏床品 · 后端 A2A（Agent-to-Agent）工作流
 *
 * 本模块把任务 2 的静态场景数据接入现有 EventRouter，让一整笔交易通过若干
 * AgentHandler **逐步产生事件**，而不是直接构造事件数组或直接写 EventStore。
 *
 * 完整事件链（严格 18 个）：
 *   1  intent.published
 *   2-4  seller.matched × 3（A、B、C）
 *   5-7  seller.score.updated × 3（验证前评分）
 *   8-10 evidence.requested × 3（A、B、C）
 *   11-13 evidence.submitted × 3（A、B、C）
 *   14-16 seller.score.updated × 3（验证后评分）
 *   17 order.authorized
 *   18 receipt.issued
 *
 * 设计原则：
 *  - 完全**确定性**，不调用任何模型/LLM，保证现场 Demo 稳定复现。
 *  - 所有跨事件的中间状态严格按 transactionId 隔离，一笔交易收尾后清理，绝不串单。
 *  - 复用现有 EventRouter 的 causationId 自动传递：handler 返回的事件默认把
 *    causationId 指向触发它的上游事件，从而形成合理的因果链。
 *  - 不修改 Fastify API / React 前端 / 现有 purchase.requested 流程 / LLM 逻辑。
 */

import { createHash } from "node:crypto";
import type { AgentHandler } from "../agents/types.js";
import type {
  AgentEvent,
  EvidenceDocument,
  EvidenceQuestion,
  EvidenceRequirement,
  ExecutableIntent,
  NewAgentEvent,
  SellerScoreVector,
} from "../protocol/events.js";
import type { EventRouter } from "../router/event-router.js";
import {
  createNewbornBeddingScenario,
  type DemoVerifiableCredential,
  type SellerScenario,
} from "./newborn-bedding.js";

// ---------------------------------------------------------------------------
// 参与方 id 与询证问题
// ---------------------------------------------------------------------------

/** 各 Agent 的稳定 source/id，事件的 source 字段会用到。 */
export const WORKFLOW_ACTORS = {
  buyer: "buyer-agent",
  matcher: "marketplace-matcher-agent",
  evaluator: "evidence-evaluator-agent",
  autoPurchase: "auto-purchase-agent",
  receiptIssuer: "receipt-issuer-agent",
} as const;

/**
 * 机器询证问题清单（任务三要求至少覆盖以下 5 个）。
 * 每次调用返回全新数组，避免共享可变对象。
 */
export function createEvidenceQuestions(): EvidenceQuestion[] {
  return [
    {
      id: "q-hypoallergenic-proof",
      prompt: "低敏声明的证据是什么？",
      expectedAnswer: "text",
    },
    {
      id: "q-delivery-72h",
      prompt: "72 小时配送是否覆盖目标地址？",
      expectedAnswer: "boolean",
    },
    {
      id: "q-return-policy",
      prompt: "婴儿皮肤不适时如何退货？",
      expectedAnswer: "text",
    },
    {
      id: "q-price-premium",
      prompt: "为什么 Seller C 比 Seller A 初始报价贵约 14%？",
      expectedAnswer: "text",
    },
    {
      id: "q-bundle-offer",
      prompt: "是否能提供床品 bundle 优惠？",
      expectedAnswer: "boolean",
    },
  ];
}

// ---------------------------------------------------------------------------
// 场景事实 → 各卖家对询证问题的作答
//
// 三家卖家必须按各自场景事实作答，不能返回相同答案。答案完全由场景数据推导，
// 保持确定性。
// ---------------------------------------------------------------------------

/**
 * 依据某卖家的场景数据，推导其对 5 个询证问题的作答。
 * 答案取自场景事实（交期、证据缺口、bundle 等），不同卖家自然给出不同答案。
 */
function answerQuestions(
  seller: SellerScenario,
  intent: ExecutableIntent,
): Record<string, string> {
  // 该卖家是否已提供低敏实验室报告/认证（material 之外的低敏证据）
  const hasHypoallergenicProof = seller.credentials.some(
    (credential) =>
      credential.requirementId === "hypoallergenic-lab-report",
  );
  // 72 小时配送是否覆盖：交期不超过意图上限即视为覆盖
  const coversDeadline = seller.deliveryHours <= intent.deadlineHours;
  // 是否提供了退货政策证据
  const hasReturnPolicy = seller.credentials.some(
    (credential) => credential.requirementId === "return-policy",
  );

  return {
    // 低敏证据：有则说明来源凭证，无则如实承认缺失
    "q-hypoallergenic-proof": hasHypoallergenicProof
      ? `提供低敏检测凭证（requirement=hypoallergenic-lab-report），承诺交期 ${seller.deliveryHours} 小时`
      : "暂无可验证的低敏实验室检测凭证，仅有材料自述",
    // 72h 覆盖：按实际交期作答
    "q-delivery-72h": coversDeadline ? "true" : "false",
    // 退货政策：有证据则说明可退，无则承认缺失
    "q-return-policy": hasReturnPolicy
      ? "皮肤不适支持无理由退货，附退货政策凭证（requirement=return-policy）"
      : "暂无可验证的皮肤不适退货政策凭证",
    // 价格溢价说明：仅 Seller C 有实质性溢价解释，其余按自身定位作答
    "q-price-premium":
      seller.sellerId === "seller-c"
        ? "溢价来自完整低敏认证、材料组成、配送覆盖与退货政策等可验证保障"
        : `本店初始报价 ${seller.initialPriceUsd} USD，定位与保障范围与 Seller C 不同`,
    // bundle 优惠：仅提供 bundle 的卖家回 true 并给出最终价
    "q-bundle-offer": seller.bundle
      ? `true（bundle 后最终价 ${seller.finalPriceUsd} USD）`
      : "false",
  };
}

/**
 * 把场景层的 DemoVerifiableCredential 无损映射为协议层 EvidenceDocument。
 *
 * 关键：凭证的结构化要素全部落到 EvidenceDocument.credential 子对象里，
 * **不拼进 title**；contentHash 复用凭证 hash，保证回执快照哈希可基于它复算。
 */
function credentialToDocument(
  credential: DemoVerifiableCredential,
): EvidenceDocument {
  return {
    requirementId: credential.requirementId,
    // title 仅放人类可读描述，不塞结构化字段
    title: `${credential.type} 凭证`,
    uri: `demo://credential/${credential.referenceId}`,
    contentHash: credential.hash,
    credential: {
      type: credential.type,
      issuer: credential.issuer,
      referenceId: credential.referenceId,
      hash: credential.hash,
      validFrom: credential.validFrom,
      validUntil: credential.validUntil,
      verificationStatus: credential.verificationStatus,
      isDemoCredential: credential.isDemoCredential,
      disclaimer: credential.disclaimer,
    },
  };
}

// ---------------------------------------------------------------------------
// Agent 1：MarketplaceMatcherAgent
// 收到 intent.published，为 A、B、C 依次产生 seller.matched。
// ---------------------------------------------------------------------------

class MarketplaceMatcherAgent implements AgentHandler {
  readonly id = WORKFLOW_ACTORS.matcher;

  constructor(private readonly sellers: SellerScenario[]) {}

  async handle(event: AgentEvent): Promise<NewAgentEvent[]> {
    if (event.type !== "intent.published") return [];
    const intent = event.payload;

    // 按 A、B、C 顺序产生匹配事件，matchScore 取各自验证前评分的 matchScore
    return this.sellers.map((seller) => ({
      transactionId: event.transactionId,
      type: "seller.matched" as const,
      source: this.id,
      target: seller.sellerId,
      payload: {
        intentId: intent.intentId,
        sellerId: seller.sellerId,
        matchScore: seller.preVerificationScore.matchScore,
        reason: `${seller.displayName} 与意图初步匹配，进入询证候选池`,
      },
    }));
  }
}

// ---------------------------------------------------------------------------
// Agent 2：BuyerEvidenceAgent
// 收齐 3 个 seller.matched 后，一次性发布验证前评分（×3）与 evidence.requested（×3）。
// ---------------------------------------------------------------------------

class BuyerEvidenceAgent implements AgentHandler {
  readonly id = WORKFLOW_ACTORS.buyer;
  // 按 transactionId 隔离：记录每笔交易已收到的匹配 sellerId
  private readonly matched = new Map<string, Set<string>>();

  constructor(
    private readonly intent: ExecutableIntent,
    private readonly sellers: SellerScenario[],
  ) {}

  async handle(event: AgentEvent): Promise<NewAgentEvent[]> {
    if (event.type !== "seller.matched") return [];

    const seen = this.matched.get(event.transactionId) ?? new Set<string>();
    seen.add(event.payload.sellerId);
    this.matched.set(event.transactionId, seen);

    // 未收齐三家，先按兵不动
    if (seen.size < this.sellers.length) return [];

    // 收齐三家：清理本交易的中间状态，避免串单/内存泄漏
    this.matched.delete(event.transactionId);

    const questions = createEvidenceQuestions();

    // 先发布验证前评分（A、B、C），再发起证据请求（A、B、C）——数组顺序即入队顺序
    const preScores: NewAgentEvent[] = this.sellers.map((seller) =>
      this.scoreEvent(event.transactionId, seller.preVerificationScore),
    );

    const requests: NewAgentEvent[] = this.sellers.map((seller) => ({
      transactionId: event.transactionId,
      type: "evidence.requested" as const,
      source: this.id,
      // target 指向具体卖家，卖家 Agent 只响应属于自己的请求
      target: seller.sellerId,
      payload: {
        intentId: this.intent.intentId,
        sellerId: seller.sellerId,
        requirements: this.intent.evidenceRequirements.map(
          (requirement): EvidenceRequirement => ({ ...requirement }),
        ),
        questions: questions.map((question) => ({ ...question })),
      },
    }));

    return [...preScores, ...requests];
  }

  /** 构造一个 seller.score.updated 事件（buyer 作为验证前评分的发布方）。 */
  private scoreEvent(
    transactionId: string,
    score: SellerScoreVector,
  ): NewAgentEvent {
    return {
      transactionId,
      type: "seller.score.updated",
      source: this.id,
      target: score.sellerId,
      payload: { ...score },
    };
  }
}

// ---------------------------------------------------------------------------
// Agent 3：NewbornBeddingSellerAgent（每个卖家一个实例）
// 只响应 target 等于自己的 evidence.requested，按自身场景数据提交 evidence.submitted。
// ---------------------------------------------------------------------------

class NewbornBeddingSellerAgent implements AgentHandler {
  readonly id: string;

  constructor(
    private readonly seller: SellerScenario,
    private readonly intent: ExecutableIntent,
  ) {
    this.id = `seller-agent-${seller.sellerId}`;
  }

  async handle(event: AgentEvent): Promise<NewAgentEvent[]> {
    if (event.type !== "evidence.requested") return [];
    // 只处理发给自己的请求（A2A 定向）
    if (event.target !== this.seller.sellerId) return [];

    // 把自身场景凭证映射为协议层证据文档（保留全部结构化字段）
    const documents = this.seller.credentials.map((credential) =>
      credentialToDocument(credential),
    );

    return [
      {
        transactionId: event.transactionId,
        type: "evidence.submitted",
        source: this.id,
        target: WORKFLOW_ACTORS.evaluator,
        payload: {
          sellerId: this.seller.sellerId,
          intentId: this.intent.intentId,
          documents,
          answers: answerQuestions(this.seller, this.intent),
        },
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Agent 4：EvidenceEvaluatorAgent
// 收齐 3 个 evidence.submitted 后，发布验证后评分（×3，A、B、C）。
// ---------------------------------------------------------------------------

class EvidenceEvaluatorAgent implements AgentHandler {
  readonly id = WORKFLOW_ACTORS.evaluator;
  // 按 transactionId 隔离：记录每笔交易已收到提交的 sellerId
  private readonly submitted = new Map<string, Set<string>>();

  constructor(private readonly sellers: SellerScenario[]) {}

  async handle(event: AgentEvent): Promise<NewAgentEvent[]> {
    if (event.type !== "evidence.submitted") return [];

    const seen = this.submitted.get(event.transactionId) ?? new Set<string>();
    seen.add(event.payload.sellerId);
    this.submitted.set(event.transactionId, seen);

    if (seen.size < this.sellers.length) return [];

    // 收齐三家：清理状态
    this.submitted.delete(event.transactionId);

    // 发布验证后评分（A、B、C），source=evaluator，供 AutoPurchaseAgent 区分"验证后"批次
    return this.sellers.map((seller) => ({
      transactionId: event.transactionId,
      type: "seller.score.updated" as const,
      source: this.id,
      target: seller.sellerId,
      payload: { ...seller.postVerificationScore },
    }));
  }
}

// ---------------------------------------------------------------------------
// Agent 5：AutoPurchaseAgent
// 收齐 3 个"验证后"评分后，按意图条件计算合格卖家，选最高分授权。不硬编码选 C。
// ---------------------------------------------------------------------------

class AutoPurchaseAgent implements AgentHandler {
  readonly id = WORKFLOW_ACTORS.autoPurchase;
  // 按 transactionId 隔离：累积每笔交易的验证后评分
  private readonly postScores = new Map<string, SellerScoreVector[]>();

  constructor(
    private readonly intent: ExecutableIntent,
    private readonly sellers: SellerScenario[],
  ) {}

  async handle(event: AgentEvent): Promise<NewAgentEvent[]> {
    if (event.type !== "seller.score.updated") return [];
    // 仅统计"验证后"评分：验证前评分由 buyer 发布，验证后由 evaluator 发布
    if (event.source !== WORKFLOW_ACTORS.evaluator) return [];

    const scores = this.postScores.get(event.transactionId) ?? [];
    scores.push({ ...event.payload });
    this.postScores.set(event.transactionId, scores);

    if (scores.length < this.sellers.length) return [];

    // 收齐三家验证后评分：清理状态
    this.postScores.delete(event.transactionId);

    // 逐个卖家检查自动购买条件，挑出合格者
    const eligible = scores.filter((score) => this.isEligible(score));

    // 从合格者里选 totalScore 最高的（并列时取先出现者，保持确定性）
    const winner = eligible.reduce<SellerScoreVector | null>((best, current) => {
      if (!best) return current;
      return current.totalScore > best.totalScore ? current : best;
    }, null);

    // 没有任何合格卖家：不产生授权（本场景不会发生，但逻辑上要成立）
    if (!winner) return [];

    const winnerScenario = this.sellers.find(
      (seller) => seller.sellerId === winner.sellerId,
    );
    if (!winnerScenario) return [];

    return [
      {
        transactionId: event.transactionId,
        type: "order.authorized",
        source: this.id,
        target: winner.sellerId,
        payload: {
          intentId: this.intent.intentId,
          sellerId: winner.sellerId,
          authorizedAmountUsd: winnerScenario.finalPriceUsd,
          scoreSnapshot: { ...winner },
          autoApproved: this.intent.autoPurchasePolicy.enabled,
        },
      },
    ];
  }

  /**
   * 判定某卖家是否满足自动购买全部硬性条件。
   * 逐条对照意图与自动购买协议，任何一条不满足即淘汰。
   */
  private isEligible(score: SellerScoreVector): boolean {
    const scenario = this.sellers.find(
      (seller) => seller.sellerId === score.sellerId,
    );
    if (!scenario) return false;

    const policy = this.intent.autoPurchasePolicy;

    // 1) 未被淘汰
    if (score.stage === "rejected") return false;
    // 2) 风险低于意图风险阈值
    if (score.riskScore >= this.intent.riskThreshold) return false;
    // 3) 综合总分达标
    if (score.totalScore < policy.minTotalScore) return false;
    // 4) 信任分达标
    if (score.trustScore < policy.minTrustScore) return false;
    // 5) 最终成交价不超过自动成交上限
    if (scenario.finalPriceUsd > policy.maxAutoSpendUsd) return false;
    // 6) 交期不超过意图上限
    if (scenario.deliveryHours > this.intent.deadlineHours) return false;
    // 7) 所有 mandatory 证据齐备且类型与要求匹配
    if (policy.requireAllMandatoryEvidence && !this.hasAllMandatoryEvidence(scenario)) {
      return false;
    }

    return true;
  }

  /**
   * 校验某卖家是否提供了意图要求的**全部** mandatory 证据，
   * 且每张凭证的类型与对应 requirement 的 kind 一致。
   */
  private hasAllMandatoryEvidence(scenario: SellerScenario): boolean {
    const mandatory = this.intent.evidenceRequirements.filter(
      (requirement) => requirement.mandatory,
    );

    return mandatory.every((requirement) => {
      const credential = scenario.credentials.find(
        (item) => item.requirementId === requirement.id,
      );
      // 必须存在、可验证、且类型与要求匹配
      return (
        credential !== undefined &&
        credential.verificationStatus === "demo-verifiable" &&
        credential.type === requirement.kind
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Agent 6：ReceiptIssuerAgent
// 收到 order.authorized 后签发 receipt.issued，evidenceSnapshotHash 用 crypto
// 对赢家已提交证据的 contentHash 排序后聚合计算 SHA-256。
// ---------------------------------------------------------------------------

class ReceiptIssuerAgent implements AgentHandler {
  readonly id = WORKFLOW_ACTORS.receiptIssuer;

  constructor(
    private readonly sellers: SellerScenario[],
    // 可注入的时间源，便于测试确定性；默认取当前时间
    private readonly now: () => Date,
  ) {}

  async handle(event: AgentEvent): Promise<NewAgentEvent[]> {
    if (event.type !== "order.authorized") return [];
    const authorized = event.payload;

    const winner = this.sellers.find(
      (seller) => seller.sellerId === authorized.sellerId,
    );
    if (!winner) return [];

    return [
      {
        transactionId: event.transactionId,
        type: "receipt.issued",
        source: this.id,
        target: winner.sellerId,
        payload: {
          receiptId: `receipt-${event.transactionId}-${winner.sellerId}`,
          intentId: authorized.intentId,
          sellerId: winner.sellerId,
          amountUsd: authorized.authorizedAmountUsd,
          deliveryHours: winner.deliveryHours,
          evidenceSnapshotHash: computeEvidenceSnapshotHash(winner),
          issuedAt: this.now().toISOString(),
        },
      },
    ];
  }
}

/**
 * 用 Node.js crypto 对某卖家已提交证据的 contentHash 排序后聚合，计算 SHA-256。
 * 排序保证与提交顺序无关的确定性；结果作为回执的证据快照哈希，供事后复算核验。
 * 导出以便测试可独立重算并比对，杜绝固定占位字符串。
 */
export function computeEvidenceSnapshotHash(seller: SellerScenario): string {
  const contentHashes = seller.credentials
    .map((credential) => credential.hash)
    .sort();

  return createHash("sha256").update(contentHashes.join("\n")).digest("hex");
}

// ---------------------------------------------------------------------------
// 注册与运行入口
// ---------------------------------------------------------------------------

/** 注册工作流的可选项。 */
export interface NewbornBeddingWorkflowOptions {
  // 每步事件之间的播放间隔（毫秒），现场 Demo 可设正值制造节奏；测试用 0
  stepDelayMs?: number;
  // 可注入的 sleep 实现，便于测试用零延迟或 fake timer
  sleep?: (ms: number) => Promise<void>;
  // 可注入的时间源，便于测试稳定 issuedAt；默认 () => new Date()
  now?: () => Date;
}

/** registerNewbornBeddingWorkflow 的返回句柄。 */
export interface NewbornBeddingWorkflowHandle {
  // 本次注册使用的意图（与卖家共享同一份场景快照）
  intent: ExecutableIntent;
  // 本次注册使用的卖家场景快照
  sellers: SellerScenario[];
}

/** 默认 sleep：基于 setTimeout。 */
function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 把新生儿床品工作流的全部 Agent 订阅到给定 router。
 *
 * 使用一份固定的场景快照（createNewbornBeddingScenario）构造所有 Agent，
 * 保证同一 router 上多笔交易共享同一套确定性规则；跨交易的中间状态由各 Agent
 * 内部按 transactionId 隔离并在收尾时清理。
 *
 * 注：stepDelayMs/sleep 目前用于外部运行入口（runNewbornBeddingWorkflow）控制
 * 意图发布前的起播节奏；Agent 内部处理保持同步确定性，避免打乱事件顺序。
 */
export function registerNewbornBeddingWorkflow(
  router: EventRouter,
  options: NewbornBeddingWorkflowOptions = {},
): NewbornBeddingWorkflowHandle {
  const scenario = createNewbornBeddingScenario();
  const { intent, sellers } = scenario;
  const now = options.now ?? (() => new Date());

  const matcher = new MarketplaceMatcherAgent(sellers);
  const buyer = new BuyerEvidenceAgent(intent, sellers);
  const evaluator = new EvidenceEvaluatorAgent(sellers);
  const autoPurchase = new AutoPurchaseAgent(intent, sellers);
  const receiptIssuer = new ReceiptIssuerAgent(sellers, now);
  const sellerAgents = sellers.map(
    (seller) => new NewbornBeddingSellerAgent(seller, intent),
  );

  // intent.published → 匹配
  router.subscribe("intent.published", matcher);
  // seller.matched → 买家收齐后发起询证
  router.subscribe("seller.matched", buyer);
  // evidence.requested → 各卖家定向作答
  for (const sellerAgent of sellerAgents) {
    router.subscribe("evidence.requested", sellerAgent);
  }
  // evidence.submitted → 评估器收齐后发布验证后评分
  router.subscribe("evidence.submitted", evaluator);
  // seller.score.updated → 自动购买决策（内部只认验证后评分）
  router.subscribe("seller.score.updated", autoPurchase);
  // order.authorized → 签发回执
  router.subscribe("order.authorized", receiptIssuer);

  return { intent, sellers };
}

/**
 * 运行一笔完整交易：发布 intent.published 作为起点，其余事件由已注册的 Agent 自动派生。
 *
 * 必须先对同一 router 调用过 registerNewbornBeddingWorkflow。router.publish 会等到
 * 事件队列彻底空闲才 resolve，因此本函数 await 返回时，18 个事件已全部落库。
 *
 * @param router 已注册工作流的事件路由
 * @param transactionId 本笔交易的隔离 id
 * @param options 可选的起播延迟/时间注入（与注册项一致）
 */
export async function runNewbornBeddingWorkflow(
  router: EventRouter,
  transactionId: string,
  options: NewbornBeddingWorkflowOptions = {},
): Promise<void> {
  const intent = createNewbornBeddingScenario().intent;
  const sleep = options.sleep ?? defaultSleep;

  // 起播节奏：现场 Demo 可用 stepDelayMs 制造停顿；测试传 0 即无等待
  await sleep(options.stepDelayMs ?? 0);

  await router.publish({
    transactionId,
    type: "intent.published",
    source: WORKFLOW_ACTORS.buyer,
    target: WORKFLOW_ACTORS.matcher,
    payload: intent,
  });
}

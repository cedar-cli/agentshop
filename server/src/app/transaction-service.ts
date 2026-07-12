import { randomUUID } from "node:crypto";
import {
  activeServiceDefinitions,
  type ActiveServiceSnapshot,
} from "./active-services.js";
import {
  fixtureInboxMessages,
  type InboxMessage,
  type InboxUpdate,
} from "./inbox.js";
import { BuyerAgent } from "../agents/buyer-agent.js";
import type { EvidenceAnswerGenerator } from "../agents/evidence-answer-generator.js";
import type { ProposalGenerator } from "../agents/proposal-generator.js";
import type { CounterNegotiator } from "../agents/counter-negotiator.js";
import type { LaptopLlmAgent } from "../llm/laptop-agent.js";
import type { DelegationLlmAgent } from "../llm/delegation-agent.js";
import type { ActiveSalesLlmAgent } from "../llm/active-sales-agent.js";
import type { DemandNetworkLlmAgent } from "../llm/demand-network-agent.js";
import type { DemandNeedFact } from "../llm/demand-network-agent.js";
import type { IntentGrowthLlmAgent } from "../llm/intent-growth-agent.js";
import { SellerAgent } from "../agents/seller-agent.js";
import {
  sellerProfiles,
  type SellerProfile,
} from "../agents/seller-profiles.js";
import type {
  ConsumerDelegationRequest,
  DemandNetworkRequest,
  ExecutableIntent,
  LaptopPurchaseRequested,
  PurchaseRequest,
  RestockIntent,
} from "../protocol/events.js";
import { EventRouter } from "../router/event-router.js";
import {
  createNewbornBeddingScenario,
  type NewbornBeddingScenario,
} from "../scenario/newborn-bedding.js";
import {
  registerNewbornBeddingWorkflow,
  runNewbornBeddingWorkflow,
} from "../scenario/newborn-bedding-workflow.js";
import {
  completeApprovedLaptopPurchase,
  runLaptopPurchaseUntilApproval,
  type LaptopApprovalState,
} from "../scenario/laptop-purchase-workflow.js";
import { runDelegationPurchase } from "../scenario/delegation-purchase-workflow.js";
import {
  createRestockIntent,
  runHouseholdRestockWorkflow,
} from "../scenario/household-restock-workflow.js";
import {
  activeSalesProduct,
  runActiveSalesWorkflow,
} from "../scenario/active-sales-workflow.js";
import { runDemandNetworkWorkflow } from "../scenario/demand-network-workflow.js";
import {
  intentGrowthProduct,
  runIntentGrowthWorkflow,
} from "../scenario/intent-growth-workflow.js";
import { SseHub, type SseListener } from "../server/sse-hub.js";
import { EventStore, type StoredEvent } from "../store/event-store.js";
import {
  projectMerchantTransaction,
  type MerchantTransactionProjection,
} from "./merchant-transactions.js";

export type TransactionStatus =
  "queued" | "running" | "awaiting-approval" | "completed" | "failed";

/**
 * 交易类型：
 *  - purchase：现有的普通采购交易，request 为 PurchaseRequest。
 *  - newborn-bedding-demo：新生儿床品 A2A 演示，request 为可执行意图 ExecutableIntent。
 */
export type TransactionKind =
  | "purchase"
  | "newborn-bedding-demo"
  | "laptop-demo"
  | "consumer-delegation"
  | "household-restock-demo"
  | "active-sales-demo"
  | "demand-network-demo"
  | "intent-growth-demo";

interface TransactionRecord {
  id: string;
  kind: TransactionKind;
  status: TransactionStatus;
  // 采购交易存 PurchaseRequest；Demo 交易存 ExecutableIntent（意图即请求）
  request:
    | PurchaseRequest
    | ExecutableIntent
    | LaptopPurchaseRequested
    | ConsumerDelegationRequest
    | RestockIntent
    | DemandNetworkRequest
    | { productId: string };
  error?: string;
}

export interface TransactionSnapshot extends TransactionRecord {
  events: StoredEvent[];
  chainValid: boolean;
}

export interface TransactionSummary extends TransactionRecord {
  eventCount: number;
}

export interface MerchantTransactionUpdate {
  sequence: number;
  type: "merchant.transaction.upserted";
  transaction: MerchantTransactionProjection;
}

export interface TransactionServiceOptions {
  databaseFilename: string;
  proposalGenerator: ProposalGenerator;
  // 砍价决策器（可选）：缺省时 SellerAgent 内部使用规则兜底决策
  counterNegotiator?: CounterNegotiator;
  profiles?: SellerProfile[];
  // 新生儿床品 Demo 的逐事件播放间隔（毫秒）。默认 0：不加节奏，尽快完成。
  // 生产入口（server.ts）会传 500 左右，让 18 个事件约 8-10 秒完成便于现场演示；
  // 测试必须传 0，避免真实等待。
  newbornBeddingStepDelayMs?: number;
  // 可注入的 Seller C 询证回答生成器。默认不注入 → 三家卖家全部走规则兜底。
  // server.ts 依 DEMO_LLM_ENABLED 决定是否传入 OpenAI 实现；测试可传桩实现。
  sellerCAnswerGenerator?: EvidenceAnswerGenerator;
  laptopLlmAgent?: LaptopLlmAgent;
  // 通用委托 LLM Agent：新建委托任务走真实搜索采购工作流时使用。
  // 缺省则委托工作流全程走确定性兜底（仍会真实检索商品，只是不调 LLM 生成文案）。
  delegationLlmAgent?: DelegationLlmAgent;
  activeSalesLlmAgent?: ActiveSalesLlmAgent;
  activeSalesDecisionDelayMs?: number;
  demandNetworkLlmAgent?: DemandNetworkLlmAgent;
  intentGrowthLlmAgent?: IntentGrowthLlmAgent;
  intentGrowthStepDelayMs?: number;
}

export class TransactionService {
  private readonly store: EventStore;
  private readonly router: EventRouter;
  private readonly hub = new SseHub();
  private readonly transactions = new Map<string, TransactionRecord>();
  private readonly buyer: BuyerAgent;
  // Demo 逐事件播放间隔（毫秒），构造时确定，全部 Demo 交易共用
  private readonly newbornBeddingStepDelayMs: number;
  private readonly laptopLlmAgent?: LaptopLlmAgent;
  private readonly delegationLlmAgent?: DelegationLlmAgent;
  private readonly activeSalesLlmAgent?: ActiveSalesLlmAgent;
  private readonly activeSalesDecisionDelayMs: number;
  private readonly demandNetworkLlmAgent?: DemandNetworkLlmAgent;
  private readonly intentGrowthLlmAgent?: IntentGrowthLlmAgent;
  private readonly intentGrowthStepDelayMs: number;
  private readonly proposalGenerator: ProposalGenerator;
  private readonly counterNegotiator?: CounterNegotiator;
  private readonly laptopApprovals = new Map<string, LaptopApprovalState>();
  private readonly activeServiceTransactions = new Map<string, string>();
  private readonly inboxMessages = new Map(
    fixtureInboxMessages.map((message) => [
      message.id,
      { ...message, evidence: [...message.evidence] },
    ]),
  );
  private readonly inboxListeners = new Set<(update: InboxUpdate) => void>();
  private readonly merchantTransactionListeners = new Set<
    (update: MerchantTransactionUpdate) => void
  >();
  private readonly consumerMarketNeeds = new Map<string, DemandNeedFact>();
  private inboxSequence = 0;
  private merchantTransactionSequence = 0;

  constructor(options: TransactionServiceOptions) {
    const profiles = options.profiles ?? sellerProfiles;
    this.newbornBeddingStepDelayMs = options.newbornBeddingStepDelayMs ?? 0;
    this.laptopLlmAgent = options.laptopLlmAgent;
    this.delegationLlmAgent = options.delegationLlmAgent;
    this.activeSalesLlmAgent = options.activeSalesLlmAgent;
    this.activeSalesDecisionDelayMs = Math.max(
      0,
      options.activeSalesDecisionDelayMs ?? 0,
    );
    this.demandNetworkLlmAgent = options.demandNetworkLlmAgent;
    this.intentGrowthLlmAgent = options.intentGrowthLlmAgent;
    this.intentGrowthStepDelayMs = Math.max(
      0,
      options.intentGrowthStepDelayMs ?? 0,
    );
    this.proposalGenerator = options.proposalGenerator;
    this.counterNegotiator = options.counterNegotiator;
    this.store = new EventStore(options.databaseFilename);
    this.router = new EventRouter(this.store);
    this.buyer = new BuyerAgent(profiles.length);

    this.router.subscribe("purchase.requested", this.buyer);
    this.router.subscribe("proposal.submitted", this.buyer);
    this.router.subscribe("seller.selected", this.buyer);
    // 买家在收到卖家还价应答后据此确认订单
    this.router.subscribe("counter.response", this.buyer);

    for (const profile of profiles) {
      const seller = new SellerAgent(
        profile,
        options.proposalGenerator,
        options.counterNegotiator,
      );
      // 卖家既要能报价，也要能应答买家的还价
      this.router.subscribe("purchase.requested", seller);
      this.router.subscribe("counter.offer", seller);
    }

    // 复用同一个 EventRouter 注册新生儿床品 A2A 工作流的全部 Agent，
    // 不新建第二套 Router/Store/SSE。Demo 与采购流程共享这一条事件总线。
    // Seller C 的询证回答生成器由外部注入（可能是 LLM，也可能缺省为规则兜底）。
    registerNewbornBeddingWorkflow(this.router, {
      stepDelayMs: this.newbornBeddingStepDelayMs,
      sellerCAnswerGenerator: options.sellerCAnswerGenerator,
    });

    this.router.observe((event) => {
      this.hub.publish(event);
      this.captureConsumerMarketNeed(event);
      this.projectActiveSalesProposal(event);
      this.publishMerchantTransaction(event.transactionId);
    });
  }

  /**
   * 创建一笔普通采购交易（保留原有行为）。
   * @param request 采购请求
   * @returns 新交易的 transactionId
   */
  create(request: PurchaseRequest): string {
    return this.enqueue("purchase", request);
  }

  /**
   * 创建并异步运行一次新生儿床品 A2A 演示交易。
   * 使用 createNewbornBeddingScenario().intent 作为交易的 intent/request，
   * 经历 queued → running → completed/failed，产生任务三的 18 个事件。
   * @returns 新 Demo 交易的 transactionId（每次调用都不同，可重复运行）
   */
  createNewbornBeddingDemo(): string {
    const intent = createNewbornBeddingScenario().intent;
    return this.enqueue("newborn-bedding-demo", intent);
  }

  createLaptopDemo(requestText: string): string {
    return this.enqueue("laptop-demo", { requestText });
  }

  /**
   * 新增一笔买家委托任务：用户给出完整购物意图（可选主动服务方式），
   * 由消费 Agent 全自动接管——真实 LLM 解析意图、比较报价、议价，
   * 并在授权阈值内自动下单、履约、鉴证，全程无需人工点击确认。
   * @param request 完整购物意图与可选主动服务方式
   * @returns 新委托交易的 transactionId（每次不同，可重复发起）
   */
  createConsumerDelegation(request: ConsumerDelegationRequest): string {
    return this.enqueue("consumer-delegation", request);
  }

  createHouseholdRestockDemo(): string {
    return this.enqueue("household-restock-demo", createRestockIntent());
  }

  listSellerProducts() {
    return [
      {
        id: activeSalesProduct.id,
        name: activeSalesProduct.name,
        category: activeSalesProduct.category,
        priceUsd: activeSalesProduct.priceUsd,
        stock: activeSalesProduct.stock,
        sourceCoverage: 58,
        status: "online" as const,
      },
    ];
  }

  createActiveSalesDemo(productId: string): string | undefined {
    if (productId !== activeSalesProduct.id) return undefined;
    return this.enqueue("active-sales-demo", { productId });
  }

  createDemandNetworkDemo(request: DemandNetworkRequest): string {
    return this.enqueue("demand-network-demo", request);
  }

  createIntentGrowthDemo(): string {
    return this.enqueue("intent-growth-demo", {
      productId: intentGrowthProduct.productId,
    });
  }

  listMerchantTransactions(): MerchantTransactionProjection[] {
    return [...this.transactions.keys()]
      .map((transactionId) => this.get(transactionId))
      .filter((snapshot): snapshot is TransactionSnapshot => Boolean(snapshot))
      .map(projectMerchantTransaction)
      .filter((transaction): transaction is MerchantTransactionProjection =>
        Boolean(transaction),
      )
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      );
  }

  subscribeMerchantTransactions(
    listener: (update: MerchantTransactionUpdate) => void,
  ): () => void {
    this.merchantTransactionListeners.add(listener);
    return () => this.merchantTransactionListeners.delete(listener);
  }

  listActiveServices(): ActiveServiceSnapshot[] {
    return activeServiceDefinitions.map((definition) => {
      const transactionId = this.activeServiceTransactions.get(definition.id);
      if (!transactionId) return { ...definition, flow: [...definition.flow] };
      const transaction = this.get(transactionId);
      if (!transaction) return { ...definition, flow: [...definition.flow] };
      const status =
        transaction.status === "completed"
          ? "completed"
          : transaction.status === "failed"
            ? "failed"
            : "executing";
      const order = transaction.events.find(
        (event) => event.type === "restock.order.confirmed",
      );
      const totalPriceCny =
        order?.type === "restock.order.confirmed"
          ? order.payload.totalPriceCny
          : undefined;
      return {
        ...definition,
        flow: [...definition.flow],
        status,
        statusLabel:
          status === "completed"
            ? "自动完成"
            : status === "failed"
              ? "执行失败"
              : "自主执行中",
        signal:
          totalPriceCny === undefined
            ? definition.signal
            : `刚刚自动成交 ¥${totalPriceCny}`,
        transactionId,
        transactionStatus: transaction.status,
        eventCount: transaction.events.length,
        chainValid: transaction.chainValid,
      };
    });
  }

  triggerActiveService(serviceId: string): string | undefined {
    const definition = activeServiceDefinitions.find(
      (item) => item.id === serviceId,
    );
    if (!definition) return undefined;
    if (!definition.triggerable)
      throw new Error("active_service_not_triggerable");
    const currentId = this.activeServiceTransactions.get(serviceId);
    const current = currentId ? this.transactions.get(currentId) : undefined;
    if (
      current &&
      (current.status === "queued" || current.status === "running")
    )
      return current.id;
    const transactionId = this.createHouseholdRestockDemo();
    this.activeServiceTransactions.set(serviceId, transactionId);
    return transactionId;
  }

  listInboxMessages(): InboxMessage[] {
    return [...this.inboxMessages.values()]
      .map((message) => ({ ...message, evidence: [...message.evidence] }))
      .sort(
        (left, right) =>
          Date.parse(right.receivedAt) - Date.parse(left.receivedAt),
      );
  }

  subscribeInbox(listener: (update: InboxUpdate) => void): () => void {
    this.inboxListeners.add(listener);
    return () => this.inboxListeners.delete(listener);
  }

  updateInboxMemory(
    messageId: string,
    recommended: boolean,
  ): InboxMessage | undefined {
    const current = this.inboxMessages.get(messageId);
    if (!current) return undefined;
    const message = { ...current, memoryRecommended: recommended };
    this.inboxMessages.set(messageId, message);
    this.publishInbox("inbox.message.updated", message);
    return { ...message, evidence: [...message.evidence] };
  }

  archiveInboxMessage(messageId: string): InboxMessage | undefined {
    const current = this.inboxMessages.get(messageId);
    if (!current) return undefined;
    const message = { ...current, status: "archived" as const };
    this.inboxMessages.set(messageId, message);
    this.publishInbox("inbox.message.updated", message);
    return { ...message, evidence: [...message.evidence] };
  }

  async approveLaptopDemo(
    transactionId: string,
  ): Promise<TransactionSnapshot | undefined> {
    const transaction = this.transactions.get(transactionId);
    const approval = this.laptopApprovals.get(transactionId);
    if (!transaction || transaction.kind !== "laptop-demo") return undefined;
    if (transaction.status === "completed") return this.get(transactionId);
    if (transaction.status !== "awaiting-approval" || !approval) {
      throw new Error("transaction_not_awaiting_approval");
    }
    transaction.status = "running";
    this.publishMerchantTransaction(transactionId);
    try {
      await completeApprovedLaptopPurchase(
        this.router,
        transactionId,
        approval,
      );
      transaction.status = "completed";
      this.laptopApprovals.delete(transactionId);
      this.publishMerchantTransaction(transactionId);
      return this.get(transactionId);
    } catch (error) {
      transaction.status = "failed";
      transaction.error =
        error instanceof Error ? error.message : String(error);
      this.publishMerchantTransaction(transactionId);
      throw error;
    }
  }

  /**
   * 返回一份**全新**的新生儿床品静态场景数据（意图 + 卖家），供 API 只读展示。
   * 每次调用深构造，不暴露任何内部可变引用。
   */
  getNewbornBeddingScenario(): NewbornBeddingScenario {
    return createNewbornBeddingScenario();
  }

  get(transactionId: string): TransactionSnapshot | undefined {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) return undefined;

    return {
      ...transaction,
      events: this.store.list(transactionId),
      chainValid: this.store.verify(transactionId),
    };
  }

  list(): TransactionSummary[] {
    return Array.from(this.transactions.values())
      .map((transaction) => ({
        ...transaction,
        eventCount: this.store.list(transaction.id).length,
      }))
      .reverse();
  }

  subscribe(transactionId: string, listener: SseListener): () => void {
    return this.hub.subscribe(transactionId, listener);
  }

  has(transactionId: string): boolean {
    return this.transactions.has(transactionId);
  }

  close(): void {
    this.store.close();
  }

  /**
   * 登记一笔交易并调度其异步运行。两类交易共用同一登记/调度路径，
   * 仅在实际执行时按 kind 分派到不同工作流。
   */
  private enqueue(
    kind: TransactionKind,
    request:
      | PurchaseRequest
      | ExecutableIntent
      | LaptopPurchaseRequested
      | RestockIntent
      | DemandNetworkRequest
      | { productId: string },
  ): string {
    const transactionId = `tx-${randomUUID()}`;
    this.transactions.set(transactionId, {
      id: transactionId,
      kind,
      status: "queued",
      request,
    });

    setImmediate(() => void this.run(transactionId));
    return transactionId;
  }

  private async run(transactionId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) return;

    transaction.status = "running";
    this.publishMerchantTransaction(transactionId);

    try {
      if (transaction.kind === "newborn-bedding-demo") {
        // Demo：调用已注册的工作流入口，逐步产生 18 个事件（不复制业务逻辑到此层）
        await runNewbornBeddingWorkflow(this.router, transactionId);
      } else if (transaction.kind === "laptop-demo") {
        const approval = await runLaptopPurchaseUntilApproval(
          this.router,
          transactionId,
          (transaction.request as LaptopPurchaseRequested).requestText,
          this.laptopLlmAgent,
        );
        this.laptopApprovals.set(transactionId, approval);
        transaction.status = "awaiting-approval";
        this.publishMerchantTransaction(transactionId);
        return;
      } else if (transaction.kind === "consumer-delegation") {
        // 委托任务：走「通用真实搜索采购」工作流——先按用户意图从数据集检索真实商品作为候选，
        // 再对真实候选比较、议价、下单、履约、上链，全程无需人工确认，由消费 Agent 在授权内自动完成。
        // serviceMode（@ 选择的主动服务方式）本期透传记录，不改变工作流行为。
        const delegationRequest = transaction.request as ConsumerDelegationRequest;
        const serviceMode = delegationRequest.serviceMode ?? "auto";
        await runDelegationPurchase(
          this.router,
          transactionId,
          delegationRequest.requestText,
          serviceMode,
          this.delegationLlmAgent,
        );
      } else if (transaction.kind === "household-restock-demo") {
        await runHouseholdRestockWorkflow(
          this.router,
          transactionId,
          this.proposalGenerator,
          this.counterNegotiator,
        );
        this.projectRestockInbox(transactionId);
      } else if (transaction.kind === "active-sales-demo") {
        await runActiveSalesWorkflow(
          this.router,
          transactionId,
          this.activeSalesLlmAgent,
          this.activeSalesDecisionDelayMs,
        );
        this.projectActiveSalesCompletion(transactionId);
      } else if (transaction.kind === "demand-network-demo") {
        await runDemandNetworkWorkflow(
          this.router,
          transactionId,
          transaction.request as DemandNetworkRequest,
          this.demandNetworkLlmAgent,
          [...this.consumerMarketNeeds.values()],
        );
      } else if (transaction.kind === "intent-growth-demo") {
        await runIntentGrowthWorkflow(
          this.router,
          transactionId,
          this.intentGrowthLlmAgent,
          this.intentGrowthStepDelayMs,
        );
      } else {
        // 采购：保留原有发布 purchase.requested 的行为
        await this.router.publish({
          transactionId,
          type: "purchase.requested",
          source: this.buyer.id,
          payload: transaction.request as PurchaseRequest,
        });
      }
      transaction.status = "completed";
      this.publishMerchantTransaction(transactionId);
    } catch (error) {
      transaction.status = "failed";
      transaction.error =
        error instanceof Error ? error.message : String(error);
      this.publishMerchantTransaction(transactionId);
    }
  }

  private projectRestockInbox(transactionId: string): void {
    const snapshot = this.get(transactionId);
    if (!snapshot) return;
    const order = snapshot.events.find(
      (event) => event.type === "restock.order.confirmed",
    );
    const authorization = snapshot.events.find(
      (event) => event.type === "restock.order.authorized",
    );
    const memory = snapshot.events.find(
      (event) => event.type === "restock.memory.updated",
    );
    if (
      order?.type !== "restock.order.confirmed" ||
      authorization?.type !== "restock.order.authorized"
    )
      return;
    const llmCount = snapshot.events.filter(
      (event) =>
        "generatedBy" in event.payload && event.payload.generatedBy === "llm",
    ).length;
    const fallbackCount = snapshot.events.filter(
      (event) =>
        "generatedBy" in event.payload &&
        event.payload.generatedBy === "fallback",
    ).length;
    const message: InboxMessage = {
      id: `inbox-restock-${transactionId}`,
      type: "completed",
      source: "active-service",
      runtime: "live",
      status: "unread",
      merchant: "家庭补库 C-Agent",
      title: "家庭补库已自动完成",
      receivedAt: new Date().toISOString(),
      category: "日用百货",
      offer: `成交 ¥${order.payload.totalPriceCny} · ${order.payload.displayName} · 无需操作`,
      evidence: [
        `长期授权校验通过 · 人类交互 ${authorization.payload.humanInteractions} 次`,
        `真实模型参与 ${llmCount} 次 · fallback ${fallbackCount} 次`,
        snapshot.chainValid
          ? "交易事件 Hash Chain 已验证"
          : "交易事件 Hash Chain 验证失败",
      ],
      verdict: "valuable",
      verdictLabel: "自动完成",
      valueScore: 100,
      agentEvaluation:
        "Agent 在长期授权范围内完成库存预测、三家报价、组合议价和自动下单，仅在完成后发送摘要。",
      requiresAction: false,
      generatedBy: "rule",
      memoryRecommended: true,
      memoryReason:
        memory?.type === "restock.memory.updated"
          ? memory.payload.memory
          : "记录本次补库价格与消耗周期，用于下次预测。",
      relatedPurchaseId: "paper-restock",
      transactionId,
      chainValid: snapshot.chainValid,
    };
    this.inboxMessages.set(message.id, message);
    this.publishInbox("inbox.message.upserted", message);
  }

  private projectActiveSalesProposal(event: StoredEvent): void {
    if (
      event.type !== "active-sale.proposal.routed" ||
      event.payload.buyerId !== "mia"
    )
      return;
    const transactionId = event.transactionId;
    const passport = this.store
      .list(transactionId)
      .find((item) => item.type === "active-sale.passport.published");
    const message: InboxMessage = {
      id: `inbox-active-sale-${transactionId}`,
      type: "opportunity",
      source: "seller-agent",
      runtime: "live",
      status: "unread",
      merchant: "DeepLumen Seller Agent",
      title: "Seller Agent 提交低敏床品提案",
      receivedAt: event.timestamp,
      category: "母婴床品",
      offer: "$164 · 72 小时送达 · 等待 Consumer Agent 自动评估",
      evidence: [
        "提案通过 Open 授权 Inbox 路由",
        passport?.type === "active-sale.passport.published"
          ? `Product Passport ${passport.payload.coverageAfter}% · ${passport.payload.generatedBy.toUpperCase()}`
          : "Product Passport 已发布",
        `匹配分 ${event.payload.matchScore}`,
      ],
      verdict: "valuable",
      verdictLabel: "自动评估中",
      valueScore: event.payload.matchScore,
      agentEvaluation: event.payload.pitch,
      requiresAction: false,
      generatedBy: event.payload.generatedBy === "llm" ? "llm" : "rule",
      memoryRecommended: false,
      memoryReason: "成交前不写入长期记忆，等待 Consumer Agent 完成决策。",
      transactionId,
      chainValid: this.store.verify(transactionId),
    };
    this.inboxMessages.set(message.id, message);
    this.publishInbox("inbox.message.upserted", message);
  }

  private projectActiveSalesCompletion(transactionId: string): void {
    const snapshot = this.get(transactionId);
    if (!snapshot) return;
    const completed = snapshot.events.find(
      (event) => event.type === "active-sale.completed",
    );
    const proposal = snapshot.events.find(
      (event) =>
        event.type === "active-sale.proposal.routed" &&
        event.payload.buyerId === "mia",
    );
    const passport = snapshot.events.find(
      (event) => event.type === "active-sale.passport.published",
    );
    if (
      completed?.type !== "active-sale.completed" ||
      proposal?.type !== "active-sale.proposal.routed"
    )
      return;
    const pending = this.inboxMessages.get(
      `inbox-active-sale-${transactionId}`,
    );
    const message: InboxMessage = {
      id: `inbox-active-sale-${transactionId}`,
      type: "completed",
      source: "seller-agent",
      runtime: "live",
      status: "unread",
      merchant: "DeepLumen Seller Agent",
      title: "授权主动提案已自动成交",
      receivedAt: pending?.receivedAt ?? new Date().toISOString(),
      category: "母婴床品",
      offer: `$${completed.payload.amountUsd} · 72 小时送达 · 人类点击 ${completed.payload.humanClicks} 次`,
      evidence: [
        "主动提案仅经过 Open 授权 Inbox",
        passport?.type === "active-sale.passport.published"
          ? `Product Passport ${passport.payload.coverageAfter}% · ${passport.payload.generatedBy.toUpperCase()}`
          : "Product Passport 已验证",
        snapshot.chainValid
          ? "主动销售事件 Hash Chain 已验证"
          : "主动销售事件链验证失败",
      ],
      verdict: "valuable",
      verdictLabel: "自动成交",
      valueScore: proposal.payload.matchScore,
      agentEvaluation: pending?.agentEvaluation ?? proposal.payload.pitch,
      requiresAction: false,
      generatedBy: proposal.payload.generatedBy === "llm" ? "llm" : "rule",
      memoryRecommended: true,
      memoryReason:
        "记录低敏证据、三日送达和预算偏好，用于未来同类商品的授权判断。",
      transactionId,
      chainValid: snapshot.chainValid,
    };
    this.inboxMessages.set(message.id, message);
    this.publishInbox(
      pending ? "inbox.message.updated" : "inbox.message.upserted",
      message,
    );
  }

  private captureConsumerMarketNeed(event: StoredEvent): void {
    if (event.type === "laptop.intent.structured") {
      this.consumerMarketNeeds.set(event.transactionId, {
        id: `LIVE-${event.transactionId.slice(-6)}`,
        buyerType: "consumer",
        text: event.payload.requestText,
        source: "consumer-transaction",
        fallbackIntent: {
          scene: "出差轻薄本采购",
          quantity: 1,
          budgetUsd: Number((event.payload.budgetCny / 7.2).toFixed(2)),
          deadlineDays: event.payload.deadlineHours / 24,
          requirements: [
            `重量 ≤${event.payload.maxWeightKg}kg`,
            `续航 ≥${event.payload.minBatteryHours}h`,
            event.payload.requiresNationalWarranty ? "全国联保" : "保修可选",
          ],
        },
      });
      return;
    }
    if (event.type === "restock.intent.created") {
      this.consumerMarketNeeds.set(event.transactionId, {
        id: `LIVE-${event.transactionId.slice(-6)}`,
        buyerType: "consumer",
        text: `${event.payload.product}；${event.payload.reason}`,
        source: "consumer-transaction",
        fallbackIntent: {
          scene: "家庭日用品自主补库",
          quantity: event.payload.quantity,
          budgetUsd: Number((event.payload.budgetCny / 7.2).toFixed(2)),
          deadlineDays: event.payload.deadlineHours / 24,
          requirements: event.payload.constraints,
        },
      });
      return;
    }
    if (event.type === "intent.published") {
      this.consumerMarketNeeds.set(event.transactionId, {
        id: `LIVE-${event.transactionId.slice(-6)}`,
        buyerType: "consumer",
        text: event.payload.productDescription,
        source: "consumer-transaction",
        fallbackIntent: {
          scene: "可执行消费意图",
          quantity: 1,
          budgetUsd: event.payload.budgetUsd,
          deadlineDays: event.payload.deadlineHours / 24,
          requirements: event.payload.evidenceRequirements.map(
            (requirement) => requirement.description,
          ),
        },
      });
    }
  }

  private publishMerchantTransaction(transactionId: string): void {
    if (this.merchantTransactionListeners.size === 0) return;
    const snapshot = this.get(transactionId);
    if (!snapshot) return;
    const transaction = projectMerchantTransaction(snapshot);
    if (!transaction) return;
    const update: MerchantTransactionUpdate = {
      sequence: ++this.merchantTransactionSequence,
      type: "merchant.transaction.upserted",
      transaction,
    };
    for (const listener of this.merchantTransactionListeners) listener(update);
  }

  private publishInbox(type: InboxUpdate["type"], message: InboxMessage): void {
    const update: InboxUpdate = {
      sequence: ++this.inboxSequence,
      type,
      message: { ...message, evidence: [...message.evidence] },
    };
    for (const listener of this.inboxListeners) listener(update);
  }
}

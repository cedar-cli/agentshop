import { randomUUID } from "node:crypto";
import { BuyerAgent } from "../agents/buyer-agent.js";
import type { ProposalGenerator } from "../agents/proposal-generator.js";
import type { CounterNegotiator } from "../agents/counter-negotiator.js";
import { SellerAgent } from "../agents/seller-agent.js";
import {
  sellerProfiles,
  type SellerProfile,
} from "../agents/seller-profiles.js";
import type { ExecutableIntent, PurchaseRequest } from "../protocol/events.js";
import { EventRouter } from "../router/event-router.js";
import {
  createNewbornBeddingScenario,
  type NewbornBeddingScenario,
} from "../scenario/newborn-bedding.js";
import {
  registerNewbornBeddingWorkflow,
  runNewbornBeddingWorkflow,
} from "../scenario/newborn-bedding-workflow.js";
import { SseHub, type SseListener } from "../server/sse-hub.js";
import { EventStore, type StoredEvent } from "../store/event-store.js";

export type TransactionStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

/**
 * 交易类型：
 *  - purchase：现有的普通采购交易，request 为 PurchaseRequest。
 *  - newborn-bedding-demo：新生儿床品 A2A 演示，request 为可执行意图 ExecutableIntent。
 */
export type TransactionKind = "purchase" | "newborn-bedding-demo";

interface TransactionRecord {
  id: string;
  kind: TransactionKind;
  status: TransactionStatus;
  // 采购交易存 PurchaseRequest；Demo 交易存 ExecutableIntent（意图即请求）
  request: PurchaseRequest | ExecutableIntent;
  error?: string;
}

export interface TransactionSnapshot extends TransactionRecord {
  events: StoredEvent[];
  chainValid: boolean;
}

export interface TransactionSummary extends TransactionRecord {
  eventCount: number;
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
}

export class TransactionService {
  private readonly store: EventStore;
  private readonly router: EventRouter;
  private readonly hub = new SseHub();
  private readonly transactions = new Map<string, TransactionRecord>();
  private readonly buyer: BuyerAgent;
  // Demo 逐事件播放间隔（毫秒），构造时确定，全部 Demo 交易共用
  private readonly newbornBeddingStepDelayMs: number;

  constructor(options: TransactionServiceOptions) {
    const profiles = options.profiles ?? sellerProfiles;
    this.newbornBeddingStepDelayMs = options.newbornBeddingStepDelayMs ?? 0;
    this.store = new EventStore(options.databaseFilename);
    this.router = new EventRouter(this.store);
    this.buyer = new BuyerAgent(profiles.length);

    this.router.subscribe("purchase.requested", this.buyer);
    this.router.subscribe("proposal.submitted", this.buyer);
    this.router.subscribe("seller.selected", this.buyer);
    // 买家在收到商家还价应答后据此确认订单
    this.router.subscribe("counter.response", this.buyer);

    for (const profile of profiles) {
      const seller = new SellerAgent(
        profile,
        options.proposalGenerator,
        options.counterNegotiator,
      );
      // 商家既要能报价，也要能应答买家的还价
      this.router.subscribe("purchase.requested", seller);
      this.router.subscribe("counter.offer", seller);
    }

    // 复用同一个 EventRouter 注册新生儿床品 A2A 工作流的全部 Agent，
    // 不新建第二套 Router/Store/SSE。Demo 与采购流程共享这一条事件总线。
    registerNewbornBeddingWorkflow(this.router, {
      stepDelayMs: this.newbornBeddingStepDelayMs,
    });

    this.router.observe((event) => this.hub.publish(event));
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
    request: PurchaseRequest | ExecutableIntent,
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

    try {
      if (transaction.kind === "newborn-bedding-demo") {
        // Demo：调用已注册的工作流入口，逐步产生 18 个事件（不复制业务逻辑到此层）
        await runNewbornBeddingWorkflow(this.router, transactionId);
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
    } catch (error) {
      transaction.status = "failed";
      transaction.error =
        error instanceof Error ? error.message : String(error);
    }
  }
}

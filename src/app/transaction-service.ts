import { randomUUID } from "node:crypto";
import { BuyerAgent } from "../agents/buyer-agent.js";
import type { ProposalGenerator } from "../agents/proposal-generator.js";
import type { CounterNegotiator } from "../agents/counter-negotiator.js";
import { SellerAgent } from "../agents/seller-agent.js";
import {
  sellerProfiles,
  type SellerProfile,
} from "../agents/seller-profiles.js";
import type { PurchaseRequest } from "../protocol/events.js";
import { EventRouter } from "../router/event-router.js";
import { SseHub, type SseListener } from "../server/sse-hub.js";
import { EventStore, type StoredEvent } from "../store/event-store.js";

export type TransactionStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

interface TransactionRecord {
  id: string;
  status: TransactionStatus;
  request: PurchaseRequest;
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
}

export class TransactionService {
  private readonly store: EventStore;
  private readonly router: EventRouter;
  private readonly hub = new SseHub();
  private readonly transactions = new Map<string, TransactionRecord>();
  private readonly buyer: BuyerAgent;

  constructor(options: TransactionServiceOptions) {
    const profiles = options.profiles ?? sellerProfiles;
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

    this.router.observe((event) => this.hub.publish(event));
  }

  create(request: PurchaseRequest): string {
    const transactionId = `tx-${randomUUID()}`;
    this.transactions.set(transactionId, {
      id: transactionId,
      status: "queued",
      request,
    });

    setImmediate(() => void this.run(transactionId));
    return transactionId;
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

  private async run(transactionId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) return;

    transaction.status = "running";

    try {
      await this.router.publish({
        transactionId,
        type: "purchase.requested",
        source: this.buyer.id,
        payload: transaction.request,
      });
      transaction.status = "completed";
    } catch (error) {
      transaction.status = "failed";
      transaction.error =
        error instanceof Error ? error.message : String(error);
    }
  }
}

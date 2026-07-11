import { randomUUID } from "node:crypto";
import type { AgentHandler } from "../agents/types.js";
import type {
  AgentEvent,
  AgentEventType,
  NewAgentEvent,
} from "../protocol/events.js";
import { agentEventSchema } from "../protocol/schemas.js";
import type { EventStore, StoredEvent } from "../store/event-store.js";

export type EventObserver = (event: StoredEvent) => void;
export type EventDelay = (ms: number) => Promise<void>;

interface TransactionPacing {
  delayMs: number;
  sleep: EventDelay;
  eventCount: number;
}

export class EventRouter {
  private readonly handlers = new Map<AgentEventType, AgentHandler[]>();
  private readonly observers = new Set<EventObserver>();
  private readonly queue: AgentEvent[] = [];
  private readonly pacing = new Map<string, TransactionPacing>();
  private readonly idleWaiters: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];
  private processing = false;

  constructor(private readonly store: EventStore) {}

  subscribe(type: AgentEventType, handler: AgentHandler): void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }

  observe(observer: EventObserver): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  configureTransactionPacing(
    transactionId: string,
    delayMs: number,
    sleep: EventDelay,
  ): void {
    this.pacing.set(transactionId, {
      delayMs: Math.max(0, delayMs),
      sleep,
      eventCount: 0,
    });
  }

  clearTransactionPacing(transactionId: string): void {
    this.pacing.delete(transactionId);
  }

  async publish<T extends AgentEventType>(event: NewAgentEvent<T>): Promise<void> {
    this.queue.push(this.materialize(event));

    const completion = new Promise<void>((resolve, reject) => {
      this.idleWaiters.push({ resolve, reject });
    });

    if (!this.processing) void this.drain();
    await completion;
  }

  private materialize<T extends AgentEventType>(
    event: NewAgentEvent<T>,
  ): AgentEvent<T> {
    const materialized = {
      ...event,
      id: event.id ?? randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
    } as unknown as AgentEvent<T>;

    return agentEventSchema.parse(materialized) as unknown as AgentEvent<T>;
  }

  private async drain(): Promise<void> {
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift();
        if (!event) continue;

        await this.applyPacing(event.transactionId);

        const stored = this.store.append(event);
        for (const observer of this.observers) observer(stored);

        const handlers = this.handlers.get(event.type) ?? [];
        const batches = await Promise.all(
          handlers.map((handler) => handler.handle(event)),
        );

        for (const nextEvent of batches.flat()) {
          this.queue.push(
            this.materialize({
              ...nextEvent,
              causationId: nextEvent.causationId ?? event.id,
            }),
          );
        }
      }
      this.resolveIdleWaiters();
    } catch (error) {
      this.queue.length = 0;
      this.rejectIdleWaiters(error);
    } finally {
      this.processing = false;
    }
  }

  private async applyPacing(transactionId: string): Promise<void> {
    const pacing = this.pacing.get(transactionId);
    if (!pacing) return;

    if (pacing.eventCount > 0 && pacing.delayMs > 0) {
      await pacing.sleep(pacing.delayMs);
    }
    pacing.eventCount += 1;
  }

  private resolveIdleWaiters(): void {
    for (const waiter of this.idleWaiters.splice(0)) waiter.resolve();
  }

  private rejectIdleWaiters(error: unknown): void {
    for (const waiter of this.idleWaiters.splice(0)) waiter.reject(error);
  }
}

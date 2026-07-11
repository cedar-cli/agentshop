import type { StoredEvent } from "../store/event-store.js";

export type SseListener = (event: StoredEvent) => void;

export class SseHub {
  private readonly listeners = new Map<string, Set<SseListener>>();

  publish(event: StoredEvent): void {
    const listeners = this.listeners.get(event.transactionId);
    if (!listeners) return;

    for (const listener of listeners) listener(event);
  }

  subscribe(transactionId: string, listener: SseListener): () => void {
    const listeners = this.listeners.get(transactionId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(transactionId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(transactionId);
    };
  }
}

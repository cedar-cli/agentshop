import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import type { AgentEvent, AgentEventType } from "../protocol/events.js";
import { agentEventSchema } from "../protocol/schemas.js";

interface StoredEventRow {
  sequence: number;
  id: string;
  transaction_id: string;
  type: AgentEventType;
  source: string;
  target: string | null;
  payload: string;
  causation_id: string | null;
  previous_hash: string;
  hash: string;
  created_at: string;
}

export type StoredEvent = AgentEvent & {
  sequence: number;
  previousHash: string;
  hash: string;
};

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${entries.join(",")}}`;
}

function calculateHash(event: AgentEvent, previousHash: string): string {
  return createHash("sha256")
    .update(
      stableStringify({
        id: event.id,
        transactionId: event.transactionId,
        type: event.type,
        source: event.source,
        target: event.target ?? null,
        timestamp: event.timestamp,
        causationId: event.causationId ?? null,
        payload: event.payload,
        previousHash,
      }),
    )
    .digest("hex");
}

export class EventStore {
  private readonly db: Database.Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        transaction_id TEXT NOT NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        target TEXT,
        payload TEXT NOT NULL,
        causation_id TEXT,
        previous_hash TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS events_transaction_sequence
        ON events (transaction_id, sequence);
    `);
  }

  append(event: AgentEvent): StoredEvent {
    const previous = this.db
      .prepare(
        `SELECT hash FROM events
         WHERE transaction_id = ?
         ORDER BY sequence DESC LIMIT 1`,
      )
      .get(event.transactionId) as { hash: string } | undefined;

    const previousHash = previous?.hash ?? "GENESIS";
    const hash = calculateHash(event, previousHash);

    const result = this.db
      .prepare(
        `INSERT INTO events (
          id, transaction_id, type, source, target, payload,
          causation_id, previous_hash, hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.transactionId,
        event.type,
        event.source,
        event.target ?? null,
        JSON.stringify(event.payload),
        event.causationId ?? null,
        previousHash,
        hash,
        event.timestamp,
      );

    return {
      ...event,
      sequence: Number(result.lastInsertRowid),
      previousHash,
      hash,
    };
  }

  list(transactionId: string): StoredEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM events
         WHERE transaction_id = ?
         ORDER BY sequence ASC`,
      )
      .all(transactionId) as StoredEventRow[];

    return rows.map((row) => {
      const event = agentEventSchema.parse({
        id: row.id,
        transactionId: row.transaction_id,
        type: row.type,
        source: row.source,
        target: row.target ?? undefined,
        timestamp: row.created_at,
        causationId: row.causation_id ?? undefined,
        payload: JSON.parse(row.payload) as unknown,
      }) as AgentEvent;

      return Object.assign(event, {
        sequence: row.sequence,
        previousHash: row.previous_hash,
        hash: row.hash,
      }) as StoredEvent;
    });
  }

  verify(transactionId: string): boolean {
    let previousHash = "GENESIS";

    for (const event of this.list(transactionId)) {
      if (event.previousHash !== previousHash) return false;
      if (calculateHash(event, previousHash) !== event.hash) return false;
      previousHash = event.hash;
    }

    return true;
  }

  close(): void {
    this.db.close();
  }
}

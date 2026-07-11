import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { purchaseRequestSchema } from "../protocol/schemas.js";
import type { TransactionService } from "../app/transaction-service.js";

function writeSseEvent(
  raw: NodeJS.WritableStream,
  event: { type: string; sequence: number } & Record<string, unknown>,
): void {
  raw.write(`id: ${event.sequence}\n`);
  raw.write(`event: ${event.type}\n`);
  raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export interface BuildAppOptions {
  logger?: boolean;
  serveFrontend?: boolean;
}

export function buildApp(
  service: TransactionService,
  options: BuildAppOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/api/transactions", async () => ({
    transactions: service.list(),
  }));

  app.post("/api/transactions", async (request, reply) => {
    const parsed = purchaseRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_purchase_request",
        details: parsed.error.flatten(),
      });
    }

    const transactionId = service.create(parsed.data);
    return reply.status(202).send({
      transactionId,
      status: "queued",
      eventsUrl: `/api/transactions/${transactionId}/events`,
    });
  });

  app.get<{ Params: { id: string } }>(
    "/api/transactions/:id",
    async (request, reply) => {
      const transaction = service.get(request.params.id);
      if (!transaction) {
        return reply.status(404).send({ error: "transaction_not_found" });
      }
      return transaction;
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/transactions/:id/events",
    async (request, reply) => {
      const transactionId = request.params.id;
      const transaction = service.get(transactionId);
      if (!transaction) {
        return reply.status(404).send({ error: "transaction_not_found" });
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write("retry: 1000\n\n");

      const sentSequences = new Set<number>();
      const send = (event: (typeof transaction.events)[number]): void => {
        if (sentSequences.has(event.sequence)) return;
        sentSequences.add(event.sequence);
        writeSseEvent(reply.raw, event);
      };

      const unsubscribe = service.subscribe(transactionId, send);
      for (const event of service.get(transactionId)?.events ?? []) send(event);

      const heartbeat = setInterval(() => {
        reply.raw.write(": heartbeat\n\n");
      }, 15_000);

      request.raw.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  );

  if (options.serveFrontend) {
    const frontendRoot = resolve("web/dist");
    if (!existsSync(frontendRoot)) {
      throw new Error("Frontend build not found. Run npm run build:web first.");
    }

    void app.register(fastifyStatic, {
      root: frontendRoot,
      prefix: "/",
      wildcard: false,
    });
  }

  return app;
}

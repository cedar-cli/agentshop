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

  // 只读返回一份全新的新生儿床品静态场景（意图 + 卖家），供前端展示 Demo 剧情。
  // 每次返回都是深构造的新对象，不暴露内部可变引用。
  app.get("/api/demo/newborn-bedding", async () => {
    const scenario = service.getNewbornBeddingScenario();
    return { intent: scenario.intent, sellers: scenario.sellers };
  });

  // 启动一次新的新生儿床品 A2A 演示交易。无需请求体，每次生成独立 transactionId，
  // 可重复运行。返回 202，附带交易查询与 SSE 事件流地址。
  app.post("/api/demo/newborn-bedding", async (_request, reply) => {
    const transactionId = service.createNewbornBeddingDemo();
    return reply.status(202).send({
      transactionId,
      status: "queued",
      transactionUrl: `/api/transactions/${transactionId}`,
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
      // 使用动态通配路由，前端重新 build 产生新 hash 文件后无需重启服务注册新路径。
      wildcard: true,
    });
  }

  return app;
}

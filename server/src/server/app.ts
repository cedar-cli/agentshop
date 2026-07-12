import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import {
  consumerDelegationRequestSchema,
  demandNetworkRequestSchema,
  laptopPurchaseRequestSchema,
  purchaseRequestSchema,
} from "../protocol/schemas.js";
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
  runtimeInfo?: {
    model: string;
    llmConfigured: boolean;
    evidenceLlmEnabled: boolean;
  };
}

export function buildApp(
  service: TransactionService,
  options: BuildAppOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });

  app.get("/health", async () => ({ status: "ok" }));

  app.get(
    "/api/runtime",
    async () =>
      options.runtimeInfo ?? {
        model: "unknown",
        llmConfigured: false,
        evidenceLlmEnabled: false,
      },
  );

  app.get("/api/transactions", async () => ({
    transactions: service.list(),
  }));

  app.get("/api/seller/products", async () => ({
    products: service.listSellerProducts(),
  }));

  app.get("/api/merchant/transactions", async () => ({
    transactions: service.listMerchantTransactions(),
  }));

  app.get("/api/merchant/transactions/events", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 1000\n\n");
    const unsubscribe = service.subscribeMerchantTransactions((update) => {
      reply.raw.write(`id: ${update.sequence}\n`);
      reply.raw.write(`event: ${update.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(update)}\n\n`);
    });
    const heartbeat = setInterval(
      () => reply.raw.write(": heartbeat\n\n"),
      15_000,
    );
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post<{ Params: { id: string } }>(
    "/api/seller/products/:id/activate",
    async (request, reply) => {
      const transactionId = service.createActiveSalesDemo(request.params.id);
      if (!transactionId)
        return reply.status(404).send({ error: "seller_product_not_found" });
      return reply.status(202).send({
        transactionId,
        status: "queued",
        transactionUrl: `/api/transactions/${transactionId}`,
        eventsUrl: `/api/transactions/${transactionId}/events`,
      });
    },
  );

  app.post("/api/seller/demand-network", async (request, reply) => {
    const parsed = demandNetworkRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .status(400)
        .send({ error: "invalid_demand_network_request" });
    const transactionId = service.createDemandNetworkDemo(parsed.data);
    return reply.status(202).send({
      transactionId,
      status: "queued",
      transactionUrl: `/api/transactions/${transactionId}`,
      eventsUrl: `/api/transactions/${transactionId}/events`,
    });
  });

  app.post("/api/seller/intent-growth", async (_request, reply) => {
    const transactionId = service.createIntentGrowthDemo();
    return reply.status(202).send({
      transactionId,
      status: "queued",
      transactionUrl: `/api/transactions/${transactionId}`,
      eventsUrl: `/api/transactions/${transactionId}/events`,
    });
  });

  app.get("/api/active-services", async () => ({
    services: service.listActiveServices(),
  }));

  app.get("/api/inbox", async () => ({
    messages: service.listInboxMessages(),
  }));

  app.get("/api/inbox/events", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 1000\n\n");
    const unsubscribe = service.subscribeInbox((update) => {
      reply.raw.write(`id: ${update.sequence}\n`);
      reply.raw.write(`event: ${update.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(update)}\n\n`);
    });
    const heartbeat = setInterval(
      () => reply.raw.write(": heartbeat\n\n"),
      15_000,
    );
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post<{ Params: { id: string } }>(
    "/api/inbox/:id/memory",
    async (request, reply) => {
      const parsed = z
        .object({ recommended: z.boolean() })
        .safeParse(request.body);
      if (!parsed.success)
        return reply.status(400).send({ error: "invalid_memory_decision" });
      const message = service.updateInboxMemory(
        request.params.id,
        parsed.data.recommended,
      );
      if (!message)
        return reply.status(404).send({ error: "inbox_message_not_found" });
      return message;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/inbox/:id/archive",
    async (request, reply) => {
      const message = service.archiveInboxMessage(request.params.id);
      if (!message)
        return reply.status(404).send({ error: "inbox_message_not_found" });
      return message;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/active-services/:id/trigger",
    async (request, reply) => {
      try {
        const transactionId = service.triggerActiveService(request.params.id);
        if (!transactionId)
          return reply.status(404).send({ error: "active_service_not_found" });
        return reply.status(202).send({
          transactionId,
          status: "queued",
          transactionUrl: `/api/transactions/${transactionId}`,
          eventsUrl: `/api/transactions/${transactionId}/events`,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "active_service_not_triggerable"
        ) {
          return reply.status(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );

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

  app.post("/api/demo/laptop-purchase", async (request, reply) => {
    const parsed = laptopPurchaseRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_laptop_purchase_request",
        details: parsed.error.flatten(),
      });
    }
    const transactionId = service.createLaptopDemo(parsed.data.requestText);
    return reply.status(202).send({
      transactionId,
      status: "queued",
      transactionUrl: `/api/transactions/${transactionId}`,
      eventsUrl: `/api/transactions/${transactionId}/events`,
    });
  });

  // 新增委托任务：买家给出完整购物意图（可 @ 选择主动服务方式），
  // 消费 Agent 全自动接管并完整走完真实 LLM 会话与交易，无需人工确认。
  app.post("/api/demo/consumer-delegation", async (request, reply) => {
    const parsed = consumerDelegationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_consumer_delegation_request",
        details: parsed.error.flatten(),
      });
    }
    const transactionId = service.createConsumerDelegation(parsed.data);
    return reply.status(202).send({
      transactionId,
      status: "queued",
      transactionUrl: `/api/transactions/${transactionId}`,
      eventsUrl: `/api/transactions/${transactionId}/events`,
    });
  });

  app.post("/api/demo/household-restock", async (_request, reply) => {
    const transactionId = service.createHouseholdRestockDemo();
    return reply.status(202).send({
      transactionId,
      status: "queued",
      transactionUrl: `/api/transactions/${transactionId}`,
      eventsUrl: `/api/transactions/${transactionId}/events`,
    });
  });

  app.post<{ Params: { id: string } }>(
    "/api/transactions/:id/approve",
    async (request, reply) => {
      try {
        const transaction = await service.approveLaptopDemo(request.params.id);
        if (!transaction) {
          return reply.status(404).send({ error: "transaction_not_found" });
        }
        return transaction;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "transaction_not_awaiting_approval"
        ) {
          return reply.status(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );

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

  return app;
}

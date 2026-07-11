import "dotenv/config";
import { mkdirSync } from "node:fs";
import { TransactionService } from "./app/transaction-service.js";
import { OpenAIProposalGenerator } from "./llm/openai-proposal-generator.js";
import { OpenAICounterNegotiator } from "./llm/openai-counter-negotiator.js";
import { buildApp } from "./server/app.js";

mkdirSync("data", { recursive: true });

const service = new TransactionService({
  databaseFilename: "data/agentshop.db",
  proposalGenerator: new OpenAIProposalGenerator(),
  counterNegotiator: new OpenAICounterNegotiator(),
});
const app = buildApp(service, { serveFrontend: true });

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const shutdown = async (): Promise<void> => {
  await app.close();
  service.close();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ port, host });

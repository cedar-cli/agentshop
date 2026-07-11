import "dotenv/config";
import { mkdirSync } from "node:fs";
import { TransactionService } from "./app/transaction-service.js";
import { OpenAIProposalGenerator } from "./llm/openai-proposal-generator.js";
import { OpenAICounterNegotiator } from "./llm/openai-counter-negotiator.js";
import { buildApp } from "./server/app.js";

mkdirSync("data", { recursive: true });

/**
 * 解析 Demo 逐事件播放间隔（毫秒）。
 * 未配置、非数字或负数时一律回退到 500ms，让 18 个事件约 8-10 秒完成，适合现场演示。
 */
function resolveDemoStepDelayMs(raw: string | undefined): number {
  const fallback = 500;
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

const service = new TransactionService({
  databaseFilename: "data/agentshop.db",
  proposalGenerator: new OpenAIProposalGenerator(),
  counterNegotiator: new OpenAICounterNegotiator(),
  newbornBeddingStepDelayMs: resolveDemoStepDelayMs(
    process.env.DEMO_STEP_DELAY_MS,
  ),
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

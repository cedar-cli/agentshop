import "dotenv/config";
import { mkdirSync } from "node:fs";
import type { EvidenceAnswerGenerator } from "./agents/evidence-answer-generator.js";
import { TransactionService } from "./app/transaction-service.js";
import { OpenAIProposalGenerator } from "./llm/openai-proposal-generator.js";
import { OpenAICounterNegotiator } from "./llm/openai-counter-negotiator.js";
import { OpenAIEvidenceAnswerGenerator } from "./llm/openai-evidence-answer-generator.js";
import { OpenAILaptopAgent } from "./llm/openai-laptop-agent.js";
import { OpenAIDelegationAgent } from "./llm/openai-delegation-agent.js";
import { OpenAIActiveSalesAgent } from "./llm/openai-active-sales-agent.js";
import { OpenAIDemandNetworkAgent } from "./llm/openai-demand-network-agent.js";
import { OpenAIIntentGrowthAgent } from "./llm/openai-intent-growth-agent.js";
import { getModel } from "./llm/client.js";
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

/**
 * 依据 DEMO_LLM_ENABLED 决定是否为 Seller C 注入 LLM 询证回答生成器。
 * 仅当显式设为 "true" 时启用 LLM；其余任何值（含未配置）都返回 undefined，
 * 使三家卖家全部走确定性规则兜底，保证现场 Demo 默认最稳。
 *
 * @param raw DEMO_LLM_ENABLED 环境变量原始值
 * @returns 启用时返回 OpenAI 生成器实例，否则 undefined
 */
function resolveSellerCAnswerGenerator(
  raw: string | undefined,
): EvidenceAnswerGenerator | undefined {
  if (raw?.trim().toLowerCase() !== "true") return undefined;
  return new OpenAIEvidenceAnswerGenerator();
}

const evidenceAnswerGenerator = resolveSellerCAnswerGenerator(
  process.env.DEMO_LLM_ENABLED,
);

const service = new TransactionService({
  databaseFilename: "data/agentshop.db",
  proposalGenerator: new OpenAIProposalGenerator(),
  counterNegotiator: new OpenAICounterNegotiator(),
  newbornBeddingStepDelayMs: resolveDemoStepDelayMs(
    process.env.DEMO_STEP_DELAY_MS,
  ),
  // 只有 DEMO_LLM_ENABLED=true 时 Seller C 才实时调用 gpt-5.6-luna；否则规则兜底
  sellerCAnswerGenerator: evidenceAnswerGenerator,
  laptopLlmAgent: new OpenAILaptopAgent(),
  // 新建委托任务的真实搜索采购工作流用；LLM 不可用时工作流内部自动退回确定性兜底
  delegationLlmAgent: new OpenAIDelegationAgent(),
  activeSalesLlmAgent: new OpenAIActiveSalesAgent(),
  activeSalesDecisionDelayMs: 1500,
  demandNetworkLlmAgent: new OpenAIDemandNetworkAgent(),
  intentGrowthLlmAgent: new OpenAIIntentGrowthAgent(),
  intentGrowthStepDelayMs: 220,
});
const app = buildApp(service, {
  runtimeInfo: {
    model: getModel(),
    llmConfigured: Boolean(
      process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_BASE_URL?.trim(),
    ),
    evidenceLlmEnabled: evidenceAnswerGenerator !== undefined,
  },
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const shutdown = async (): Promise<void> => {
  await app.close();
  service.close();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ port, host });

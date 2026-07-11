import OpenAI from "openai";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function createOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: requiredEnv("OPENAI_API_KEY"),
    baseURL: requiredEnv("OPENAI_BASE_URL"),
    timeout: 10_000,
    maxRetries: 1,
  });
}

export function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
}

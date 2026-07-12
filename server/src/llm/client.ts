import OpenAI from "openai";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function instantiateOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: requiredEnv("OPENAI_API_KEY"),
    baseURL: requiredEnv("OPENAI_BASE_URL"),
    timeout: 10_000,
    maxRetries: 1,
  });
}

/**
 * 惰性 OpenAI 客户端。
 *
 * 各 Agent 以 `private readonly client = createOpenAIClient()` 在构造时持有客户端。
 * 若在此刻就校验 OPENAI_API_KEY / OPENAI_BASE_URL，缺失时会让整个后端在 server.ts
 * 启动阶段直接崩溃，反而绕过了各 Agent 早已写好的 try/catch 确定性兜底，与「Demo
 * 默认最稳、无 key 也能跑」的设计相悖。
 *
 * 这里返回一个惰性代理：构造时不触碰环境变量，直到首次真正访问客户端属性（如
 * `.responses`）才实例化。缺 key 时该实例化会抛错，错误发生在 `generate()` 等
 * 方法内部，被 seller-agent 等调用点的 try/catch 捕获，顺利退回规则兜底。
 * 客户端只实例化一次并缓存复用。
 */
export function createOpenAIClient(): OpenAI {
  let real: OpenAI | undefined;
  const resolve = (): OpenAI => (real ??= instantiateOpenAIClient());
  return new Proxy({} as OpenAI, {
    get(_target, prop, receiver) {
      const client = resolve();
      const value = Reflect.get(client, prop, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

export function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
}

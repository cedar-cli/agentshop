import "dotenv/config";
import OpenAI from "openai";
import { createOpenAIClient, getModel } from "./client.js";

const client = createOpenAIClient();
const model = getModel();

function errorSummary(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    return `HTTP ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function testModelList(): Promise<void> {
  const models = await client.models.list();
  const ids: string[] = [];

  for await (const item of models) {
    ids.push(item.id);
  }

  const available = ids.includes(model);
  console.log(
    `[models] 鉴权成功，共返回 ${ids.length} 个模型；${model} ${
      available ? "存在" : "未在列表中"
    }。`,
  );
}

async function testResponsesApi(): Promise<boolean> {
  try {
    const response = await client.responses.create({
      model,
      input: "只回复 AGENTSHOP_OK，不要添加其他内容。",
      max_output_tokens: 32,
      reasoning: { effort: "low" },
    });

    console.log(`[responses] 成功：${response.output_text.trim()}`);
    return true;
  } catch (error) {
    console.log(`[responses] 不可用：${errorSummary(error)}`);
    return false;
  }
}

async function testChatCompletions(): Promise<void> {
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: "只回复 AGENTSHOP_OK，不要添加其他内容。",
      },
    ],
    max_completion_tokens: 32,
  });

  console.log(
    `[chat.completions] 成功：${response.choices[0]?.message.content?.trim() ?? "<empty>"}`,
  );
}

async function main(): Promise<void> {
  console.log(`Testing ${model} via ${process.env.OPENAI_BASE_URL}\n`);

  try {
    await testModelList();
  } catch (error) {
    console.log(`[models] 查询失败：${errorSummary(error)}`);
  }

  if (!(await testResponsesApi())) {
    await testChatCompletions();
  }
}

main().catch((error: unknown) => {
  console.error(`LLM smoke test failed: ${errorSummary(error)}`);
  process.exitCode = 1;
});

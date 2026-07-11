/**
 * 基于 LLM 的机器询证回答生成器（仅用于 Seller C）
 *
 * 让 gpt-5.6-luna 在「不可超越的事实边界」内，为 Seller C 实时润色 5 个机器询证回答，
 * 使现场 Demo 的谈判记录更自然，同时严格不越界（不编造凭证、不改价改期）。
 *
 * 稳定性设计（现场 Demo 优先级最高）：
 *  - 短超时（约 6 秒）：模型迟迟不返回时快速放弃，不拖垮 18 事件链的节奏。
 *  - 双保险降级：本实现内部先自捕获一次，任何异常/超时/字段缺失/非法输出都就地
 *    降级为规则兜底并标记 fallback；工作流层还会再包一层 try/catch，双重保证交易不失败。
 *  - fallbackReason 安全脱敏：只保留简短原因（如 "llm timeout"），绝不透出 API Key、
 *    请求头或完整上游错误对象。
 */

import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  EvidenceAnswerGenerator,
  EvidenceAnswerInput,
  EvidenceAnswerResult,
} from "../agents/evidence-answer-generator.js";
import {
  EvidenceAnswerValidationError,
  validateEvidenceAnswers,
} from "../agents/evidence-answer-generator.js";
import { createOpenAIClient, getModel } from "./client.js";

// 模型调用超时（毫秒）：任务建议 5-6 秒，取 6 秒兼顾成功率与现场节奏
const LLM_TIMEOUT_MS = 6_000;
// 输出 token 上限：5 条短回答足够，限制以控制时延与成本
const MAX_OUTPUT_TOKENS = 500;

/**
 * 构造结构化输出的 zod schema：answers 为「问题 id → 非空字符串」的映射。
 *
 * 用运行期传入的问题 id 动态生成一个「每个 id 都必填非空」的对象 schema，
 * 让模型在字段层面就被约束为「恰好回答这几个问题」，减少缺字段/多字段的概率；
 * 即便模型仍越界，validateEvidenceAnswers 会作二次兜底。
 *
 * @param questionIds 本次询证的问题 id 列表
 * @returns 形如 { answers: { [id]: string(min 1) } } 的 schema
 */
function buildAnswersSchema(questionIds: readonly string[]) {
  const shape: Record<string, z.ZodString> = {};
  for (const id of questionIds) {
    shape[id] = z.string().min(1).max(240);
  }
  return z.object({
    // 严格对象：只允许问题清单内的字段，杜绝模型自造字段
    answers: z.object(shape).strict(),
  });
}

/**
 * 把一次生成输入压缩成「给模型看的事实卡片」。
 * 只暴露回答所需的最小事实：价格、交期、bundle、凭证摘要、意图约束、事实边界答案。
 * 绝不把内部实现细节或与回答无关的数据塞给模型。
 *
 * @param input 生成输入
 * @returns 供模型阅读的结构化事实对象
 */
function buildFactCard(input: EvidenceAnswerInput): unknown {
  const { seller, intent, questions, fallbackAnswers } = input;
  return {
    intent: {
      productDescription: intent.productDescription,
      budgetUsd: intent.budgetUsd,
      deadlineHours: intent.deadlineHours,
      riskThreshold: intent.riskThreshold,
      unacceptable: intent.unacceptable,
    },
    seller: {
      sellerId: seller.sellerId,
      displayName: seller.displayName,
      initialPriceUsd: seller.initialPriceUsd,
      finalPriceUsd: seller.finalPriceUsd,
      deliveryHours: seller.deliveryHours,
      bundle: seller.bundle,
      // 只给凭证摘要（类型/要求/签发方/引用号/有效期/验证状态），不给可被误用的内部字段
      credentials: seller.credentials.map((credential) => ({
        type: credential.type,
        requirementId: credential.requirementId,
        issuer: credential.issuer,
        referenceId: credential.referenceId,
        validUntil: credential.validUntil,
        verificationStatus: credential.verificationStatus,
      })),
    },
    questions: questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      expectedAnswer: question.expectedAnswer,
    })),
    // 事实边界：模型只能在这些事实的语义范围内润色，绝不能超越
    factualBoundaryAnswers: fallbackAnswers,
  };
}

/**
 * 把任意异常收敛为一句安全、简短的兜底原因。
 * 只保留错误类型/消息首段，主动剔除可能的敏感内容长度，绝不返回完整错误对象。
 *
 * @param error 捕获到的异常
 * @returns 适合展示与审计的简短原因（不含 key/请求头/堆栈）
 */
export function safeFallbackReason(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "llm timeout";
    }
    if (error instanceof EvidenceAnswerValidationError) {
      return "llm invalid output";
    }
  }

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  if (status === 401 || status === 403) return "llm authentication failed";
  if (status === 429) return "llm rate limited";
  if (status !== undefined && status >= 500) return "llm unavailable";
  return "llm request failed";
}

/**
 * 基于 gpt-5.6-luna 的机器询证回答生成器。
 * 仅注入给 Seller C 使用；A/B 始终走规则兜底，避免一次 Demo 发起三个模型请求。
 */
export class OpenAIEvidenceAnswerGenerator implements EvidenceAnswerGenerator {
  private readonly client = createOpenAIClient();

  /**
   * 用 LLM 生成 Seller C 的 5 个询证回答；任何失败都就地降级为规则兜底。
   * @param input 生成输入（含事实边界 fallbackAnswers）
   * @returns 成功时 generatedBy=llm；失败/越界时 generatedBy=fallback 且带安全原因
   */
  async generate(input: EvidenceAnswerInput): Promise<EvidenceAnswerResult> {
    const questionIds = input.questions.map((question) => question.id);

    // 兜底结果：任何路径失败都回退到它，保证交易永远拿得到一份合法回答
    const fallback: EvidenceAnswerResult = {
      answers: { ...input.fallbackAnswers },
      generatedBy: "fallback",
    };

    try {
      const response = await this.client.responses.parse(
        {
          model: getModel(),
          reasoning: { effort: "low" },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          input: [
            {
              role: "system",
              content:
                "你是新生儿低敏床品卖家的机器询证应答 Agent。只能依据提供的事实卡片作答，" +
                "严禁编造不存在的认证、退货政策或配送能力，严禁修改价格、配送时间与凭证事实。" +
                "factualBoundaryAnswers 是你不可超越的事实边界：你只能在其语义范围内用更自然的中文润色措辞，" +
                "不得改变其事实结论（例如不得把无凭证说成有凭证，不得把 false 说成 true）。" +
                "只回答 questions 里给出的问题 id，不要新增任何字段，不要使用 Markdown 包裹。每条回答不超过 80 个汉字。",
            },
            {
              role: "user",
              content: JSON.stringify(buildFactCard(input)),
            },
          ],
          text: {
            format: zodTextFormat(
              buildAnswersSchema(questionIds),
              "evidence_answers",
            ),
          },
        },
        { signal: AbortSignal.timeout(LLM_TIMEOUT_MS) },
      );

      const parsed = response.output_parsed;
      if (!parsed) {
        // 模型没有产出结构化结果：降级
        return { ...fallback, fallbackReason: "llm returned no structured answers" };
      }

      // 二次兜底校验：缺字段/空答案/多余字段都会抛错并触发降级
      const answers = validateEvidenceAnswers(
        parsed.answers,
        input.questions,
        input.fallbackAnswers,
      );
      return { answers, generatedBy: "llm" };
    } catch (error) {
      return { ...fallback, fallbackReason: safeFallbackReason(error) };
    }
  }
}

/**
 * 机器询证「回答生成」抽象层
 *
 * 本模块把「卖家如何回答 5 个机器询证问题」这件事从工作流里抽出来，形成一个
 * 与 ProposalGenerator / CounterNegotiator 平行的可注入接口：
 *  - 真实实现走 LLM（见 src/llm/openai-evidence-answer-generator.ts）；
 *  - 规则兜底与测试走 FallbackEvidenceAnswerGenerator（本文件内，完全确定性）。
 *
 * 设计原则（务必保持，测试会锁定）：
 *  - 工作流**不直接**调用 OpenAI，只依赖本接口，便于替换与测试。
 *  - fallbackAnswers 是「不可超越的事实边界」：LLM 只能在其语义范围内润色措辞，
 *    绝不能编造凭证、改价格、改交期。校验函数据此拒绝越界输出并触发兜底。
 *  - 任何异常/超时/字段缺失/非法输出都必须能安全降级为规则回答，交易永不失败。
 */

import type {
  EvidenceQuestion,
  ExecutableIntent,
} from "../protocol/events.js";
import type { SellerScenario } from "../scenario/newborn-bedding.js";

/**
 * 一次回答生成的结果。
 * answers：问题 id → 回答文本的映射（必须覆盖全部被问到的问题，且非空）。
 * generatedBy：本次回答由 LLM 生成还是规则兜底。
 * fallbackReason：仅在 fallback 时存在，简短说明降级原因（安全脱敏，不含 key/请求头/完整错误）。
 */
export interface EvidenceAnswerResult {
  answers: Record<string, string>;
  generatedBy: "llm" | "fallback";
  fallbackReason?: string;
}

/** 生成器的输入：买家意图、卖家画像、待答问题清单，以及规则兜底答案（事实边界）。 */
export interface EvidenceAnswerInput {
  // 被询证的卖家场景（价格、交期、凭证、bundle 等事实来源）
  seller: SellerScenario;
  // 买家可执行意图（预算、交期上限、证据要求等约束）
  intent: ExecutableIntent;
  // 本次机器询证的问题清单
  questions: EvidenceQuestion[];
  // 规则兜底答案：既是 LLM 失败时的回退值，也是 LLM 回答不可超越的事实边界
  fallbackAnswers: Record<string, string>;
}

/**
 * 机器询证回答生成器接口。
 * 与 ProposalGenerator 一样：真实走 LLM，兜底/测试走规则实现，二者可互换注入。
 */
export interface EvidenceAnswerGenerator {
  /**
   * 为某卖家生成对全部询证问题的回答。
   * 实现应尽力返回 llm 结果；无法生成合法结果时，可自行降级并标记 fallback，
   * 或抛错交由上层（工作流）统一降级——两种方式都保证交易不失败。
   * @param input 生成所需的意图/卖家/问题/事实边界
   * @returns 覆盖全部问题的回答 + 生成来源标记
   */
  generate(input: EvidenceAnswerInput): Promise<EvidenceAnswerResult>;
}

// ---------------------------------------------------------------------------
// 规则兜底答案：从卖家场景事实推导，完全确定性，是回答的「事实边界」
// ---------------------------------------------------------------------------

/**
 * 依据某卖家的场景事实，推导其对 5 个询证问题的确定性作答。
 *
 * 这是权威的事实边界：答案完全由场景数据（交期、证据缺口、bundle、定价）推导，
 * 不同卖家自然给出不同答案。既作为 LLM 不可用时的回退，也作为 LLM 输出的语义上限
 * ——例如 LLM 不得把「无退货凭证」改写成「支持退货」。
 *
 * @param seller 卖家场景画像
 * @param intent 买家意图（用于判断交期是否覆盖等）
 * @returns 问题 id → 确定性回答文本
 */
export function buildFallbackAnswers(
  seller: SellerScenario,
  intent: ExecutableIntent,
): Record<string, string> {
  // 该卖家是否已提供低敏实验室报告/认证（material 之外的低敏证据）
  const hasHypoallergenicProof = seller.credentials.some(
    (credential) => credential.requirementId === "hypoallergenic-lab-report",
  );
  // 72 小时配送是否覆盖：交期不超过意图上限即视为覆盖
  const coversDeadline = seller.deliveryHours <= intent.deadlineHours;
  // 是否提供了退货政策证据
  const hasReturnPolicy = seller.credentials.some(
    (credential) => credential.requirementId === "return-policy",
  );

  return {
    // 低敏证据：有则说明来源凭证，无则如实承认缺失
    "q-hypoallergenic-proof": hasHypoallergenicProof
      ? `提供低敏检测凭证（requirement=hypoallergenic-lab-report），承诺交期 ${seller.deliveryHours} 小时`
      : "暂无可验证的低敏实验室检测凭证，仅有材料自述",
    // 72h 覆盖：按实际交期作答
    "q-delivery-72h": coversDeadline ? "true" : "false",
    // 退货政策：有证据则说明可退，无则承认缺失
    "q-return-policy": hasReturnPolicy
      ? "皮肤不适支持无理由退货，附退货政策凭证（requirement=return-policy）"
      : "暂无可验证的皮肤不适退货政策凭证",
    // 价格溢价说明：仅 Seller C 有实质性溢价解释，其余按自身定位作答
    "q-price-premium":
      seller.sellerId === "seller-c"
        ? "溢价来自完整低敏认证、材料组成、配送覆盖与退货政策等可验证保障"
        : `本店初始报价 ${seller.initialPriceUsd} USD，定位与保障范围与 Seller C 不同`,
    // bundle 优惠：仅提供 bundle 的卖家回 true 并给出最终价
    "q-bundle-offer": seller.bundle
      ? `true（${seller.bundle.description}，bundle 后最终价 ${seller.finalPriceUsd} USD）`
      : "false",
  };
}

// ---------------------------------------------------------------------------
// 回答校验：把 LLM 的原始输出收敛到「合法、完整、不越界」的答案
// ---------------------------------------------------------------------------

/** 单条回答允许的最大长度（超出则截断，避免话痨污染 UI 与事件体积）。 */
const MAX_ANSWER_LENGTH = 240;

/** 回答未通过结构或事实边界校验。供 LLM 层把失败归类为 invalid output。 */
export class EvidenceAnswerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceAnswerValidationError";
  }
}

/** 这些词一旦出现在模型回答中，就必须已经存在于问题或权威兜底答案里。 */
const GUARDED_FACT_TERMS = [
  "第三方",
  "认证",
  "运费",
  "包邮",
  "免邮",
  "退款",
  "赔付",
  "质保",
  "保修",
  "免费",
  "全额",
  "无条件",
  "上门",
  "终身",
  "天内",
  "日内",
  "个月",
  "婴幼儿级",
  "婴儿级",
  "全链路",
  "质检",
  "安全无虞",
] as const;

function booleanPolarity(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (/^(false|否|不支持|不可以|不能|没有|暂无|未)/u.test(normalized)) {
    return false;
  }
  if (/^(true|是|支持|可以|能够|能|有|覆盖)/u.test(normalized)) {
    return true;
  }
  return undefined;
}

function extractNumbers(value: string): string[] {
  return value.match(/\d+(?:\.\d+)?/g) ?? [];
}

function extractIdentifiers(value: string): string[] {
  return value.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? [];
}

function assertWithinFactBoundary(
  answer: string,
  boundary: string,
  question: EvidenceQuestion,
): void {
  const authoritativeText = `${question.prompt} ${boundary}`;

  if (question.expectedAnswer === "boolean") {
    const expected = booleanPolarity(boundary);
    const actual = booleanPolarity(answer);
    if (expected === undefined || actual !== expected) {
      throw new EvidenceAnswerValidationError(
        `answer changes boolean conclusion: ${question.id}`,
      );
    }
  }

  const allowedNumbers = new Set(extractNumbers(authoritativeText));
  for (const number of extractNumbers(answer)) {
    if (!allowedNumbers.has(number)) {
      throw new EvidenceAnswerValidationError(
        `answer introduces unsupported number: ${question.id}`,
      );
    }
  }

  const allowedIdentifiers = new Set(extractIdentifiers(authoritativeText));
  for (const identifier of extractIdentifiers(answer)) {
    if (!allowedIdentifiers.has(identifier)) {
      throw new EvidenceAnswerValidationError(
        `answer introduces unsupported identifier: ${question.id}`,
      );
    }
  }

  for (const term of GUARDED_FACT_TERMS) {
    if (answer.includes(term) && !authoritativeText.includes(term)) {
      throw new EvidenceAnswerValidationError(
        `answer introduces unsupported claim: ${question.id}`,
      );
    }
  }
}

/**
 * 校验并规整一份候选回答，非法则抛错（由上层降级到规则兜底）。
 *
 * 合法性判据（任一不满足即抛错）：
 *  1. 必须覆盖 questions 中的每一个问题 id；
 *  2. 每条回答去空白后非空；
 *  3. 不得包含 questions 之外的多余字段（防止模型自造字段污染协议）。
 *
 * 通过校验后：对每条回答 trim 并截断到 MAX_ANSWER_LENGTH，得到干净的最终答案。
 *
 * @param candidate 待校验的候选回答（通常来自 LLM）
 * @param questions 本次询证的问题清单（作为答案 key 的唯一合法集合）
 * @returns 规整后的合法回答
 * @throws 当缺字段、有空答案或含多余字段时抛出，触发上层兜底
 */
export function validateEvidenceAnswers(
  candidate: Record<string, string>,
  questions: readonly EvidenceQuestion[],
  factualBoundaryAnswers?: Readonly<Record<string, string>>,
): Record<string, string> {
  const allowedIds = new Set(questions.map((question) => question.id));

  // 3) 不允许出现问题清单之外的字段
  for (const key of Object.keys(candidate)) {
    if (!allowedIds.has(key)) {
      throw new EvidenceAnswerValidationError(
        `answer contains unexpected field: ${key}`,
      );
    }
  }

  const cleaned: Record<string, string> = {};
  for (const question of questions) {
    const value = candidate[question.id];
    // 1) + 2) 缺字段或空答案都视为非法
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new EvidenceAnswerValidationError(
        `answer missing for question: ${question.id}`,
      );
    }
    const cleanedValue = value.trim().slice(0, MAX_ANSWER_LENGTH);
    const boundary = factualBoundaryAnswers?.[question.id];
    if (factualBoundaryAnswers && typeof boundary !== "string") {
      throw new EvidenceAnswerValidationError(
        `fact boundary missing for question: ${question.id}`,
      );
    }
    if (boundary !== undefined) {
      assertWithinFactBoundary(cleanedValue, boundary, question);
    }
    cleaned[question.id] = cleanedValue;
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// 规则兜底生成器：不接触网络，永远返回确定性答案并标记 fallback
// ---------------------------------------------------------------------------

/**
 * 规则兜底的回答生成器。
 * 直接返回 fallbackAnswers（即 buildFallbackAnswers 的结果），并标记 generatedBy=fallback。
 * 用于：DEMO_LLM_ENABLED 关闭、Seller A/B（不走 LLM）、以及测试。
 */
export class FallbackEvidenceAnswerGenerator implements EvidenceAnswerGenerator {
  /**
   * 返回确定性兜底答案。
   * @param input 生成输入（此实现只用到 fallbackAnswers）
   * @returns 规则回答，generatedBy 恒为 "fallback"
   */
  async generate(input: EvidenceAnswerInput): Promise<EvidenceAnswerResult> {
    return {
      // 复制一份，避免调用方拿到内部引用后被意外修改
      answers: { ...input.fallbackAnswers },
      generatedBy: "fallback",
      // 规则生成属正常路径，用固定安全原因标注，便于前端/审计识别
      fallbackReason: "rule-based deterministic answer",
    };
  }
}

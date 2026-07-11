/**
 * 新生儿床品 Demo · 纯函数状态推导层
 *
 * 本模块只做一件事：把「一串已到达的事件」+「静态场景」推导为 UI 需要的派生状态。
 * 全部为**纯函数**——同样的输入永远得到同样的输出，不触碰网络、DOM、定时器。
 * 这样这层逻辑可以被单元测试完整覆盖，也保证「剧情推进完全由真实事件决定」。
 *
 * 核心约束（与任务要求一致）：
 *  - 当前幕、验证后评分、证据、赢家、回执都从事件推导，**不从场景静态数据泄露最终结果**。
 *  - 场景静态数据只用于第一/二幕的基础展示（卖家名、初始报价、意图约束等）。
 *  - 「验证前评分」与「验证后评分」靠事件的 source 字段区分，而非靠到达时间。
 */

import type {
  EvidenceSubmission,
  ExecutableIntent,
  LiveReceipt,
  NewbornEvent,
  OrderAuthorized,
  SellerMatched,
  SellerScoreVector,
} from "./types";

// ---------------------------------------------------------------------------
// 参与方 id 常量（与后端 src/scenario/newborn-bedding-workflow.ts 的 WORKFLOW_ACTORS 对齐）
// ---------------------------------------------------------------------------

/** 各 Agent 的稳定 source id，用于区分验证前/后评分等。 */
export const ACTORS = {
  // 验证前评分由买家 Agent 发布
  buyer: "buyer-agent",
  // 撮合 Agent
  matcher: "marketplace-matcher-agent",
  // 验证后评分由证据评估 Agent 发布——这是区分前/后评分的关键判据
  evaluator: "evidence-evaluator-agent",
  // 自动购买 Agent
  autoPurchase: "auto-purchase-agent",
  // 回执签发 Agent
  receiptIssuer: "receipt-issuer-agent",
} as const;

/** 本 Demo 三家卖家的固定顺序（A、B、C）。 */
export const SELLER_ORDER = ["seller-a", "seller-b", "seller-c"] as const;

// ---------------------------------------------------------------------------
// 幕（Act）
// ---------------------------------------------------------------------------

/**
 * 四幕枚举。
 *  - act0：尚未发布意图（预览态）
 *  - act1：买家发布意图
 *  - act2：三个 Seller Agent 响应（匹配 + 验证前评分）
 *  - act3：机器询证与谈判（证据请求/提交 + 验证后评分）
 *  - act4：自动购买与回执（授权 + 回执）
 */
export type Act = 0 | 1 | 2 | 3 | 4;

/**
 * 根据已到达事件判断当前处于第几幕。
 * 幕次严格由事件类型决定，越靠后的关键事件优先级越高（就高不就低）。
 *
 * @param events 已到达并去重排序后的事件列表
 * @returns 当前幕（0 表示尚未发布意图）
 */
export function currentAct(events: readonly NewbornEvent[]): Act {
  const types = new Set(events.map((event) => event.type));

  // 第四幕：只要出现授权或回执，就进入自动购买/回执幕
  if (types.has("order.authorized") || types.has("receipt.issued")) return 4;

  // 第三幕：出现证据请求/提交，或出现验证后评分（由 evaluator 发布）
  const hasPostScore = events.some(
    (event) =>
      event.type === "seller.score.updated" &&
      event.source === ACTORS.evaluator,
  );
  if (
    types.has("evidence.requested") ||
    types.has("evidence.submitted") ||
    hasPostScore
  ) {
    return 3;
  }

  // 第二幕：出现卖家匹配或验证前评分
  if (types.has("seller.matched") || types.has("seller.score.updated")) {
    return 2;
  }

  // 第一幕：意图已发布
  if (types.has("intent.published")) return 1;

  // 尚未发布
  return 0;
}

// ---------------------------------------------------------------------------
// 意图
// ---------------------------------------------------------------------------

/**
 * 从事件流中取出已发布的意图 payload。
 * 只有真正收到 intent.published 才返回，否则 undefined（用于"发布前不显示已发布态"）。
 */
export function publishedIntent(
  events: readonly NewbornEvent[],
): ExecutableIntent | undefined {
  const event = events.find((item) => item.type === "intent.published");
  return event?.type === "intent.published" ? event.payload : undefined;
}

// ---------------------------------------------------------------------------
// 卖家匹配
// ---------------------------------------------------------------------------

/**
 * 取某卖家的匹配事件 payload（seller.matched）。
 * @returns 匹配记录；未匹配则 undefined
 */
export function matchedSeller(
  events: readonly NewbornEvent[],
  sellerId: string,
): SellerMatched | undefined {
  const event = events.find(
    (item) => item.type === "seller.matched" && item.payload.sellerId === sellerId,
  );
  return event?.type === "seller.matched" ? event.payload : undefined;
}

// ---------------------------------------------------------------------------
// 评分（区分验证前 / 验证后）
// ---------------------------------------------------------------------------

/**
 * 取某卖家的**验证前**评分（由 buyer-agent 发布的 seller.score.updated）。
 * 验证前评分只反映"凭报价与自述"的初步排名，不包含证据核验结果。
 */
export function preVerificationScore(
  events: readonly NewbornEvent[],
  sellerId: string,
): SellerScoreVector | undefined {
  const event = events.find(
    (item) =>
      item.type === "seller.score.updated" &&
      item.source === ACTORS.buyer &&
      item.payload.sellerId === sellerId,
  );
  return event?.type === "seller.score.updated" ? event.payload : undefined;
}

/**
 * 取某卖家的**验证后**评分（由 evidence-evaluator-agent 发布的 seller.score.updated）。
 * 验证后评分才包含证据核验、交期核验的结果，是排名变化的真实依据。
 */
export function postVerificationScore(
  events: readonly NewbornEvent[],
  sellerId: string,
): SellerScoreVector | undefined {
  const event = events.find(
    (item) =>
      item.type === "seller.score.updated" &&
      item.source === ACTORS.evaluator &&
      item.payload.sellerId === sellerId,
  );
  return event?.type === "seller.score.updated" ? event.payload : undefined;
}

/**
 * 取某卖家「当前应展示」的评分：优先验证后评分，其次验证前评分。
 * 这样排名会随验证后评分到达而真实翻转，翻转前展示验证前排名。
 * @returns 当前评分；两者都没有则 undefined
 */
export function currentScore(
  events: readonly NewbornEvent[],
  sellerId: string,
): SellerScoreVector | undefined {
  return (
    postVerificationScore(events, sellerId) ??
    preVerificationScore(events, sellerId)
  );
}

/**
 * 某卖家是否已进入「验证后」阶段（验证后评分已到达）。
 * 用于 UI 判断该显示"验证前排名"还是"验证后排名"、是否触发排名动画。
 */
export function isVerified(
  events: readonly NewbornEvent[],
  sellerId: string,
): boolean {
  return postVerificationScore(events, sellerId) !== undefined;
}

// ---------------------------------------------------------------------------
// 证据提交
// ---------------------------------------------------------------------------

/**
 * 取某卖家的证据提交 payload（evidence.submitted）。
 * 前端据此展示证据清单、凭证字段与谈判作答，绝不写死答案。
 * @returns 证据提交；未提交则 undefined
 */
export function evidenceSubmission(
  events: readonly NewbornEvent[],
  sellerId: string,
): EvidenceSubmission | undefined {
  const event = events.find(
    (item) =>
      item.type === "evidence.submitted" && item.payload.sellerId === sellerId,
  );
  return event?.type === "evidence.submitted" ? event.payload : undefined;
}

/**
 * 取某卖家对某询证问题的作答（从 evidence.submitted 的 answers 读取，不写死）。
 * @returns 作答字符串；无提交或无该问题则 undefined
 */
export function sellerAnswer(
  events: readonly NewbornEvent[],
  sellerId: string,
  questionId: string,
): string | undefined {
  return evidenceSubmission(events, sellerId)?.answers[questionId];
}

// ---------------------------------------------------------------------------
// 授权与回执
// ---------------------------------------------------------------------------

/**
 * 取授权下单 payload（order.authorized）。
 * @returns 授权记录；未授权则 undefined
 */
export function authorization(
  events: readonly NewbornEvent[],
): OrderAuthorized | undefined {
  const event = events.find((item) => item.type === "order.authorized");
  return event?.type === "order.authorized" ? event.payload : undefined;
}

/**
 * 取实时回执 payload（receipt.issued）。
 * 回执**只在 receipt.issued 到达后**才存在，杜绝提前展示成交结果。
 * @returns 回执；未签发则 undefined
 */
export function receipt(
  events: readonly NewbornEvent[],
): LiveReceipt | undefined {
  const event = events.find((item) => item.type === "receipt.issued");
  return event?.type === "receipt.issued" ? event.payload : undefined;
}

// ---------------------------------------------------------------------------
// 排名
// ---------------------------------------------------------------------------

/** 单个卖家的当前排名信息。 */
export interface SellerRanking {
  // 卖家 id
  sellerId: string;
  // 当前评分（验证后优先，其次验证前）
  score: SellerScoreVector | undefined;
  // 展示用排名（1 起）：优先取评分自带 rank，无评分时按卖家固定顺序兜底
  rank: number;
  // 是否已进入验证后阶段
  verified: boolean;
  // 是否已被淘汰（验证后 stage 为 rejected）
  rejected: boolean;
}

/**
 * 计算三家卖家的当前排名列表，按 rank 升序返回。
 *
 * 排名来源：优先用「当前评分」自带的 rank 字段（后端已算好，验证后会翻转）；
 * 尚无任何评分的卖家排在最后，并按 SELLER_ORDER 的固定顺序兜底，保证确定性。
 *
 * @param events 已到达并去重排序后的事件列表
 * @returns 按 rank 升序的排名数组（始终包含全部三家）
 */
export function ranking(events: readonly NewbornEvent[]): SellerRanking[] {
  const rows: SellerRanking[] = SELLER_ORDER.map((sellerId, index) => {
    const score = currentScore(events, sellerId);
    const verified = isVerified(events, sellerId);
    return {
      sellerId,
      score,
      // 有评分则用评分 rank；无评分时用固定顺序（index+1）兜底，避免并列 0
      rank: score ? score.rank : SELLER_ORDER.length + index,
      verified,
      rejected: verified && score?.stage === "rejected",
    };
  });

  // 按 rank 升序；rank 相同则按卖家固定顺序，保证稳定确定
  return rows.sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    return SELLER_ORDER.indexOf(left.sellerId as (typeof SELLER_ORDER)[number]) -
      SELLER_ORDER.indexOf(right.sellerId as (typeof SELLER_ORDER)[number]);
  });
}

// ---------------------------------------------------------------------------
// 事件合并去重（供 hook 使用，也是纯函数，便于测试）
// ---------------------------------------------------------------------------

/**
 * 把一条新事件并入现有事件列表：按 id 与 sequence 双重去重，并按 sequence 升序排序。
 *
 * 为什么双重去重：SSE 实时推送与断线后快照回放可能重复投递同一事件，
 * 用 id（UUID）和 sequence（全局序号）任一命中即视为重复，杜绝重复渲染。
 *
 * @param current 现有事件列表（已排序）
 * @param incoming 新到达的事件
 * @returns 合并去重后的新列表（引用变化便于 React 更新；若无变化则返回原引用）
 */
export function mergeEvent(
  current: readonly NewbornEvent[],
  incoming: NewbornEvent,
): NewbornEvent[] {
  const duplicated = current.some(
    (event) => event.id === incoming.id || event.sequence === incoming.sequence,
  );
  if (duplicated) return current as NewbornEvent[];

  return [...current, incoming].sort(
    (left, right) => left.sequence - right.sequence,
  );
}

/**
 * 批量合并一组事件（用于快照整表载入）。
 * 复用 mergeEvent 的去重与排序规则，保证与实时合并一致。
 */
export function mergeEvents(
  current: readonly NewbornEvent[],
  incoming: readonly NewbornEvent[],
): NewbornEvent[] {
  return incoming.reduce<NewbornEvent[]>(
    (accumulated, event) => mergeEvent(accumulated, event),
    current as NewbornEvent[],
  );
}

/**
 * 第三幕 · 机器询证与谈判记录（Negotiation Transcript）
 *
 * 问题来自真实 evidence.requested 事件的 questions，答案来自真实 evidence.submitted
 * 事件的 answers——全部从 payload 读取，绝不写死。重点呈现 Seller C 的作答。
 */

import { MessagesSquare, UserRound } from "lucide-react";
import { sellerAnswer } from "../demo-state";
import type { EvidenceQuestion, NewbornEvent } from "../types";
import { QUESTION_TITLE, SELLER_FALLBACK_NAME, sellerRole } from "./format";

interface NegotiationTranscriptProps {
  // 已到达事件
  events: NewbornEvent[];
  // 卖家展示名映射
  sellerNames: Record<string, string>;
  // 聚焦卖家（重点展示，默认 seller-c）
  focusSellerId?: string;
}

/**
 * 从事件流取出询证问题清单（任一 evidence.requested 事件都携带同一份问题）。
 */
function questionsFrom(events: NewbornEvent[]): EvidenceQuestion[] {
  const requested = events.find((event) => event.type === "evidence.requested");
  return requested?.type === "evidence.requested"
    ? requested.payload.questions
    : [];
}

/**
 * 谈判记录组件。
 * @param events 已到达事件
 * @param sellerNames 卖家展示名
 * @param focusSellerId 聚焦卖家（重点展示回答）
 */
export function NegotiationTranscript({
  events,
  sellerNames,
  focusSellerId = "seller-c",
}: NegotiationTranscriptProps) {
  const questions = questionsFrom(events);
  const focusName =
    sellerNames[focusSellerId] ?? SELLER_FALLBACK_NAME[focusSellerId];

  if (questions.length === 0) {
    return (
      <div className="transcript transcript--empty">
        <MessagesSquare size={26} />
        <strong>等待机器询证开始</strong>
        <span>买家 Agent 发起证据请求后，问答将在此逐条显示。</span>
      </div>
    );
  }

  return (
    <div className="transcript">
      {questions.map((question) => {
        const focusAnswer = sellerAnswer(events, focusSellerId, question.id);
        return (
          <div className="qa" key={question.id}>
            <div className="qa__question">
              <span className="qa__avatar qa__avatar--buyer">
                <UserRound size={13} />
              </span>
              <div>
                <span className="qa__who">Buyer Agent 询问</span>
                <strong>
                  {QUESTION_TITLE[question.id] ?? question.prompt}
                </strong>
                <small>{question.prompt}</small>
              </div>
            </div>

            {/* 聚焦卖家的回答（重点，来自真实 answers） */}
            <div className={`qa__answer role-${sellerRole(focusSellerId)}`}>
              <span
                className={`qa__avatar role-${sellerRole(focusSellerId)}`}
              >
                {focusSellerId.slice(-1).toUpperCase()}
              </span>
              <div>
                <span className="qa__who">{focusName} 回答</span>
                <strong>{focusAnswer ?? "（尚未作答）"}</strong>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

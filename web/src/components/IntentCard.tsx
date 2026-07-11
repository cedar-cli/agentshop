/**
 * 第一幕 · Intent Card
 * 展示买家可执行意图的关键约束。发布前显示"预览"态，收到 intent.published 后显示"已广播"态。
 */

import {
  BadgeCheck,
  CircleDollarSign,
  FileCheck2,
  Radio,
  ShieldAlert,
  Timer,
  Zap,
} from "lucide-react";
import type { ExecutableIntent } from "../types";
import { usd } from "./format";

interface IntentCardProps {
  // 静态场景中的意图（用于发布前预览）
  intent: ExecutableIntent | undefined;
  // 是否已收到 intent.published（决定"预览"还是"已广播"）
  published: boolean;
}

/**
 * 意图卡组件。
 * @param intent 意图数据（预览或已发布均用同一份约束展示）
 * @param published 是否已广播
 */
export function IntentCard({ intent, published }: IntentCardProps) {
  if (!intent) {
    return (
      <div className="intent-card intent-card--empty">
        <span>场景加载中…</span>
      </div>
    );
  }

  return (
    <div className={`intent-card ${published ? "is-published" : "is-preview"}`}>
      <div className="intent-card__head">
        <div className="intent-card__title">
          <span className="tag tag--buyer">买家意图</span>
          <strong>新生儿低敏床品</strong>
        </div>
        <span className={`intent-card__state ${published ? "live" : ""}`}>
          <Radio size={12} />
          {published ? "已广播" : "预览"}
        </span>
      </div>

      <ul className="intent-constraints">
        <li>
          <CircleDollarSign size={14} className="ic ic--orange" />
          <span>Budget</span>
          <strong>≤ {usd(intent.budgetUsd)}</strong>
        </li>
        <li>
          <Timer size={14} className="ic ic--blue" />
          <span>Delivery</span>
          <strong>≤ {intent.deadlineHours}h</strong>
        </li>
        <li>
          <ShieldAlert size={14} className="ic ic--yellow" />
          <span>Risk</span>
          <strong>&lt; {intent.riskThreshold}</strong>
        </li>
        <li>
          <FileCheck2 size={14} className="ic ic--green" />
          <span>材料</span>
          <strong>必须可验证</strong>
        </li>
      </ul>

      <div className="intent-unacceptable">
        <span className="intent-unacceptable__label">不接受</span>
        <ul>
          {intent.unacceptable.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="intent-flags">
        <span className={`flag ${intent.autoPurchasePolicy.enabled ? "on" : ""}`}>
          <Zap size={12} />
          Auto Purchase Enabled
        </span>
        <span
          className={`flag ${
            intent.autoPurchasePolicy.requireAllMandatoryEvidence ? "on" : ""
          }`}
        >
          <BadgeCheck size={12} />
          Mandatory Evidence Required
        </span>
      </div>
    </div>
  );
}

/**
 * 四幕进度指示器。
 * 当前幕由 demo-state.currentAct 从真实事件推导而来，不由前端计时器推进。
 */

import { Check } from "lucide-react";
import type { Act } from "../demo-state";

interface ActProgressProps {
  // 当前幕（0-4）
  act: Act;
}

/** 四幕的固定文案（幕号从 1 开始展示）。 */
const ACTS: Array<{ index: 1 | 2 | 3 | 4; title: string; caption: string }> = [
  { index: 1, title: "发布意图", caption: "Buyer broadcasts intent" },
  { index: 2, title: "卖家响应", caption: "3 Seller Agents matched" },
  { index: 3, title: "机器询证", caption: "Evidence & negotiation" },
  { index: 4, title: "自动购买", caption: "Authorize & receipt" },
];

/**
 * 四幕进度条。
 * @param act 当前幕（0 表示尚未开始）
 */
export function ActProgress({ act }: ActProgressProps) {
  return (
    <ol className="act-progress" aria-label="四幕进度">
      {ACTS.map((item) => {
        const done = act > item.index;
        const active = act === item.index;
        return (
          <li
            key={item.index}
            className={`act-step ${done ? "done" : ""} ${active ? "active" : ""}`}
            aria-current={active ? "step" : undefined}
          >
            <span className="act-step__badge">
              {done ? <Check size={13} /> : item.index}
            </span>
            <span className="act-step__text">
              <strong>{item.title}</strong>
              <small>{item.caption}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

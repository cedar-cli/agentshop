/**
 * 可折叠事件账本（Event Ledger）
 * 展示每条事件的 sequence、type、source → target、hash 状态。
 * 默认折叠，不抢占主要视觉焦点；展开后按 sequence 顺序显示原始事件。
 */

import { ChevronDown, Link2 } from "lucide-react";
import { useState } from "react";
import type { NewbornEvent } from "../types";
import { EVENT_LABEL, shortHash } from "./format";

interface EventLedgerProps {
  // 已到达事件（已按 sequence 排序）
  events: NewbornEvent[];
}

/**
 * 事件账本。
 * @param events 已到达事件
 */
export function EventLedger({ events }: EventLedgerProps) {
  // 默认折叠，避免原始事件列表抢占主视觉
  const [open, setOpen] = useState(false);

  return (
    <div className={`ledger ${open ? "open" : ""}`}>
      <button
        className="ledger__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>
          Event Ledger
          <em>{events.length}</em>
        </span>
        <ChevronDown size={15} className="ledger__chevron" />
      </button>

      {open && (
        <div className="ledger__body">
          {events.length === 0 ? (
            <p className="ledger__empty">暂无事件</p>
          ) : (
            events.map((event) => (
              <div className="ledger-row" key={event.id}>
                <span className="ledger-row__seq">#{event.sequence}</span>
                <span className="ledger-row__type">
                  {EVENT_LABEL[event.type]}
                </span>
                <span className="ledger-row__flow">
                  {event.source}
                  {event.target && (
                    <>
                      <Link2 size={10} />
                      {event.target}
                    </>
                  )}
                </span>
                <span
                  className="ledger-row__hash"
                  title={event.hash}
                >
                  {shortHash(event.hash, 8)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

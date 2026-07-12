import { ArrowLeft, Bot, Radio, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { StoredEvent, TransactionSnapshot } from "../live/types";

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    "active-sale.product.ingested": "商品进入 Seller Agent",
    "active-sale.passport.published": "Product Passport 发布",
    "active-sale.buyer.matched": "Consent Router 匹配买家",
    "active-sale.proposal.routed": "提案进入授权 Inbox",
    "active-sale.proposal.blocked": "Closed Inbox 拦截",
    "active-sale.buyer.selected": "Consumer Agent 完成选择",
    "active-sale.completed": "授权范围内自动成交",
    "laptop.intent.structured": "采购意图结构化",
    "laptop.proposal.submitted": "卖家提交报价",
    "laptop.seller.selected": "Consumer Agent 选标",
    "laptop.order.confirmed": "订单确认",
    "restock.intent.created": "自主生成补库意图",
    "restock.order.confirmed": "补库订单确认",
  };
  return labels[type] ?? type;
}

function payloadSummary(event: StoredEvent) {
  const value = event.payload;
  if (typeof value.reason === "string") return value.reason;
  if (typeof value.reasoning === "string") return value.reasoning;
  if (typeof value.pitch === "string") return value.pitch;
  if (typeof value.summary === "string") return value.summary;
  if (typeof value.productName === "string")
    return `${value.productName} · ${String(value.amountUsd ?? "")}`;
  if (typeof value.displayName === "string") return value.displayName;
  return Object.entries(value)
    .slice(0, 3)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(" · ");
}

export function ConsumerTransactionTrace({
  transactionId,
  onBack,
}: {
  transactionId: string;
  onBack: () => void;
}) {
  const [snapshot, setSnapshot] = useState<TransactionSnapshot>();
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    const source = new EventSource(`/api/transactions/${transactionId}/events`);
    void fetch(`/api/transactions/${transactionId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<TransactionSnapshot>;
      })
      .then((value) => {
        if (active) {
          setSnapshot(value);
          setEvents(value.events);
        }
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    const receive = (message: Event) => {
      const event = JSON.parse(
        (message as MessageEvent<string>).data,
      ) as StoredEvent;
      setEvents((current) =>
        current.some((item) => item.id === event.id)
          ? current
          : [...current, event].sort((a, b) => a.sequence - b.sequence),
      );
    };
    const eventTypes = [
      "active-sale.product.ingested",
      "active-sale.passport.published",
      "active-sale.buyer.matched",
      "active-sale.proposal.routed",
      "active-sale.proposal.blocked",
      "active-sale.buyer.selected",
      "active-sale.completed",
      "laptop.intent.structured",
      "laptop.proposal.submitted",
      "laptop.seller.selected",
      "laptop.order.confirmed",
      "restock.intent.created",
      "restock.order.confirmed",
    ];
    eventTypes.forEach((type) => source.addEventListener(type, receive));
    source.onerror = () => source.close();
    return () => {
      active = false;
      source.close();
    };
  }, [transactionId]);

  return (
    <div className="consumer-transaction-trace">
      <header>
        <button type="button" onClick={onBack} title="返回 Inbox">
          <ArrowLeft size={15} />
        </button>
        <div>
          <span className="eyebrow">SHARED TRANSACTION</span>
          <h3>买家与卖家共享事件链</h3>
          <code>{transactionId}</code>
        </div>
        <span className="trace-chain">
          <ShieldCheck size={14} />
          {snapshot?.chainValid === false ? "CHAIN ERROR" : "HASH CHAIN"}
        </span>
      </header>
      {error && <div className="runtime-error">{error}</div>}
      <div className="trace-runtime">
        <Radio size={13} />
        <span>{snapshot?.status ?? "running"}</span>
        <b>{events.length} events</b>
      </div>
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <span>
              <Bot size={13} />
            </span>
            <div>
              <header>
                <strong>{eventLabel(event.type)}</strong>
                <time>
                  {new Date(event.timestamp).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </time>
              </header>
              <p>{payloadSummary(event)}</p>
              <small>
                {event.source}
                {event.target ? ` → ${event.target}` : ""}
              </small>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

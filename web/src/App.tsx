import {
  Activity,
  Bot,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  DatabaseZap,
  HandCoins,
  MessageSquareMore,
  PackageOpen,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Store,
  TriangleAlert,
  UsersRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentEvent,
  ConfirmedOrder,
  CounterOffer,
  CounterResponse,
  EventType,
  Proposal,
  SellerSelection,
  TransactionSnapshot,
} from "./types";

const EVENT_TYPES: EventType[] = [
  "purchase.requested",
  "proposal.submitted",
  "seller.selected",
  "counter.offer",
  "counter.response",
  "order.confirmed",
];

const eventLabels: Record<EventType, string> = {
  "purchase.requested": "采购需求已广播",
  "proposal.submitted": "商家提交提案",
  "seller.selected": "买家完成决策",
  "counter.offer": "买家发起还价",
  "counter.response": "商家回应还价",
  "order.confirmed": "订单已确认",
};

const sellerNames: Record<string, string> = {
  "seller-a": "Pulse Supply",
  "seller-b": "TrustMart",
  "seller-c": "FlashBox",
};

const weightPresets = {
  balanced: { label: "均衡", price: 0.34, reputation: 0.33, delivery: 0.33 },
  trust: { label: "信用优先", price: 0.3, reputation: 0.6, delivery: 0.1 },
  speed: { label: "时效优先", price: 0.2, reputation: 0.25, delivery: 0.55 },
} as const;

type WeightPreset = keyof typeof weightPresets;
type RunStatus = "idle" | "queued" | "running" | "completed" | "failed";

function defaultDeadline(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(12, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(value);
}

function proposalFromEvent(event: AgentEvent): Proposal | undefined {
  return event.type === "proposal.submitted"
    ? (event.payload as Proposal)
    : undefined;
}

function selectionFromEvent(event: AgentEvent): SellerSelection | undefined {
  return event.type === "seller.selected"
    ? (event.payload as SellerSelection)
    : undefined;
}

function orderFromEvent(event: AgentEvent): ConfirmedOrder | undefined {
  return event.type === "order.confirmed"
    ? (event.payload as ConfirmedOrder)
    : undefined;
}

function counterOfferFromEvent(event: AgentEvent): CounterOffer | undefined {
  return event.type === "counter.offer"
    ? (event.payload as CounterOffer)
    : undefined;
}

function counterResponseFromEvent(
  event: AgentEvent,
): CounterResponse | undefined {
  return event.type === "counter.response"
    ? (event.payload as CounterResponse)
    : undefined;
}

export function App() {
  const [product, setProduct] = useState("黑客松能量补给包");
  const [quantity, setQuantity] = useState(200);
  const [budget, setBudget] = useState(8000);
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [allergenSafe, setAllergenSafe] = useState(true);
  const [weightPreset, setWeightPreset] = useState<WeightPreset>("trust");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [routerOnline, setRouterOnline] = useState(false);
  const [transactionId, setTransactionId] = useState<string>();
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [chainValid, setChainValid] = useState<boolean>();
  const [error, setError] = useState<string>();
  const eventSourceRef = useRef<EventSource>();

  useEffect(() => {
    void fetch("/health")
      .then((response) => response.ok)
      .then(setRouterOnline)
      .catch(() => setRouterOnline(false));

    return () => eventSourceRef.current?.close();
  }, []);

  const proposals = useMemo(
    () => events.map(proposalFromEvent).filter(Boolean) as Proposal[],
    [events],
  );
  const selection = useMemo(
    () => events.map(selectionFromEvent).find(Boolean),
    [events],
  );
  const order = useMemo(
    () => events.map(orderFromEvent).find(Boolean),
    [events],
  );
  const counterOffer = useMemo(
    () => events.map(counterOfferFromEvent).find(Boolean),
    [events],
  );
  const counterResponse = useMemo(
    () => events.map(counterResponseFromEvent).find(Boolean),
    [events],
  );
  const activeEvent = events.at(-1);

  const mergeEvent = (incoming: AgentEvent) => {
    setEvents((current) => {
      if (current.some((event) => event.id === incoming.id)) return current;
      return [...current, incoming].sort(
        (left, right) => left.sequence - right.sequence,
      );
    });
  };

  const loadSnapshot = async (id: string) => {
    const response = await fetch(`/api/transactions/${id}`);
    if (!response.ok) return;
    const snapshot = (await response.json()) as TransactionSnapshot;
    setEvents(snapshot.events);
    setChainValid(snapshot.chainValid);
    setRunStatus(snapshot.status);
    if (snapshot.error) setError(snapshot.error);
  };

  const connectEvents = (id: string, eventsUrl: string) => {
    eventSourceRef.current?.close();
    const source = new EventSource(eventsUrl);
    eventSourceRef.current = source;

    for (const eventType of EVENT_TYPES) {
      source.addEventListener(eventType, (message) => {
        const event = JSON.parse((message as MessageEvent<string>).data) as AgentEvent;
        mergeEvent(event);
        setRunStatus(event.type === "order.confirmed" ? "completed" : "running");

        if (event.type === "order.confirmed") {
          window.setTimeout(() => {
            source.close();
            void loadSnapshot(id);
          }, 250);
        }
      });
    }

    source.onerror = () => {
      source.close();
      void loadSnapshot(id);
    };
  };

  const startTransaction = async () => {
    eventSourceRef.current?.close();
    setEvents([]);
    setChainValid(undefined);
    setTransactionId(undefined);
    setError(undefined);
    setRunStatus("queued");

    const weights = weightPresets[weightPreset];
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          quantity,
          budget,
          deadline: new Date(deadline).toISOString(),
          constraints: {
            allergenFree: allergenSafe ? ["peanut"] : [],
          },
          weights: {
            price: weights.price,
            reputation: weights.reputation,
            delivery: weights.delivery,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`创建交易失败：HTTP ${response.status}`);
      }

      const created = (await response.json()) as {
        transactionId: string;
        eventsUrl: string;
      };
      setTransactionId(created.transactionId);
      setRunStatus("running");
      connectEvents(created.transactionId, created.eventsUrl);
    } catch (cause) {
      setRunStatus("failed");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const reset = () => {
    eventSourceRef.current?.close();
    setRunStatus("idle");
    setTransactionId(undefined);
    setEvents([]);
    setChainValid(undefined);
    setError(undefined);
  };

  const busy = runStatus === "queued" || runStatus === "running";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <Store size={19} />
          </div>
          <div>
            <strong>AgentShop</strong>
            <span>The Empty Store</span>
          </div>
        </div>

        <div className="system-status" aria-label="系统状态">
          <div className={`status-item ${routerOnline ? "online" : "offline"}`}>
            {routerOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
            Router {routerOnline ? "Online" : "Offline"}
          </div>
          <div className="status-item model-status">
            <Sparkles size={15} />
            GPT-5.6 Luna
          </div>
          <div className="human-counter">
            <UsersRound size={16} />
            <span>Humans</span>
            <strong>0</strong>
          </div>
        </div>
      </header>

      <main className="workspace">
        <aside className="request-panel panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PURCHASE BRIEF</span>
              <h1>采购约束</h1>
            </div>
            <button
              className="icon-button"
              onClick={reset}
              title="重置交易"
              aria-label="重置交易"
            >
              <RotateCcw size={17} />
            </button>
          </div>

          <div className="product-visual">
            <div className="product-icon" aria-hidden="true">
              <PackageOpen size={38} strokeWidth={1.5} />
            </div>
            <div>
              <span>采购对象</span>
              <strong>{product || "未命名商品"}</strong>
              <small>200 份标准化补给组合</small>
            </div>
          </div>

          <label className="field">
            <span>商品名称</span>
            <input
              value={product}
              onChange={(event) => setProduct(event.target.value)}
              disabled={busy}
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>采购数量</span>
              <div className="input-suffix">
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  disabled={busy}
                />
                <em>份</em>
              </div>
            </label>
            <label className="field">
              <span>最高预算</span>
              <div className="input-suffix">
                <input
                  type="number"
                  min="1"
                  step="100"
                  value={budget}
                  onChange={(event) => setBudget(Number(event.target.value))}
                  disabled={busy}
                />
                <em>元</em>
              </div>
            </label>
          </div>

          <label className="field">
            <span>最晚送达</span>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              disabled={busy}
            />
          </label>

          <div className="field">
            <span>决策偏好</span>
            <div className="segmented" role="group" aria-label="决策偏好">
              {(Object.entries(weightPresets) as Array<
                [WeightPreset, (typeof weightPresets)[WeightPreset]]
              >).map(([key, preset]) => (
                <button
                  key={key}
                  className={weightPreset === key ? "active" : ""}
                  onClick={() => setWeightPreset(key)}
                  disabled={busy}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <label className="check-field">
            <input
              type="checkbox"
              checked={allergenSafe}
              onChange={(event) => setAllergenSafe(event.target.checked)}
              disabled={busy}
            />
            <span className="check-box" aria-hidden="true">
              <Check size={14} />
            </span>
            <span>
              <strong>花生过敏原禁用</strong>
              <small>作为不可妥协的硬约束</small>
            </span>
          </label>

          <button
            className="primary-command"
            onClick={() => void startTransaction()}
            disabled={busy || !routerOnline || !product || quantity <= 0 || budget <= 0}
          >
            {busy ? <Activity size={18} className="spin" /> : <Play size={18} />}
            {busy ? "Agent 正在交易" : "启动 Agent 采购"}
          </button>

          <div className="request-meta">
            <span>价格 {Math.round(weightPresets[weightPreset].price * 100)}%</span>
            <span>信用 {Math.round(weightPresets[weightPreset].reputation * 100)}%</span>
            <span>时效 {Math.round(weightPresets[weightPreset].delivery * 100)}%</span>
          </div>
        </aside>

        <section className="center-column">
          <section className="network-panel panel">
            <div className="panel-heading network-heading">
              <div>
                <span className="eyebrow">A2A LIVE NETWORK</span>
                <h2>决策准入网络</h2>
              </div>
              <div className={`run-state state-${runStatus}`}>
                <Radio size={14} />
                {runStatus === "idle" && "Waiting"}
                {runStatus === "queued" && "Queued"}
                {runStatus === "running" && "Live"}
                {runStatus === "completed" && "Settled"}
                {runStatus === "failed" && "Failed"}
              </div>
            </div>

            <div className={`network-stage network-${runStatus}`}>
              <div className="network-column buyer-column">
                <AgentNode
                  kind="buyer"
                  title="C-Agent"
                  subtitle={selection ? "决策完成" : busy ? "分析提案" : "等待需求"}
                  active={activeEvent?.source === "buyer-agent"}
                  selected={Boolean(order)}
                />
              </div>

              <div className="network-column router-column">
                <div className={`router-node ${busy ? "active" : ""}`}>
                  <Activity size={22} />
                  <strong>Event Router</strong>
                  <span>{events.length} events</span>
                </div>
                <div className={`network-beam ${busy ? "active" : ""}`} />
              </div>

              <div className="network-column seller-column">
                {["seller-a", "seller-b", "seller-c"].map((sellerId) => {
                  const proposal = proposals.find((item) => item.sellerId === sellerId);
                  return (
                    <AgentNode
                      key={sellerId}
                      kind="seller"
                      title={sellerNames[sellerId]}
                      subtitle={proposal ? formatCurrency(proposal.totalPrice) : "监听需求"}
                      active={activeEvent?.source === sellerId}
                      selected={selection?.sellerId === sellerId}
                      detail={proposal ? `${proposal.deliveryHours}h · 信用 ${proposal.reputation}` : undefined}
                    />
                  );
                })}
              </div>
            </div>

            <div className="transaction-strip">
              <span>TX</span>
              <code>{transactionId ?? "尚未创建交易"}</code>
              {order && (
                <strong>
                  <CheckCircle2 size={15} /> {sellerNames[order.sellerId]} 已锁单
                </strong>
              )}
            </div>
          </section>

          <section className="proposal-panel panel">
            <div className="panel-heading compact-heading">
              <div>
                <span className="eyebrow">PROPOSAL MATRIX</span>
                <h2>提案竞争</h2>
              </div>
              <span className="proposal-count">{proposals.length}/3 received</span>
            </div>

            <div className="proposal-table" role="table" aria-label="商家报价比较">
              <div className="proposal-row proposal-header" role="row">
                <span>Seller Agent</span>
                <span>报价</span>
                <span>交付</span>
                <span>信用</span>
                <span>来源</span>
              </div>
              {["seller-a", "seller-b", "seller-c"].map((sellerId) => {
                const proposal = proposals.find((item) => item.sellerId === sellerId);
                const winner = selection?.sellerId === sellerId;
                const negotiatedPrice =
                  counterResponse?.sellerId === sellerId
                    ? counterResponse.finalPrice
                    : undefined;
                return (
                  <div
                    className={`proposal-row ${winner ? "winner" : ""}`}
                    role="row"
                    key={sellerId}
                  >
                    <span className="seller-cell">
                      <span className={`seller-dot dot-${sellerId.at(-1)}`} />
                      <strong>{sellerNames[sellerId]}</strong>
                      {winner && <ShieldCheck size={15} />}
                    </span>
                    <span>
                      {negotiatedPrice
                        ? `${formatCurrency(proposal?.totalPrice ?? negotiatedPrice)} → ${formatCurrency(negotiatedPrice)}`
                        : proposal
                          ? formatCurrency(proposal.totalPrice)
                          : "—"}
                    </span>
                    <span>{proposal ? `${proposal.deliveryHours}h` : "—"}</span>
                    <span>{proposal?.reputation ?? "—"}</span>
                    <span className={proposal?.generatedBy === "fallback" ? "fallback-source" : "llm-source"}>
                      {proposal?.generatedBy ?? "—"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="decision-reason">
              <ShieldCheck size={18} />
              <div>
                <span>Buyer Agent Decision</span>
                <strong>
                  {counterResponse
                    ? `${sellerNames[counterResponse.sellerId]} 让利 ${formatCurrency(counterResponse.concession)}，最终 ${formatCurrency(counterResponse.finalPrice)}`
                    : counterOffer
                      ? `正在还价：${formatCurrency(counterOffer.originalPrice)} → ${formatCurrency(counterOffer.targetPrice)}`
                      : selection
                        ? `${sellerNames[selection.sellerId]} · ${selection.reason}`
                        : "等待全部提案进入决策集"}
                </strong>
              </div>
              {selection && <em>{selection.score.toFixed(2)}</em>}
            </div>
          </section>
        </section>

        <aside className="event-panel panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">VERIFIABLE EVENT LOG</span>
              <h2>交易事件</h2>
            </div>
            <span className="event-count">{events.length}</span>
          </div>

          <div className="event-timeline">
            {events.length === 0 ? (
              <div className="empty-events">
                <DatabaseZap size={28} />
                <strong>等待第一条链上事件</strong>
                <span>启动采购后，所有 Agent 行动将在这里实时追加。</span>
              </div>
            ) : (
              events.map((event, index) => (
                <EventItem
                  key={event.id}
                  event={event}
                  active={index === events.length - 1}
                />
              ))
            )}
          </div>

          <div className={`repchain-status ${chainValid === false ? "invalid" : ""}`}>
            <div className="chain-icon">
              {chainValid === false ? <TriangleAlert size={21} /> : <DatabaseZap size={21} />}
            </div>
            <div>
              <span>RepChain</span>
              <strong>
                {chainValid === undefined
                  ? "等待交易闭环"
                  : chainValid
                    ? "证据链校验通过"
                    : "证据链校验失败"}
              </strong>
            </div>
            <code>{events.at(-1)?.hash.slice(0, 8) ?? "--------"}</code>
          </div>

          {error && (
            <div className="error-banner">
              <TriangleAlert size={17} />
              {error}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

interface AgentNodeProps {
  kind: "buyer" | "seller";
  title: string;
  subtitle: string;
  active?: boolean;
  selected?: boolean;
  detail?: string;
}

function AgentNode({
  kind,
  title,
  subtitle,
  active,
  selected,
  detail,
}: AgentNodeProps) {
  return (
    <div className={`agent-node ${kind} ${active ? "active" : ""} ${selected ? "selected" : ""}`}>
      <div className="agent-avatar">
        {kind === "buyer" ? <Bot size={21} /> : <Store size={20} />}
      </div>
      <div className="agent-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
        {detail && <small>{detail}</small>}
      </div>
      <span className="agent-signal" />
    </div>
  );
}

function EventItem({ event, active }: { event: AgentEvent; active: boolean }) {
  const proposal = proposalFromEvent(event);
  const selection = selectionFromEvent(event);
  const counterOffer = counterOfferFromEvent(event);
  const counterResponse = counterResponseFromEvent(event);
  const order = orderFromEvent(event);

  let detail = `${event.source}${event.target ? ` → ${event.target}` : ""}`;
  if (proposal) detail = `${sellerNames[proposal.sellerId]} · ${formatCurrency(proposal.totalPrice)}`;
  if (selection) detail = `${sellerNames[selection.sellerId]} · score ${selection.score}`;
  if (counterOffer) {
    detail = `${formatCurrency(counterOffer.originalPrice)} → ${formatCurrency(counterOffer.targetPrice)}`;
  }
  if (counterResponse) {
    detail = `${sellerNames[counterResponse.sellerId]} · 最终 ${formatCurrency(counterResponse.finalPrice)}`;
  }
  if (order) detail = `${sellerNames[order.sellerId]} · ${formatCurrency(order.totalPrice)}`;

  return (
    <div className={`event-item ${active ? "active" : ""}`}>
      <div className="event-marker">
        {event.type === "purchase.requested" && <Radio size={14} />}
        {event.type === "proposal.submitted" && <CircleDollarSign size={14} />}
        {event.type === "seller.selected" && <ShieldCheck size={14} />}
        {event.type === "counter.offer" && <MessageSquareMore size={14} />}
        {event.type === "counter.response" && <HandCoins size={14} />}
        {event.type === "order.confirmed" && <CheckCircle2 size={14} />}
      </div>
      <div className="event-copy">
        <span>
          #{event.sequence} · {eventLabels[event.type]}
        </span>
        <strong>{detail}</strong>
        <code>{event.hash.slice(0, 12)}</code>
      </div>
      <time>
        <Clock3 size={12} />
        {new Date(event.timestamp).toLocaleTimeString("zh-CN", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </time>
    </div>
  );
}

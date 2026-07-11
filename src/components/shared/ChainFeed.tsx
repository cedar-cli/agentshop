import { useState } from "react";
import { useWorld } from "../../core/store";
import { AttestationChip } from "./AttestationChip";
import type { Attestation, DealMessage } from "../../core/types";
import "./chainfeed.css";

const ACTOR_LABEL: Record<DealMessage["actor"], string> = {
  buyer: "买家 C-Agent",
  seller: "卖家 S-Agent",
  chain: "RepChain",
};

export function ChainFeed() {
  const attestations = useWorld((s) => s.attestations);
  const riskEvents = useWorld((s) => s.riskEvents);
  const tick = useWorld((s) => s.tick);
  const [selected, setSelected] = useState<Attestation | null>(null);

  const fulfilCount = attestations.filter((a) => a.verdict === "fulfil").length;
  const breachCount = attestations.length - fulfilCount;

  return (
    <aside className="chain-feed panel">
      <header className="cf-head">
        <div>
          <div className="eyebrow">RepChain · 信用链</div>
          <h3 className="cf-title">交易信任流</h3>
        </div>
        <div className="cf-stat">
          <span className="num">#{tick}</span>
          <span className="cf-substat">
            <b className="ok num">{fulfilCount}</b>/
            <b className="bad num">{breachCount}</b>
          </span>
        </div>
      </header>

      <p className="cf-note">交易闭环强制自动生成 · 不可删改 · 买家信用加权</p>

      {riskEvents.filter((r) => !r.resolved).length > 0 && (
        <div className="cf-risk-banner">
          <span className="pulse" />
          信用链校验中：{riskEvents.filter((r) => !r.resolved).length} 起异常
        </div>
      )}

      <ul className="cf-list scroll-y">
        {attestations.length === 0 && (
          <li className="cf-empty">等待首笔交易履约上链…</li>
        )}
        {attestations.map((att) => (
          <li key={att.id} className="cf-row">
            <AttestationChip att={att} onClick={() => setSelected(att)} />
            <span className="cf-buyer">{att.buyerName}</span>
          </li>
        ))}
      </ul>

      {selected && (
        <TraceDrawer att={selected} onClose={() => setSelected(null)} />
      )}
    </aside>
  );
}

function TraceDrawer({
  att,
  onClose,
}: {
  att: Attestation;
  onClose: () => void;
}) {
  const fulfil = att.verdict === "fulfil";
  return (
    <div className="trace-drawer" role="dialog" aria-label="履约详情与交易溯源">
      <header className="td-head">
        <div>
          <div className="eyebrow">履约详情 · 全链路可追溯</div>
          <h4>
            {att.category} ·{" "}
            <span className={fulfil ? "ok" : "bad"}>
              {fulfil ? "优质履约" : "违约记录"}
            </span>
          </h4>
        </div>
        <button className="td-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
      </header>

      {/* 哪家店 · 成交价 */}
      <div className="td-deal">
        <div className="td-shop">
          <span className="td-shop-name" title={att.sellerName}>
            {att.sellerName}
          </span>
          <span className="td-shop-sub">
            信用 {att.sellerCredit} · {att.competitors} 家竞价胜出 · 承诺{" "}
            {att.promisedDays} 天达
          </span>
        </div>
        <div className="td-price">
          <span className="td-price-val num">¥{att.price}</span>
          <span className="td-price-label">成交价</span>
        </div>
      </div>

      <div className="td-scores">
        <Metric label="综合" value={att.overall} accent />
        <Metric
          label="加权"
          value={att.weight >= 100 ? 999 : att.weight}
          weight
        />
        <Metric label="买家信用" value={att.buyerCredit} />
      </div>

      {/* A2A 交易过程 */}
      <section className="td-section">
        <div className="td-section-head">
          <span className="eyebrow">A2A 交易过程</span>
          <span className="td-section-sub">Agent 自主议价 · 逐条上链</span>
        </div>
        <ol className="td-chat">
          {att.conversation.map((msg, i) => (
            <li key={i} className={`td-msg ${msg.actor}`}>
              <span className="td-msg-who">{ACTOR_LABEL[msg.actor]}</span>
              <p className="td-msg-text">{msg.text}</p>
              {msg.meta && <span className="td-msg-meta">{msg.meta}</span>}
            </li>
          ))}
        </ol>
      </section>

      {/* 履约链路 */}
      <section className="td-section">
        <div className="td-section-head">
          <span className="eyebrow">履约链路</span>
          <span className="td-section-sub">
            订单 → 物流 → 仓储 → 质检 → 售后
          </span>
        </div>
        <ol className="td-trace">
          {att.trace.map((t, i) => (
            <li key={i} className={t.ok ? "ok" : "bad"}>
              <span className="td-node">{t.node}</span>
              <span className="td-detail">{t.detail}</span>
              <span className="td-mark">{t.ok ? "✓" : "✕"}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="td-foot">
        {att.professional
          ? "专业鉴证 Agent 出具 · 权重抵百份普通鉴证"
          : "卖家无法干预 · 无法关闭 · 唯一修复途径是优化后续履约"}
      </footer>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  weight,
}: {
  label: string;
  value: number;
  accent?: boolean;
  weight?: boolean;
}) {
  return (
    <div className={`td-metric ${accent ? "accent" : ""}`}>
      <span className="td-metric-val num">
        {weight && value === 999 ? "专业" : value.toFixed(weight ? 1 : 0)}
      </span>
      <span className="td-metric-label">{label}</span>
    </div>
  );
}

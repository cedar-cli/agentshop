import { useEffect, useState } from "react";
import {
  Check,
  Gavel,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Swords,
  UserRound,
  X,
} from "lucide-react";
import {
  ARENA_FINAL,
  ARENA_OPENING,
  ARENA_ROUNDS,
  ARENA_SELLER,
  LINEUP_POOL,
  LINEUP_STATS,
  THEATER_DEMAND,
  type CardType,
} from "../../demo/theater";
import { yuan } from "../../lib/format";
import "./decisiontheater.css";

type Phase = "lineup" | "arena";

const LINEUP_MS = 300;
const ARENA_MS = 1950;
const HANDOFF_MS = 950;

const CARD_LABEL: Record<CardType, string> = {
  open: "开价",
  evidence: "证据牌",
  counter: "反制牌",
  concession: "让步",
  close: "成交",
};

/**
 * 决策剧场：一条连贯的两幕戏。
 * 幕一「卖家海选」——几十家提案飞入，Agent 逐个刷掉，留 3 家。
 * 幕二「议价擂台」——C-Agent ↔ S-Agent 回合对弈，价格随筹码收敛。
 */
export function DecisionTheater() {
  const [phase, setPhase] = useState<Phase>("lineup");
  const [lineupStep, setLineupStep] = useState(0);
  const [arenaStep, setArenaStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const lineupDone = lineupStep >= LINEUP_POOL.length;
  const arenaDone = arenaStep >= ARENA_ROUNDS.length;

  useEffect(() => {
    if (!playing) return;
    if (phase === "lineup") {
      if (!lineupDone) {
        const timer = window.setTimeout(
          () => setLineupStep((step) => step + 1),
          LINEUP_MS,
        );
        return () => window.clearTimeout(timer);
      }
      // 幕一结束，交棒幕二
      const timer = window.setTimeout(() => {
        setArenaStep(0);
        setPhase("arena");
      }, HANDOFF_MS);
      return () => window.clearTimeout(timer);
    }
    if (!arenaDone) {
      const timer = window.setTimeout(
        () => setArenaStep((step) => step + 1),
        ARENA_MS,
      );
      return () => window.clearTimeout(timer);
    }
    setPlaying(false);
    return;
  }, [playing, phase, lineupStep, arenaStep, lineupDone, arenaDone]);

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (phase === "arena" && arenaDone) {
      // 全程演完，从头连演
      setPhase("lineup");
      setLineupStep(0);
      setArenaStep(0);
    }
    setPlaying(true);
  };

  const reset = () => {
    setPlaying(false);
    setPhase("lineup");
    setLineupStep(0);
    setArenaStep(0);
  };

  const jump = (target: Phase) => {
    setPlaying(false);
    if (target === "lineup") {
      setPhase("lineup");
      if (lineupStep === 0) setLineupStep(LINEUP_POOL.length);
    } else {
      setPhase("arena");
    }
  };

  return (
    <div className="theater">
      <header className="theater-head">
        <div className="theater-title">
          <span className="theater-mark">
            <Swords size={16} />
          </span>
          <div>
            <span className="eyebrow">决策剧场 · 是商品来面试你</span>
            <h3>{THEATER_DEMAND.title}</h3>
          </div>
        </div>

        <div className="theater-signal">
          <ShieldCheck size={13} />
          <span>{THEATER_DEMAND.constraints.join(" · ")}</span>
          <em>{THEATER_DEMAND.note}</em>
        </div>

        <div className="theater-acts">
          <button
            type="button"
            className={phase === "lineup" ? "on" : ""}
            onClick={() => jump("lineup")}
          >
            幕一 · 海选
          </button>
          <button
            type="button"
            className={phase === "arena" ? "on" : ""}
            onClick={() => jump("arena")}
          >
            幕二 · 擂台
          </button>
        </div>

        <div className="theater-controls">
          <button type="button" className="theater-play" onClick={toggle}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
            <span>
              {playing ? "暂停" : arenaDone ? "重新连演" : "连演全程"}
            </span>
          </button>
          <button
            type="button"
            className="theater-reset"
            onClick={reset}
            title="重置"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </header>

      <div className="theater-stage">
        {phase === "lineup" ? (
          <LineupAct step={lineupStep} />
        ) : (
          <ArenaAct step={arenaStep} />
        )}
      </div>
    </div>
  );
}

/* ---------------- 幕一 · 卖家海选 ---------------- */

function LineupAct({ step }: { step: number }) {
  const processed = LINEUP_POOL.slice(0, step);
  const passed = processed.filter((c) => c.status === "pass");
  const rejected = processed.length - passed.length;
  const current = step > 0 ? LINEUP_POOL[step - 1] : null;
  const done = step >= LINEUP_POOL.length;

  return (
    <div className="lineup">
      <div className="lineup-status">
        <div className="lineup-counts">
          <span>
            已筛 <b className="num">{step}</b>/{LINEUP_STATS.total}
          </span>
          <span className="lineup-cut">
            淘汰 <b className="num">{rejected}</b>
          </span>
          <span className="lineup-keep">
            入选 <b className="num">{passed.length}</b>
          </span>
        </div>
        <div
          className={`lineup-verdict ${
            current ? (current.status === "pass" ? "pass" : "reject") : "idle"
          }`}
        >
          {current ? (
            <>
              {current.status === "pass" ? (
                <Check size={14} />
              ) : (
                <X size={14} />
              )}
              <b>{current.seller}</b>
              <span>{current.reason}</span>
            </>
          ) : (
            <span>发布匿名需求轮廓，等待 S-Agent 提案飞入…</span>
          )}
        </div>
      </div>

      <div className="lineup-grid">
        {LINEUP_POOL.map((candidate, index) => {
          const decided = index < step;
          const isCurrent = index === step - 1;
          const state = !decided
            ? "pending"
            : candidate.status === "pass"
              ? "pass"
              : "reject";
          return (
            <div
              key={candidate.id}
              className={`lineup-chip ${state} ${isCurrent ? "scanning" : ""}`}
            >
              <span className="lineup-chip-name">{candidate.seller}</span>
              <span className="lineup-chip-credit num">
                信 {candidate.credit}
              </span>
              {decided && candidate.status === "reject" && (
                <span className="lineup-chip-x">
                  <X size={11} />
                </span>
              )}
              {decided && candidate.status === "pass" && (
                <span className="lineup-chip-ok">
                  <Check size={11} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="lineup-tray">
        <span className="eyebrow">
          {done ? "最终决策集 · 3 家入围" : "入选决策集"}
        </span>
        <div className="lineup-tray-list">
          {passed.length === 0 && (
            <span className="lineup-tray-empty">尚无卖家通过准入…</span>
          )}
          {passed.map((candidate, index) => (
            <div key={candidate.id} className="lineup-final">
              <span className="lineup-final-rank num">{index + 1}</span>
              <div>
                <strong>{candidate.seller}</strong>
                <small>{candidate.reason}</small>
              </div>
              <b className="num">{yuan(candidate.price)}</b>
            </div>
          ))}
        </div>
        {done && (
          <p className="lineup-foot">
            从 {LINEUP_STATS.total} 家提案里，Agent 按链上硬指标刷掉{" "}
            {LINEUP_STATS.rejected} 家（信用不足 / 参数掺假 / 时效超限 / 超预算
            / 售后过低），只留 3 家进决赛。下一步：和冠军当面议价。
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------- 幕二 · 议价擂台 ---------------- */

function ArenaAct({ step }: { step: number }) {
  const revealed = ARENA_ROUNDS.slice(0, step);
  const currentPrice = step > 0 ? ARENA_ROUNDS[step - 1].price : ARENA_OPENING;
  const done = step >= ARENA_ROUNDS.length;
  const saved = ARENA_OPENING - ARENA_FINAL;

  return (
    <div className="arena">
      <div className="arena-sides">
        <div className="arena-fighter buyer">
          <span className="arena-avatar">
            <UserRound size={18} />
          </span>
          <strong>我的 C-Agent</strong>
          <small>只代表买家 · 不收返点</small>
        </div>

        <div className="arena-center">
          <span className="eyebrow">桌面价格</span>
          <div className={`arena-price num ${done ? "closed" : ""}`}>
            {yuan(currentPrice)}
          </div>
          <div className="arena-round-count">
            回合 <b className="num">{Math.min(step, ARENA_ROUNDS.length)}</b>/
            {ARENA_ROUNDS.length}
          </div>
          {done && (
            <div className="arena-deal">
              <Gavel size={13} />
              成交 · 省 {yuan(saved)} + 延保 1 年
            </div>
          )}
        </div>

        <div className="arena-fighter seller">
          <span className="arena-avatar">
            <ShieldCheck size={18} />
          </span>
          <strong>{ARENA_SELLER}</strong>
          <small>S-Agent · 3C 榜 #1</small>
        </div>
      </div>

      <ol className="arena-rounds">
        {revealed.map((round, index) => {
          const isLatest = index === revealed.length - 1;
          return (
            <li
              key={index}
              className={`arena-round ${round.actor} ${
                isLatest ? "latest" : ""
              } card-${round.cardType}`}
            >
              <div className="arena-card">
                <div className="arena-card-head">
                  <span className="arena-card-type">
                    {CARD_LABEL[round.cardType]}
                  </span>
                  <strong>{round.title}</strong>
                </div>
                <p>{round.detail}</p>
                {round.chip && (
                  <span className="arena-chip">
                    <ShieldCheck size={11} />
                    {round.chip}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="arena-foot">
        筹码 =
        链上信用硬数据，不是话术。买家甩证据、卖家亮履约，价格随可信数据收敛。
      </p>
    </div>
  );
}

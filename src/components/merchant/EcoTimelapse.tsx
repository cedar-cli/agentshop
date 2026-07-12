import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Minus,
  Pause,
  Play,
  RotateCcw,
  Sprout,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  UserRound,
} from "lucide-react";
import { useWorld } from "../../core/store";
import {
  ARCHETYPE_LABEL,
  ECO_YEAR_DAYS,
  FACTORS,
  createSim,
  dayLabel,
  diagnose,
  intentBoards,
  intentDiagnosis,
  ranking,
  stepSim,
  type Archetype,
  type EcoDeal,
  type EcoSim,
  type FactorKey,
} from "../../core/evolution";
import { CATEGORIES, type Category } from "../../core/types";
import "./eco.css";

const STEP_MS = 165; // 每个模拟步的真实时长（×1）≈10.7s/年

const FACTOR_LABEL: Record<FactorKey, string> = Object.fromEntries(
  FACTORS.map((f) => [f.key, f.label]),
) as Record<FactorKey, string>;

/** 竞速榜/意图榜共用的行视图模型 */
interface RowVM {
  id: string;
  name: string;
  archetype: Archetype;
  score: number;
  rank: number;
  /** 名次变化：>0 上升、<0 下滑 */
  delta: number;
  flagged: boolean;
  up: boolean;
}

function buildSim(category: Category): EcoSim {
  const agents = useWorld.getState().agents;
  const sellers = Object.values(agents)
    .filter((a) => a.role === "seller")
    .map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      credit: s.credit,
    }));
  return createSim(sellers, category, 42);
}

/**
 * 一年只需十秒：事件驱动的生态演化。
 * persona 买家带真实意图持续下单 → 匹配沟通 → 满意/差评/流失，
 * 结果按维度归因，驱动卖家信誉与排名；随时可查看任一卖家的诊断与改进建议。
 */
export function EcoTimelapse() {
  const [category, setCategory] = useState<Category>("3C数码");
  const [nonce, setNonce] = useState(0);
  const [sim, setSim] = useState<EcoSim>(() => buildSim("3C数码"));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intentTab, setIntentTab] = useState<string>("overall");

  // 品类切换 / 重置 → 重建模拟
  useEffect(() => {
    setSim(buildSim(category));
    setPlaying(false);
    setSelectedId(null);
    setIntentTab("overall");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, nonce]);

  const done = sim.day >= ECO_YEAR_DAYS;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last: number | null = null;
    let acc = 0;
    const tick = (t: number) => {
      if (last != null) acc += (t - last) * speed;
      last = t;
      if (acc >= STEP_MS) {
        acc = 0;
        setSim((prev) => (prev.day >= ECO_YEAR_DAYS ? prev : stepSim(prev)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  useEffect(() => {
    if (done) setPlaying(false);
  }, [done]);

  const board = useMemo(() => ranking(sim), [sim]);
  const boards = useMemo(() => intentBoards(sim), [sim]);
  const selected = board.find((m) => m.id === selectedId) ?? board[0] ?? null;
  const report = selected ? diagnose(selected, selected.rank) : null;
  const intentDiag = useMemo(
    () => (selected ? intentDiagnosis(sim, selected.id) : null),
    [sim, selected],
  );
  const progress = Math.min(1, sim.day / ECO_YEAR_DAYS);
  const leader = board[0];
  const wiped = board.filter((m) => m.flagged).length;

  // 综合信用榜（含相对初始信用名次的变化），与意图榜统一成同一行结构
  const overallRows = useMemo<RowVM[]>(() => {
    const startOrder = sim.merchants
      .slice()
      .sort((a, b) => b.startCredit - a.startCredit);
    const startRank = new Map(startOrder.map((m, i) => [m.id, i + 1]));
    return board.map((m) => ({
      id: m.id,
      name: m.name,
      archetype: m.archetype,
      score: Math.round(m.credit),
      rank: m.rank,
      delta: (startRank.get(m.id) ?? m.rank) - m.rank,
      flagged: m.flagged,
      up: m.credit >= m.startCredit,
    }));
  }, [sim, board]);

  const activeBoard = boards.find((b) => b.personaId === intentTab) ?? null;
  const activeRows: RowVM[] =
    intentTab === "overall"
      ? overallRows
      : (activeBoard?.rows ?? []).map((r) => ({
          id: r.merchantId,
          name: r.name,
          archetype: r.archetype,
          score: r.score,
          rank: r.rank,
          delta: r.delta,
          flagged: r.flagged,
          up: r.delta >= 0,
        }));

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (done) setSim(buildSim(category));
    setPlaying(true);
  };

  const reset = () => {
    setPlaying(false);
    setNonce((n) => n + 1);
  };

  return (
    <div className="eco">
      <header className="eco-head">
        <div className="eco-title">
          <span className="eyebrow">生态演化 · 一年只需十秒</span>
          <h3>{category} · 交易驱动的信誉竞速</h3>
        </div>
        <div className="eco-cats">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={cat === category ? "on" : ""}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="eco-controls">
          <button type="button" className="eco-play" onClick={toggle}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
            <span>{playing ? "暂停" : done ? "重播一年" : "快进一年"}</span>
          </button>
          <div className="eco-speed">
            {[1, 2].map((s) => (
              <button
                key={s}
                type="button"
                className={speed === s ? "on" : ""}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
          <button
            type="button"
            className="eco-reset"
            onClick={reset}
            title="重置"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </header>

      <div className="eco-timeline">
        <div className="eco-day num">{dayLabel(sim.day)}</div>
        <div className="eco-progress">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="eco-summary">
          <span className="eco-leader">
            <Sprout size={12} />
            榜首 {leader?.name ?? "—"}
          </span>
          <span className="eco-wiped">
            <TrendingDown size={12} />
            枯萎沉底 {wiped}
          </span>
        </div>
      </div>

      <div className="eco-body">
        {/* 左：交易流 */}
        <section className="eco-stream">
          <div className="eco-panel-title">
            <span className="eyebrow">买家 ↔ 卖家 · 实时交易流</span>
            <span className="num">{sim.deals.length}</span>
          </div>
          <ol className="eco-deals">
            {sim.deals.length === 0 && (
              <li className="eco-deal-empty">
                点击「快进一年」，看 persona 带着真实意图下单…
              </li>
            )}
            {sim.deals.map((deal) => (
              <DealRow key={deal.id} deal={deal} />
            ))}
          </ol>
        </section>

        {/* 中：多意图榜（含综合信用），带名次变化 */}
        <section className="eco-race">
          <div className="eco-panel-title">
            <span className="eyebrow">
              意图榜 · 同一卖家 · 不同意图不同名次
            </span>
          </div>
          <div className="eco-intent-tabs">
            <button
              type="button"
              className={intentTab === "overall" ? "on" : ""}
              onClick={() => setIntentTab("overall")}
            >
              综合信用
            </button>
            {boards.map((b) => (
              <button
                key={b.personaId}
                type="button"
                className={intentTab === b.personaId ? "on" : ""}
                onClick={() => setIntentTab(b.personaId)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <p className="eco-intent-hint">
            {activeBoard
              ? `这类买家最看重「${activeBoard.strictLabel}」 · 名次随一年成交演化`
              : "按客观鉴证驱动的综合信用排序 · 无法购买"}
          </p>
          <div className="eco-race-list">
            {activeRows.map((r) => {
              const kind = r.flagged ? "flagged" : r.up ? "up" : "down";
              return (
                <button
                  type="button"
                  key={r.id}
                  className={`eco-row ${kind} ${r.rank === 1 ? "leader" : ""} ${
                    selected?.id === r.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <span className="eco-rank num">{r.rank}</span>
                  <span className="eco-name-wrap">
                    <span className="eco-name">{r.name}</span>
                    <span className="eco-arche">
                      {ARCHETYPE_LABEL[r.archetype]}
                    </span>
                  </span>
                  <DeltaChip delta={r.delta} flagged={r.flagged} />
                  <div className="eco-bar-track">
                    <span
                      className="eco-bar"
                      style={{ width: `${r.score}%` }}
                    />
                  </div>
                  <span className="eco-credit num">{r.score}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 右：诊断报告 */}
        <section className="eco-report">
          {report ? (
            <>
              <div className="eco-panel-title">
                <span className="eyebrow">演化诊断 · {report.name}</span>
                <span className="eco-arche-badge">
                  {ARCHETYPE_LABEL[report.archetype]}
                </span>
              </div>

              <div className="eco-kpis">
                <div className="eco-kpi">
                  <b className="num">{report.deals}</b>
                  <span>成交笔数</span>
                </div>
                <div className="eco-kpi">
                  <b className="num">{report.satisfaction}%</b>
                  <span>满意率</span>
                </div>
                <div className="eco-kpi">
                  <b className="num">
                    {report.creditFrom}
                    <ArrowRight size={11} />
                    {report.creditNow}
                  </b>
                  <span>信用变化</span>
                </div>
              </div>

              <div className="eco-attr">
                <span className="eyebrow">失分归因</span>
                {report.issueBreakdown.length === 0 ? (
                  <div className="eco-attr-none">
                    <ThumbsUp size={13} />
                    无明显失分，履约稳定
                  </div>
                ) : (
                  <div className="eco-attr-bars">
                    {report.issueBreakdown.map((b) => {
                      const max = report.issueBreakdown[0].count || 1;
                      const isTop = b.key === report.topIssue;
                      return (
                        <div
                          key={b.key}
                          className={`eco-attr-row ${isTop ? "top" : ""}`}
                        >
                          <span className="eco-attr-label">
                            <ThumbsDown size={10} />
                            {FACTOR_LABEL[b.key]}
                          </span>
                          <span className="eco-attr-track">
                            <i style={{ width: `${(b.count / max) * 100}%` }} />
                          </span>
                          <span className="eco-attr-count num">{b.count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {intentDiag && (
                <div className="eco-standings">
                  <span className="eyebrow">
                    意图榜站位 · 同一履约在各类买家眼中的名次
                  </span>
                  <div className="eco-standings-grid">
                    {intentDiag.standings.map((s) => {
                      const tone =
                        s.personaId === intentDiag.best?.personaId
                          ? "best"
                          : s.personaId === intentDiag.worst?.personaId
                            ? "worst"
                            : "";
                      return (
                        <div
                          key={s.personaId}
                          className={`eco-standing ${tone}`}
                        >
                          <span className="eco-standing-label">{s.label}</span>
                          <span className="eco-standing-rank num">
                            #{s.rank}
                          </span>
                          <DeltaChip delta={s.delta} flagged={false} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="eco-report-summary">{report.summary}</p>

              <div className="eco-advice">
                <span className="eco-advice-icon">
                  <Lightbulb size={14} />
                </span>
                <div>
                  <span className="eyebrow">改进建议</span>
                  {intentDiag?.advice && (
                    <p className="eco-advice-cross">{intentDiag.advice}</p>
                  )}
                  <p>{report.advice}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="eco-report-empty">
              <UserRound size={20} />
              <p>选择一个卖家查看诊断</p>
            </div>
          )}
        </section>
      </div>

      <p className="eco-foot">
        {done
          ? "一年演完：同一个卖家在不同意图榜的名次可以天差地别——擅长的意图爬上榜首，短板对应的意图被差评与流失拖到垫底。切换意图榜看名次变化，点卖家看它「强在哪类买家、弱在哪类买家」以及为什么。"
          : "演化进行中：每笔交易由带真实意图的 persona 驱动，结果按维度归因，同时改写「综合信用」与各「意图榜」的名次。"}
      </p>
    </div>
  );
}

/** 名次变化徽标：上升绿、下滑红、持平灰 */
function DeltaChip({ delta, flagged }: { delta: number; flagged: boolean }) {
  if (flagged) {
    return (
      <span className="eco-delta down">
        <TrendingDown size={10} />
        沉底
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="eco-delta up">
        <ChevronUp size={10} />
        {delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="eco-delta down">
        <ChevronDown size={10} />
        {-delta}
      </span>
    );
  }
  return (
    <span className="eco-delta flat">
      <Minus size={9} />
    </span>
  );
}

function DealRow({ deal }: { deal: EcoDeal }) {
  const tag =
    deal.outcome === "happy"
      ? "满意"
      : deal.outcome === "unhappy"
        ? `差评 · ${deal.issue ? FACTOR_LABEL[deal.issue] : ""}`
        : `流失 · ${deal.issue ? FACTOR_LABEL[deal.issue] : ""}`;
  const Icon = deal.outcome === "happy" ? ThumbsUp : ThumbsDown;
  return (
    <li className={`eco-deal ${deal.outcome}`}>
      <span className="eco-deal-persona">{deal.personaLabel}</span>
      <span className="eco-deal-intent">「{deal.intent}」</span>
      <span className="eco-deal-flow">
        <ArrowRight size={11} />
        {deal.merchantName}
      </span>
      <span className="eco-deal-tag">
        <Icon size={10} />
        {tag}
      </span>
    </li>
  );
}

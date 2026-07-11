/**
 * The Empty Store · 新生儿低敏床品四幕式实时 Demo
 *
 * App 只做编排：从 useNewbornBeddingDemo 取真实状态，按四幕把各组件铺进三列工作台。
 * 所有剧情推进都由真实事件驱动（见 hooks/useNewbornBeddingDemo + demo-state），
 * 这里不含任何计时器伪造逻辑。
 */

import {
  Activity,
  Radio,
  RotateCcw,
  Send,
  Store,
  UsersRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useMemo } from "react";
import { A2ANetwork } from "./components/A2ANetwork";
import { ActProgress } from "./components/ActProgress";
import { AgentOrder } from "./components/AgentOrder";
import { EvidenceChecklist } from "./components/EvidenceChecklist";
import { EventLedger } from "./components/EventLedger";
import { IntentCard } from "./components/IntentCard";
import { LiveReceiptCard } from "./components/LiveReceiptCard";
import { NegotiationTranscript } from "./components/NegotiationTranscript";
import { SellerBackend } from "./components/SellerBackend";
import { SellerRanking } from "./components/SellerRanking";
import {
  authorization as selectAuthorization,
  currentAct,
  publishedIntent,
  receipt as selectReceipt,
} from "./demo-state";
import { useNewbornBeddingDemo } from "./hooks/useNewbornBeddingDemo";

/** 聚焦卖家：贯穿叙事重点展示 Seller C。 */
const FOCUS_SELLER = "seller-c";

export function App() {
  const demo = useNewbornBeddingDemo();
  const { phase, scenario, events, transactionId, chainValid, error } = demo;

  // 卖家 id → 展示名映射（来自场景；场景未加载时为空对象）
  const sellerNames = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const seller of scenario?.sellers ?? []) {
      map[seller.sellerId] = seller.displayName;
    }
    return map;
  }, [scenario]);

  // 派生态：全部来自真实事件
  const act = currentAct(events);
  const intent = publishedIntent(events) ?? scenario?.intent;
  const intentPublished = publishedIntent(events) !== undefined;
  const authorization = selectAuthorization(events);
  const receipt = selectReceipt(events);

  const running = phase === "running" || phase === "queued";
  const online = phase !== "offline" && phase !== "loading";

  return (
    <div className="app">
      <Topbar phase={phase} humans={0} online={online} />

      {phase === "offline" && (
        <div className="banner banner--offline">
          <WifiOff size={15} />
          后端不可用，无法加载场景。请确认服务已启动后刷新。
        </div>
      )}
      {error && (
        <div className="banner banner--error">
          <Activity size={15} />
          {error}
        </div>
      )}
      {demo.usedSnapshotFallback && phase !== "completed" && (
        <div className="banner banner--info">
          <Radio size={15} />
          SSE 连接中断，已回退到交易快照。
        </div>
      )}

      <main className="board">
        {/* ---------- 左列：意图 / 买家 / Router 广播 ---------- */}
        <aside className="col col--left">
          <Panel eyebrow="EXECUTABLE INTENT" title="可执行意图">
            <IntentCard intent={intent} published={intentPublished} />
          </Panel>

          <Panel eyebrow="CONTROL" title="演示控制">
            <PrimaryButton demo={demo} />
            <div className="tx-strip">
              <span>TX</span>
              <code>{transactionId ?? "尚未创建交易"}</code>
            </div>
          </Panel>
        </aside>

        {/* ---------- 中列：四幕进度 / A2A 网络 / 排名 / 谈判 ---------- */}
        <section className="col col--center">
          <Panel eyebrow="LIVE PROGRESS" title="四幕进度">
            <ActProgress act={act} />
          </Panel>

          <Panel eyebrow="A2A LIVE NETWORK" title="Agent 准入网络">
            <A2ANetwork
              events={events}
              sellerNames={sellerNames}
              running={running}
            />
          </Panel>

          <Panel
            eyebrow="RANKING"
            title="卖家评分与排名"
            aside={<span className="panel-note">{events.length} events</span>}
          >
            <SellerRanking events={events} sellerNames={sellerNames} />
          </Panel>

          <Panel eyebrow="NEGOTIATION" title="机器询证 · 谈判记录">
            <NegotiationTranscript
              events={events}
              sellerNames={sellerNames}
              focusSellerId={FOCUS_SELLER}
            />
          </Panel>
        </section>

        {/* ---------- 右列：Seller C 后台 / 证据 / 授权 / 回执 / 账本 ---------- */}
        <aside className="col col--right">
          <Panel eyebrow="SELLER BACKEND" title="卖家后台">
            <SellerBackend
              events={events}
              sellerNames={sellerNames}
              focusSellerId={FOCUS_SELLER}
            />
          </Panel>

          <Panel eyebrow="EVIDENCE" title="证据清单">
            <EvidenceChecklist
              events={events}
              sellerNames={sellerNames}
              focusSellerId={FOCUS_SELLER}
            />
          </Panel>

          <Panel eyebrow="AGENT ORDER" title="授权决策">
            <AgentOrder
              authorization={authorization}
              sellerNames={sellerNames}
            />
          </Panel>

          <Panel eyebrow="LIVE RECEIPT" title="实时回执">
            <LiveReceiptCard
              receipt={receipt}
              sellerNames={sellerNames}
              transactionId={transactionId}
              chainValid={chainValid}
            />
          </Panel>

          <EventLedger events={events} />
        </aside>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 顶栏
// ---------------------------------------------------------------------------

interface TopbarProps {
  phase: ReturnType<typeof useNewbornBeddingDemo>["phase"];
  humans: number;
  online: boolean;
}

/** 顶部状态栏：品牌 + Router 在线状态 + 无人值守计数。 */
function Topbar({ phase, humans, online }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          <Store size={18} />
        </span>
        <span className="brand__text">
          <strong>AgentShop</strong>
          <small>The Empty Store · Newborn Bedding</small>
        </span>
      </div>

      <div className="topbar__status">
        <span className={`chip ${online ? "chip--on" : "chip--off"}`}>
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          Router {online ? "Online" : "Offline"}
        </span>
        <span className="chip chip--phase" data-phase={phase}>
          <Radio size={13} />
          {PHASE_LABEL[phase]}
        </span>
        <span className="chip chip--humans">
          <UsersRound size={14} />
          Humans <strong>{humans}</strong>
        </span>
      </div>
    </header>
  );
}

/** 各阶段的短标签。 */
const PHASE_LABEL: Record<
  ReturnType<typeof useNewbornBeddingDemo>["phase"],
  string
> = {
  loading: "Loading",
  offline: "Offline",
  idle: "Idle",
  queued: "Queued",
  running: "Live",
  completed: "Settled",
  failed: "Failed",
};

// ---------------------------------------------------------------------------
// 主命令按钮
// ---------------------------------------------------------------------------

/**
 * 主命令按钮：按阶段切换「发布意图 / 运行中（禁用）/ Replay Demo」。
 * 按钮尺寸固定，文字变化不改变宽高，避免布局跳动。
 */
function PrimaryButton({
  demo,
}: {
  demo: ReturnType<typeof useNewbornBeddingDemo>;
}) {
  const { phase, start, replay, reset } = demo;
  const busy = phase === "queued" || phase === "running";
  const done = phase === "completed" || phase === "failed";

  return (
    <div className="command">
      <button
        className="command__primary"
        onClick={() => (done ? replay() : start())}
        disabled={busy || phase === "loading" || phase === "offline"}
      >
        {busy ? (
          <>
            <Activity size={16} className="spin" />
            Agent 市场运行中
          </>
        ) : done ? (
          <>
            <RotateCcw size={16} />
            Replay Demo
          </>
        ) : (
          <>
            <Send size={16} />
            发布意图
          </>
        )}
      </button>
      {done && (
        <button
          className="command__ghost"
          onClick={reset}
          title="重置到初始状态"
          aria-label="重置"
        >
          <RotateCcw size={15} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 通用面板容器
// ---------------------------------------------------------------------------

interface PanelProps {
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}

/** 统一的面板外壳（标题 + 内容）。 */
function Panel({ eyebrow, title, aside, children }: PanelProps) {
  return (
    <section className="panel">
      <div className="panel__head">
        <div className="panel__title">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {aside}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}

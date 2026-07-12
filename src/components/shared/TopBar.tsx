import { Pause, Play, RotateCcw } from "lucide-react";
import { useWorld } from "../../core/store";
import "./topbar.css";

export type ModuleKey = "consumer" | "topology" | "merchant";

const MODULES: Array<{ key: ModuleKey; label: string; sub: string }> = [
  { key: "consumer", label: "买家端", sub: "C-Agent" },
  { key: "topology", label: "A2A信用交易网络", sub: "DRN" },
  { key: "merchant", label: "商家端", sub: "S-Agent 编队" },
];

const SPEEDS = [1, 2, 4];

export function TopBar({
  active,
  onSwitch,
}: {
  active: ModuleKey;
  onSwitch: (m: ModuleKey) => void;
}) {
  const running = useWorld((s) => s.running);
  const speed = useWorld((s) => s.speed);
  const tick = useWorld((s) => s.tick);
  const agentCount = useWorld((s) => Object.keys(s.agents).length);
  const toggleRun = useWorld((s) => s.toggleRun);
  const setSpeed = useWorld((s) => s.setSpeed);
  const reset = useWorld((s) => s.reset);

  return (
    <header className="topbar">
      <div className="tb-brand">
        <span className="tb-logo" aria-hidden />
        <div>
          <div className="tb-name font-display">AgentShop</div>
          <div className="tb-tag">全 Agent 商业世界 · A2A × RepChain</div>
        </div>
      </div>

      <nav className="tb-nav" aria-label="系统模块">
        {MODULES.map((m) => (
          <button
            key={m.key}
            className={`tb-tab ${active === m.key ? "on" : ""}`}
            onClick={() => onSwitch(m.key)}
          >
            <span className="tb-tab-label">{m.label}</span>
            <span className="tb-tab-sub">{m.sub}</span>
          </button>
        ))}
      </nav>

      <div className="tb-clock">
        <div className="tb-tick">
          <span className="eyebrow">世界时钟</span>
          <span className="num tb-tickval">
            #{tick.toString().padStart(4, "0")}
          </span>
        </div>
        <span className="tb-agents num" title="在网 Agent 数">
          {agentCount} agents
        </span>
        <button
          className={`tb-btn ${running ? "live" : ""}`}
          onClick={toggleRun}
          title={running ? "暂停世界" : "运行世界"}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <div className="tb-speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={speed === s ? "on" : ""}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
        <button className="tb-btn ghost" onClick={reset} title="重置世界">
          <RotateCcw size={14} />
        </button>
      </div>
    </header>
  );
}

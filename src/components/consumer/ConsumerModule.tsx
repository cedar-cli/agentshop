import {
  Bot,
  Inbox,
  MessageSquareText,
  Radar,
  ShieldCheck,
  Swords,
} from "lucide-react";
import { useState } from "react";
import { DEMO_PURCHASES } from "../../demo/demoData";
import { ConsumerConversation } from "./ConsumerConversation";
import { DecisionTheater } from "./DecisionTheater";
import { ActiveServiceBoard } from "./ActiveServiceBoard";
import { ConsumerInbox } from "./ConsumerInbox";
import "./consumer.css";
import { useHouseholdRestock } from "../../hooks/useHouseholdRestock";
import { useConsumerDelegations } from "../../hooks/useConsumerDelegations";
import { useInbox } from "../../hooks/useInbox";

type ConsumerView = "agent" | "theater" | "services" | "inbox";

const VIEWS: Array<{
  key: ConsumerView;
  label: string;
  icon: typeof Bot;
  badge?: string;
}> = [
  { key: "agent", label: "消费 Agent", icon: MessageSquareText },
  { key: "theater", label: "决策剧场", icon: Swords },
  { key: "services", label: "主动服务", icon: Radar, badge: "4" },
  { key: "inbox", label: "Inbox", icon: Inbox },
];

export function ConsumerModule() {
  const [view, setView] = useState<ConsumerView>("agent");
  const [selectedId, setSelectedId] = useState(DEMO_PURCHASES[0].id);
  const restock = useHouseholdRestock();
  const delegations = useConsumerDelegations();
  const inbox = useInbox();

  const openPurchase = (id: string) => {
    setSelectedId(id);
    setView("agent");
  };

  return (
    <div className="module consumer-module">
      <header className="consumer-bar">
        <div
          className="consumer-title-wrap"
          title="只代表你的利益，基于 RepChain 证据完成比较、议价、履约与评价。"
        >
          <span className="consumer-agent-mark">
            <Bot size={16} />
          </span>
          <h2 className="module-title">我的消费 Agent</h2>
        </div>
        <nav className="consumer-tabs" aria-label="买家工作台">
          {VIEWS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.key}
                className={view === item.key ? "on" : ""}
                onClick={() => setView(item.key)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {(item.badge || item.key === "inbox") && (
                  <b className="consumer-tab-badge num">
                    {item.key === "inbox" ? inbox.messages.length : item.badge}
                  </b>
                )}
              </button>
            );
          })}
        </nav>
        <div className="consumer-trust-strip">
          <span>
            <ShieldCheck size={14} /> 忠诚归属：买家
          </span>
          <span className="num">信用 90 · 鉴证权重 4.5×</span>
        </div>
      </header>

      <div className="consumer-stage panel">
        {view === "agent" && (
          <ConsumerConversation
            selectedId={selectedId}
            onSelect={setSelectedId}
            restock={restock}
            delegations={delegations}
          />
        )}
        {view === "theater" && <DecisionTheater />}
        {view === "services" && (
          <ActiveServiceBoard onOpenPurchase={openPurchase} restock={restock} />
        )}
        {view === "inbox" && (
          <ConsumerInbox onOpenPurchase={openPurchase} inbox={inbox} />
        )}
      </div>
    </div>
  );
}

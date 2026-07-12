import {
  Activity,
  BarChart3,
  Bot,
  BrainCircuit,
  History,
  Network,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useWorld } from "../../core/store";
import { MerchantDealRoom } from "./MerchantDealRoom";
import { SalesMechanismLab } from "./SalesMechanismLab";
import { FleetPanel } from "./FleetPanel";
import { MerchantTopology } from "./MerchantTopology";
import { CreditTree } from "./CreditTree";
import { StrategySandbox } from "./StrategySandbox";
import { EcoTimelapse } from "./EcoTimelapse";
import { BuyerAgentAnalysis } from "./BuyerAgentAnalysis";
import { ActiveSalesRouter } from "./ActiveSalesRouter";
import { DemandNetwork } from "./DemandNetwork";
import { IntentGrowthField } from "./IntentGrowthField";
import "./merchant.css";

type MerchantView =
  | "deals"
  | "demand-network"
  | "active-sales"
  | "intent-growth"
  | "mechanisms"
  | "operations";
type OperationView =
  | "fleet"
  | "topology"
  | "credit"
  | "sandbox"
  | "eco"
  | "agent-analysis";

const VIEWS = [
  { key: "deals" as const, label: "交易战情", icon: Activity },
  { key: "demand-network" as const, label: "需求网络", icon: Network },
  { key: "active-sales" as const, label: "主动销售", icon: Route },
  { key: "intent-growth" as const, label: "意图增长", icon: BrainCircuit },
  { key: "mechanisms" as const, label: "销售机制", icon: Network },
  { key: "operations" as const, label: "编队与履约", icon: UsersRound },
];

export function MerchantModule() {
  const seller = useWorld((state) => state.agents[state.meSellerId]);
  const [view, setView] = useState<MerchantView>("deals");
  const [operation, setOperation] = useState<OperationView>("fleet");

  return (
    <div className="module merchant-module">
      <header className="merchant-bar">
        <div
          className="merchant-title-wrap"
          title="用可信履约争夺买家决策权，销售、供应链、客服与财务 Agent 协同成交。"
        >
          <span className="merchant-mark">
            <Bot size={16} />
          </span>
          <h2 className="module-title">{seller.name} · S-Agent 销售中枢</h2>
        </div>
        <nav className="merchant-tabs" aria-label="卖家工作台">
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
                {item.key === "deals" && <i className="live-indicator" />}
              </button>
            );
          })}
        </nav>
        <div className="merchant-kpis">
          <span>
            <b className="num">18</b>活跃买家
          </span>
          <span>
            <b className="num">31.8%</b>提案胜率
          </span>
          <span>
            <b className="num">{seller.credit}</b>履约信用
          </span>
          <span
            className={seller.flagged ? "merchant-risk bad" : "merchant-risk"}
          >
            <ShieldCheck size={13} />
            {seller.flagged ? "准入降级" : "准入正常"}
          </span>
        </div>
      </header>

      <div className="merchant-stage panel">
        {view === "deals" && <MerchantDealRoom />}
        {view === "demand-network" && <DemandNetwork />}
        {view === "active-sales" && <ActiveSalesRouter />}
        {view === "intent-growth" && <IntentGrowthField />}
        {view === "mechanisms" && <SalesMechanismLab />}
        {view === "operations" && (
          <div className="merchant-operations">
            <nav className="operation-tabs">
              <OperationButton
                active={operation === "fleet"}
                onClick={() => setOperation("fleet")}
                icon={<UsersRound size={14} />}
                label="员工编队"
              />
              <OperationButton
                active={operation === "topology"}
                onClick={() => setOperation("topology")}
                icon={<Network size={14} />}
                label="上下游拓扑"
              />
              <OperationButton
                active={operation === "credit"}
                onClick={() => setOperation("credit")}
                icon={<ShieldCheck size={14} />}
                label="履约信用"
              />
              <OperationButton
                active={operation === "sandbox"}
                onClick={() => setOperation("sandbox")}
                icon={<SlidersHorizontal size={14} />}
                label="策略沙盒"
              />
              <OperationButton
                active={operation === "eco"}
                onClick={() => setOperation("eco")}
                icon={<History size={14} />}
                label="生态演化"
              />
              <OperationButton
                active={operation === "agent-analysis"}
                onClick={() => setOperation("agent-analysis")}
                icon={<BarChart3 size={14} />}
                label="买家 Agent 分析"
              />
            </nav>
            <div className="operation-content scroll-y">
              {operation === "fleet" && <FleetPanel seller={seller} />}
              {operation === "topology" && <MerchantTopology seller={seller} />}
              {operation === "credit" && <CreditTree seller={seller} />}
              {operation === "sandbox" && <StrategySandbox seller={seller} />}
              {operation === "eco" && <EcoTimelapse />}
              {operation === "agent-analysis" && (
                <BuyerAgentAnalysis seller={seller} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OperationButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button type="button" className={active ? "on" : ""} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

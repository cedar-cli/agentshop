import {
  Activity,
  BellRing,
  Camera,
  CheckCircle2,
  FastForward,
  PackageOpen,
  ShieldCheck,
  TicketCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DEMO_PURCHASES, type DemoScene } from "../../demo/demoData";
import type { HouseholdRestockRuntime } from "../../hooks/useHouseholdRestock";

interface ActiveServiceDto {
  id: string;
  scene: Exclude<DemoScene, "passive">;
  title: string;
  product: string;
  mode: "autonomous" | "approval";
  runtime: "live" | "fixture";
  status:
    "monitoring" | "executing" | "awaiting-approval" | "completed" | "failed";
  statusLabel: string;
  signal: string;
  logic: string;
  trustScore: number;
  flow: string[];
  triggerable: boolean;
  transactionId?: string;
  eventCount?: number;
  chainValid?: boolean;
}
const SCENE_META: Record<
  Exclude<DemoScene, "passive">,
  { icon: typeof BellRing; color: string }
> = {
  restock: { icon: PackageOpen, color: "green" },
  scarce: { icon: TicketCheck, color: "gold" },
  lowprice: { icon: Camera, color: "cyan" },
  secondhand: { icon: BellRing, color: "violet" },
};

const FALLBACK_SERVICES: ActiveServiceDto[] = [
  {
    id: "household-restock",
    scene: "restock",
    title: "日用品补库",
    product: "厨房纸 + 洗手液",
    mode: "autonomous",
    runtime: "live",
    status: "monitoring",
    statusLabel: "持续监测",
    signal: "预计 4 天后耗尽",
    logic: "库存预测 × 消耗周期 × 月度授权",
    trustScore: 96,
    flow: ["库存预测触发", "长期授权校验", "三家 Agent 报价", "自动议价与下单"],
    triggerable: true,
  },
  {
    id: "scarce-ticket",
    scene: "scarce",
    title: "稀缺品抢购",
    product: "首尔演唱会双人连座",
    mode: "autonomous",
    runtime: "fixture",
    status: "completed",
    statusLabel: "抢购成功",
    signal: "31 秒完成出票",
    logic: "供给稀缺度 × 可信库存 × 自动代买授权",
    trustScore: 98,
    flow: ["稀缺资源监测", "库存信号到达", "席位效用比较", "锁位条件协商"],
    triggerable: false,
  },
  {
    id: "camera-lowprice",
    scene: "lowprice",
    title: "高值蹲低价",
    product: "DJI Pocket 3 全能套装",
    mode: "approval",
    runtime: "fixture",
    status: "awaiting-approval",
    statusLabel: "待你确认",
    signal: "全年价格 2.1% 分位",
    logic: "历史价格分位 × 渠道信用 × 高值确认阈值",
    trustScore: 95,
    flow: [
      "价格与需求联合监测",
      "价格事件到达 Inbox",
      "全年价格验证",
      "权益议价",
    ],
    triggerable: false,
  },
  {
    id: "secondhand-monitor",
    scene: "secondhand",
    title: "盯二手商品",
    product: "27 英寸 4K 显示器",
    mode: "approval",
    runtime: "fixture",
    status: "awaiting-approval",
    statusLabel: "验机完成",
    signal: "11 个卖家主动提案",
    logic: "公开需求 × 成色归一 × 托管验机",
    trustScore: 92,
    flow: ["公开二手需求", "卖家主动上门", "成色与风险比较", "条件式砍价"],
    triggerable: false,
  },
];

export function ActiveServiceBoard({
  onOpenPurchase,
  restock,
}: {
  onOpenPurchase: (id: string) => void;
  restock: HouseholdRestockRuntime;
}) {
  const [services, setServices] =
    useState<ActiveServiceDto[]>(FALLBACK_SERVICES);
  const [apiOnline, setApiOnline] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/active-services")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ services: ActiveServiceDto[] }>;
      })
      .then((result) => {
        if (!active) return;
        setServices(result.services);
        setApiOnline(true);
      })
      .catch(() => {
        if (!active) return;
        setApiOnline(false);
      });
    return () => {
      active = false;
    };
  }, [restock.phase]);

  const runtimeRestock = useMemo(() => {
    const service =
      services.find((item) => item.scene === "restock") ??
      FALLBACK_SERVICES[0]!;
    const order = [...restock.events]
      .reverse()
      .find((event) => event.type === "restock.order.confirmed");
    const amount = order?.payload.totalPriceCny as number | undefined;
    if (restock.phase === "idle") return service;
    return {
      ...service,
      status:
        restock.phase === "completed"
          ? ("completed" as const)
          : restock.phase === "failed"
            ? ("failed" as const)
            : ("executing" as const),
      statusLabel:
        restock.phase === "completed"
          ? "自动完成"
          : restock.phase === "failed"
            ? "执行失败"
            : "自主执行中",
      signal:
        restock.phase === "completed" && amount !== undefined
          ? `刚刚自动成交 ¥${amount}`
          : `Agent 执行中 · ${restock.events.length} events`,
      transactionId: restock.transactionId,
      eventCount: restock.events.length,
      chainValid: restock.chainValid,
    };
  }, [
    restock.chainValid,
    restock.events,
    restock.phase,
    restock.transactionId,
    services,
  ]);

  const visibleServices = services.map((service) =>
    service.scene === "restock" ? runtimeRestock : service,
  );
  const llmCount = restock.events.filter(
    (event) => event.payload.generatedBy === "llm",
  ).length;
  const fallbackCount = restock.events.filter(
    (event) => event.payload.generatedBy === "fallback",
  ).length;

  return (
    <div className="active-service-board scroll-y">
      <header className="board-head">
        <div>
          <span className="eyebrow">Agent 主动发现与执行</span>
          <h3>主动服务场景</h3>
        </div>
        <div className="board-summary">
          <ShieldCheck size={15} /> 1 个实时后端 · 3 个待迁移{" "}
          <span className={apiOnline ? "api-online" : "api-offline"}>
            {apiOnline ? "API ONLINE" : "FIXTURE FALLBACK"}
          </span>
        </div>
      </header>

      <div className="service-grid">
        {visibleServices.map((service) => {
          const purchase = DEMO_PURCHASES.find(
            (record) => record.scene === service.scene,
          )!;
          const { icon: Icon, color } = SCENE_META[service.scene];
          const isRestock = service.scene === "restock";
          const busy =
            isRestock &&
            (restock.phase === "queued" || restock.phase === "running");
          const complete = isRestock && restock.phase === "completed";
          return (
            <article
              className={`service-case service-${color} ${isRestock ? "service-live" : ""}`}
              key={service.id}
            >
              <div className="service-case-head">
                <span className="service-icon">
                  <Icon size={20} />
                </span>
                <div>
                  <span className="service-state">{service.statusLabel}</span>
                  <h4>{service.title}</h4>
                </div>
                <span className="service-mode">
                  {service.mode === "autonomous" ? "全权代买" : "确认后执行"}
                </span>
              </div>
              <div className="service-runtime-row">
                <span className={`service-runtime runtime-${service.runtime}`}>
                  {service.runtime === "live" ? "LIVE BACKEND" : "FIXTURE"}
                </span>
                {isRestock && restock.transactionId && (
                  <code>{restock.transactionId.slice(0, 14)}…</code>
                )}
              </div>
              <div className="service-product">{service.product}</div>
              <div className="service-trigger">
                <span>触发信号</span>
                <strong>{service.signal}</strong>
              </div>
              <div className="service-logic">
                <span>可审计决策模型</span>
                <p>{service.logic}</p>
              </div>
              <div className="service-mini-flow">
                {service.flow.map((label, index) => (
                  <div
                    key={label}
                    className={
                      isRestock && restock.events.length > index ? "done" : ""
                    }
                  >
                    <b className="num">0{index + 1}</b>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              {isRestock && restock.events.length > 0 && (
                <div className="service-live-proof">
                  <span>LLM {llmCount}</span>
                  <span>fallback {fallbackCount}</span>
                  <b
                    className={
                      restock.chainValid === false ? "invalid" : "valid"
                    }
                  >
                    {restock.chainValid === undefined
                      ? "Hash Chain running"
                      : restock.chainValid
                        ? "Hash Chain verified"
                        : "Chain invalid"}
                  </b>
                </div>
              )}
              <footer>
                <span className="num">可信度 {service.trustScore}</span>
                {isRestock ? (
                  complete ? (
                    <button
                      type="button"
                      onClick={() => onOpenPurchase(purchase.id)}
                    >
                      <CheckCircle2 size={13} />
                      查看真实交易
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={restock.start}
                    >
                      {busy ? (
                        <Activity size={13} className="runtime-spin" />
                      ) : (
                        <FastForward size={13} />
                      )}
                      {busy
                        ? "Agent 执行中"
                        : restock.phase === "failed"
                          ? "重新触发"
                          : "推进到触发点"}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenPurchase(purchase.id)}
                  >
                    查看案例过程
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}

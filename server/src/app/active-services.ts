export type ActiveServiceStatus =
  | "monitoring"
  | "executing"
  | "awaiting-approval"
  | "completed"
  | "failed";

export interface ActiveServiceSnapshot {
  id: "household-restock" | "scarce-ticket" | "camera-lowprice" | "secondhand-monitor";
  scene: "restock" | "scarce" | "lowprice" | "secondhand";
  title: string;
  product: string;
  mode: "autonomous" | "approval";
  runtime: "live" | "fixture";
  status: ActiveServiceStatus;
  statusLabel: string;
  signal: string;
  logic: string;
  trustScore: number;
  flow: string[];
  triggerable: boolean;
  transactionId?: string;
  transactionStatus?: string;
  eventCount?: number;
  chainValid?: boolean;
}

export const activeServiceDefinitions: ActiveServiceSnapshot[] = [
  {
    id: "household-restock", scene: "restock", title: "日用品补库", product: "厨房纸 + 洗手液",
    mode: "autonomous", runtime: "live", status: "monitoring", statusLabel: "持续监测",
    signal: "预计 4 天后耗尽", logic: "库存预测 × 消耗周期 × 月度授权", trustScore: 96,
    flow: ["库存预测触发", "长期授权校验", "三家 Agent 报价", "自动议价与下单"], triggerable: true,
  },
  {
    id: "scarce-ticket", scene: "scarce", title: "稀缺品抢购", product: "首尔演唱会双人连座",
    mode: "autonomous", runtime: "fixture", status: "completed", statusLabel: "抢购成功",
    signal: "31 秒完成出票", logic: "供给稀缺度 × 可信库存 × 自动代买授权", trustScore: 98,
    flow: ["稀缺资源监测", "库存信号到达", "席位效用比较", "锁位条件协商"], triggerable: false,
  },
  {
    id: "camera-lowprice", scene: "lowprice", title: "高值蹲低价", product: "DJI Pocket 3 全能套装",
    mode: "approval", runtime: "fixture", status: "awaiting-approval", statusLabel: "待你确认",
    signal: "全年价格 2.1% 分位", logic: "历史价格分位 × 渠道信用 × 高值确认阈值", trustScore: 95,
    flow: ["价格与需求联合监测", "价格事件到达 Inbox", "全年价格验证", "权益议价"], triggerable: false,
  },
  {
    id: "secondhand-monitor", scene: "secondhand", title: "盯二手商品", product: "27 英寸 4K 显示器",
    mode: "approval", runtime: "fixture", status: "awaiting-approval", statusLabel: "验机完成",
    signal: "11 个卖家主动提案", logic: "公开需求 × 成色归一 × 托管验机", trustScore: 92,
    flow: ["公开二手需求", "卖家主动上门", "成色与风险比较", "条件式砍价"], triggerable: false,
  },
];

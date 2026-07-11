export type InboxMessageType = "approval" | "completed" | "opportunity" | "blocked";
export type InboxVerdict = "valuable" | "neutral" | "blocked";

export interface InboxMessage {
  id: string;
  type: InboxMessageType;
  source: "active-service" | "seller-agent" | "system";
  runtime: "live" | "fixture";
  status: "unread" | "pending" | "resolved" | "archived";
  merchant: string;
  title: string;
  receivedAt: string;
  category: string;
  offer: string;
  evidence: string[];
  verdict: InboxVerdict;
  verdictLabel: string;
  valueScore: number;
  agentEvaluation: string;
  requiresAction: boolean;
  generatedBy: "llm" | "rule";
  memoryRecommended: boolean;
  memoryReason: string;
  relatedPurchaseId?: string;
  transactionId?: string;
  chainValid?: boolean;
  senderPenaltyDays?: number;
}

export interface InboxUpdate {
  sequence: number;
  type: "inbox.message.upserted" | "inbox.message.updated";
  message: InboxMessage;
}

export const fixtureInboxMessages: InboxMessage[] = [
  {
    id: "inbox-camera", type: "approval", source: "seller-agent", runtime: "fixture", status: "pending",
    merchant: "云仓·旗舰店 Sales Agent", title: "DJI Pocket 3 进入全年可信低价区间", receivedAt: "2026-07-12T09:18:00+08:00",
    category: "3C 数码", offer: "券后 ¥4,699 · 库存 32 · 次日达",
    evidence: ["12 个月价格 2.1% 分位", "价格稳定度 97", "官方保修可验证"],
    verdict: "valuable", verdictLabel: "待确认", valueScore: 91,
    agentEvaluation: "符合高值蹲低价条件，价格已排除先涨后降，渠道与售后满足硬约束。",
    requiresAction: true, generatedBy: "rule", memoryRecommended: true,
    memoryReason: "写入官方渠道最低可信价 ¥4,699，用于未来价格判断。", relatedPurchaseId: "camera-lowprice",
  },
  {
    id: "inbox-paper", type: "opportunity", source: "seller-agent", runtime: "fixture", status: "unread",
    merchant: "普惠·日用 Sales Agent", title: "厨房纸第二件半价", receivedAt: "2026-07-11T10:20:00+08:00",
    category: "日用百货", offer: "组合价 ¥109 · 需购买 6 箱",
    evidence: ["单价低 6%", "数量超过 4 个补库周期", "仓储占用高"],
    verdict: "neutral", verdictLabel: "暂不推荐", valueScore: 46,
    agentEvaluation: "折扣真实，但购买量远超家庭消耗周期，资金和储存成本抵消价格收益。",
    requiresAction: false, generatedBy: "rule", memoryRecommended: false,
    memoryReason: "不写入偏好记忆，仅保留为价格观察样本。", relatedPurchaseId: "paper-restock",
  },
  {
    id: "inbox-fashion", type: "blocked", source: "seller-agent", runtime: "fixture", status: "archived",
    merchant: "快闪服饰 Marketing Agent", title: "限时爆款，仅剩 2 小时", receivedAt: "2026-07-06T14:00:00+08:00",
    category: "服饰", offer: "全场 5 折 · 无具体 SKU 与库存证明",
    evidence: ["缺少参数证明", "信用 51，低于 Inbox 阈值", "使用稀缺性措辞但无库存证据"],
    verdict: "blocked", verdictLabel: "已拦截", valueScore: 12,
    agentEvaluation: "缺少可验证商品参数与真实库存，发送方信用低于准入条件。",
    requiresAction: false, generatedBy: "rule", memoryRecommended: false,
    memoryReason: "不存入消费记忆；将发送方降权 30 天。", senderPenaltyDays: 30,
  },
];

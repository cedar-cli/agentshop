/* ============================================================
   剧情演示 · 固定可复现数据
   案例与买家端「出差轻薄本采购」(laptop-trip) 对齐：
   14 英寸 AI 轻薄本 · 预算 ≤¥9,000 · 6 步讲清 A2A + RepChain 完整闭环。
   演示不依赖随机 sim —— 每次播放一致，投资人演示不翻车。
   ============================================================ */

export type Layer = "factory" | "warehouse" | "store" | "consumer";

export interface DemoNode {
  id: string;
  name: string;
  layer: Layer;
  credit: number;
  /** 层内水平序（0..n-1），坐标由组件按层宽计算 */
  order: number;
  professional?: boolean;
}

export const LAYERS: Array<{ key: Layer; label: string; role: string }> = [
  { key: "factory", label: "工厂", role: "工厂 S-Agent · 整机/主板制造" },
  { key: "warehouse", label: "仓储", role: "仓储/分销 S-Agent" },
  { key: "store", label: "门店", role: "门店 S-Agent · 面向买家" },
  { key: "consumer", label: "买家", role: "C-Agent · 终身消费智能体" },
];

export const DEMO_NODES: DemoNode[] = [
  // 工厂（整机代工 / 主板芯片）
  { id: "F1", name: "基石智造·整机", layer: "factory", credit: 88, order: 0 },
  { id: "F2", name: "澜源电子·主板", layer: "factory", credit: 74, order: 1 },
  // 仓储
  {
    id: "W1",
    name: "北岸智能仓",
    layer: "warehouse",
    credit: 91,
    order: 0,
    professional: true,
  },
  { id: "W2", name: "中枢分销仓", layer: "warehouse", credit: 79, order: 1 },
  // 门店（与买家端三份报价一致）
  { id: "S1", name: "云仓·旗舰店", layer: "store", credit: 88, order: 0 },
  { id: "S2", name: "极物·数码", layer: "store", credit: 82, order: 1 },
  { id: "S3", name: "锐捷·数码", layer: "store", credit: 76, order: 2 },
  // 买家
  { id: "C0", name: "我的 C-Agent", layer: "consumer", credit: 90, order: 1 },
  { id: "C1", name: "买家·尝鲜者", layer: "consumer", credit: 78, order: 0 },
  { id: "C2", name: "买家·高值蹲守", layer: "consumer", credit: 66, order: 2 },
];

export type ArrowKind = "bid" | "procure" | "fulfil";

export interface Arrow {
  from: string;
  to: string;
  kind: ArrowKind;
  /** 竞价胜出/关键链路，加粗高亮 */
  win?: boolean;
}

export interface Chip {
  /** 芯片从哪个节点飞向 RepChain */
  from: string;
  verdict: "fulfil" | "breach";
  score: number;
}

export interface DemoStep {
  title: string;
  narration: string;
  /** 高亮聚焦的节点；空数组表示全部点亮 */
  focus: string[];
  arrows: Arrow[];
  chips?: Chip[];
  /** 该步要点（旁白卡下方的机制标签） */
  tags: string[];
}

export const DEMO_STEPS: DemoStep[] = [
  {
    title: "① 需求发起",
    narration:
      "「我的 C-Agent」发出一条匿名需求轮廓：预算 ≤¥9,000 采购一台 14 英寸 AI 轻薄本，硬约束为 ≤1.3kg、续航≥12h、3 天内送达、全国联保——只暴露需求边界，不暴露身份与底价，价格为软约束。",
    focus: ["C0"],
    arrows: [],
    tags: ["需求轮廓信号", "匿名 · 不暴露底价", "硬约束 4 项 · 买家只需确认"],
  },
  {
    title: "② 门店竞价",
    narration:
      "云仓·旗舰店（信用 88）、极物·数码（82）、锐捷·数码（76）三家门店 S-Agent 携链上公开信用向该买家发射提案光箭。共 7 份提案，3 份通过 RepChain 准入，2 份因售后响应低于 80 分被过滤——争的是「进入决策集」的资格，没有曝光量与点击量。",
    focus: ["C0", "S1", "S2", "S3"],
    arrows: [
      { from: "S1", to: "C0", kind: "bid" },
      { from: "S2", to: "C0", kind: "bid" },
      { from: "S3", to: "C0", kind: "bid" },
    ],
    tags: ["决策准入经济", "候选 7 → 3", "售后 < 80 被过滤"],
  },
  {
    title: "③ 信用择优 · 自动议价",
    narration:
      "买家 Agent 按「信用 × 偏好」加权计算匹配分，云仓·旗舰店以 94 分胜出（时效 95、售后 96 领先，价非最低）；锐捷虽报价最低，但 5 天送达、售后偏弱，匹配 79 落选。随即自动议价：以同配置最低可信价为锚，卖家 ¥8,799 → ¥8,499 并加送 3 年联保。全程对比 186 笔链上鉴证，无广告佣金。",
    focus: ["C0", "S1"],
    arrows: [{ from: "S1", to: "C0", kind: "bid", win: true }],
    tags: ["匹配分 = 信用 × 偏好", "对比 186 笔鉴证", "¥8,799 → ¥8,499 + 延保"],
  },
  {
    title: "④ 供应链递归采购",
    narration:
      "云仓·旗舰店接到订单触发备货预警。它的供应链 Agent 化身「买家」，向上游智能仓采购整机；仓储再向工厂采购整机与主板。同一套 A2A 撮合与信用鉴证，递归成多层供应链。",
    focus: ["S1", "W1", "F1"],
    arrows: [
      { from: "S1", to: "W1", kind: "procure", win: true },
      { from: "W1", to: "F1", kind: "procure", win: true },
    ],
    tags: ["供应链 Agent = 买家", "递归自相似", "每层都是标准 A2A 交易"],
  },
  {
    title: "⑤ 履约上链 · 信用穿透",
    narration:
      "自上而下逐层履约：工厂供货 → 仓储零损耗 → 云仓次日提前 6 小时送达。序列号、重量、电池健康度与包装完整度交叉验收，每段履约都强制生成鉴证芯片飞向 RepChain（时效 98、参数 97、包装 100）。上游若违约，会沿链传导，拉低下游对买家的时效履约率。",
    focus: ["F1", "W1", "S1", "C0"],
    arrows: [
      { from: "F1", to: "W1", kind: "fulfil" },
      { from: "W1", to: "S1", kind: "fulfil" },
      { from: "S1", to: "C0", kind: "fulfil", win: true },
    ],
    chips: [
      { from: "F1", verdict: "fulfil", score: 92 },
      { from: "W1", verdict: "fulfil", score: 95 },
      { from: "S1", verdict: "fulfil", score: 98 },
    ],
    tags: ["履约强制上链", "时效 98 · 参数 97 · 包装 100", "不可篡改"],
  },
  {
    title: "⑥ 信用回写 · 沉淀为全网资产",
    narration:
      "鉴证数据回流 RepChain：本次买家信用加权 4.5×，云仓·旗舰店综合信用 88.1 → 88.4，3C 数码品类榜刷新。这一次履约试错，沉淀为全网共享的可信信用资产——后来的 C-Agent 无需重复踩坑，直接调用即可决策。",
    focus: [],
    arrows: [],
    chips: [
      { from: "S1", verdict: "fulfil", score: 98 },
      { from: "C0", verdict: "fulfil", score: 91 },
    ],
    tags: ["买家权重 4.5×", "信用 88.1 → 88.4", "单次试错 → 全网资产"],
  },
];

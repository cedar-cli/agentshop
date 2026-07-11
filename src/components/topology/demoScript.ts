/* ============================================================
   供应链剧情演示 · 固定可复现数据
   单品类（生鲜）· 精简节点 · 6 步讲清 A2A + RepChain 完整闭环
   演示不依赖随机 sim —— 每次播放一致，投资人演示不翻车
   ============================================================ */

export type Layer = 'factory' | 'warehouse' | 'store' | 'consumer'

export interface DemoNode {
  id: string
  name: string
  layer: Layer
  credit: number
  /** 层内水平序（0..n-1），坐标由组件按层宽计算 */
  order: number
  professional?: boolean
}

export const LAYERS: Array<{ key: Layer; label: string; role: string }> = [
  { key: 'factory', label: '工厂', role: '工厂 S-Agent · 源头制造' },
  { key: 'warehouse', label: '仓储', role: '仓储/分销 S-Agent' },
  { key: 'store', label: '门店', role: '门店 S-Agent · 面向消费者' },
  { key: 'consumer', label: '消费者', role: 'C-Agent · 终身消费智能体' },
]

export const DEMO_NODES: DemoNode[] = [
  // 工厂
  { id: 'F1', name: '基石制造', layer: 'factory', credit: 88, order: 0 },
  { id: 'F2', name: '澜源工厂', layer: 'factory', credit: 74, order: 1 },
  // 仓储
  { id: 'W1', name: '北岸冷链', layer: 'warehouse', credit: 91, order: 0, professional: true },
  { id: 'W2', name: '中枢仓储', layer: 'warehouse', credit: 79, order: 1 },
  // 门店
  { id: 'S1', name: '鲜达·生鲜', layer: 'store', credit: 89, order: 0 },
  { id: 'S2', name: '速配·生鲜', layer: 'store', credit: 72, order: 1 },
  { id: 'S3', name: '优拣·生鲜', layer: 'store', credit: 61, order: 2 },
  // 消费者
  { id: 'C0', name: '我的 C-Agent', layer: 'consumer', credit: 90, order: 1 },
  { id: 'C1', name: '买家·尝鲜者', layer: 'consumer', credit: 78, order: 0 },
  { id: 'C2', name: '买家·囤货党', layer: 'consumer', credit: 66, order: 2 },
]

export type ArrowKind = 'bid' | 'procure' | 'fulfil'

export interface Arrow {
  from: string
  to: string
  kind: ArrowKind
  /** 竞价胜出/关键链路，加粗高亮 */
  win?: boolean
}

export interface Chip {
  /** 芯片从哪个节点飞向 RepChain */
  from: string
  verdict: 'fulfil' | 'breach'
  score: number
}

export interface DemoStep {
  title: string
  narration: string
  /** 高亮聚焦的节点；空数组表示全部点亮 */
  focus: string[]
  arrows: Arrow[]
  chips?: Chip[]
  /** 该步要点（旁白卡下方的机制标签） */
  tags: string[]
}

export const DEMO_STEPS: DemoStep[] = [
  {
    title: '① 需求发起',
    narration:
      '「我的 C-Agent」发出一条匿名的需求轮廓信号：3 天内采购 200 件生鲜，预算 ≤¥50/件——只暴露需求边界，不暴露身份与底价。',
    focus: ['C0'],
    arrows: [],
    tags: ['需求轮廓信号', '匿名 · 不暴露底价', '消费者只需确认方案'],
  },
  {
    title: '② 门店竞价',
    narration:
      '三家门店 S-Agent 携带链上公开信用，向该买家发射提案光箭，争夺「进入决策集」的资格。没有曝光量、点击量——只有推荐决策争夺战。',
    focus: ['C0', 'S1', 'S2', 'S3'],
    arrows: [
      { from: 'S1', to: 'C0', kind: 'bid' },
      { from: 'S2', to: 'C0', kind: 'bid' },
      { from: 'S3', to: 'C0', kind: 'bid' },
    ],
    tags: ['决策准入经济', '取代注意力经济', 'AEO 无效'],
  },
  {
    title: '③ 信用择优',
    narration:
      '买家 Agent 按「信用 × 偏好」加权计算匹配分，选出鲜达·生鲜（信用 89）。低信用的优拣·生鲜（61）被源头拦截——匹配分归零，进不了决策集。',
    focus: ['C0', 'S1'],
    arrows: [{ from: 'S1', to: 'C0', kind: 'bid', win: true }],
    tags: ['匹配分=信用×偏好', '低信用源头拦截', '无竞价排名'],
  },
  {
    title: '④ 供应链递归采购',
    narration:
      '鲜达接到大单触发库存预警。它的供应链 Agent 化身「买家」，向上游仓储采购；仓储再向工厂采购。同一套 A2A 撮合与信用鉴证，递归成多层供应链。',
    focus: ['S1', 'W1', 'F1'],
    arrows: [
      { from: 'S1', to: 'W1', kind: 'procure', win: true },
      { from: 'W1', to: 'F1', kind: 'procure', win: true },
    ],
    tags: ['供应链 Agent = 买家', '递归自相似', '每层都是标准 A2A 交易'],
  },
  {
    title: '⑤ 履约上链 · 信用穿透',
    narration:
      '自上而下逐层履约：工厂供货→仓储零损耗→门店准时交付消费者。每一段履约都强制生成鉴证芯片飞向 RepChain。上游若违约，会沿链传导，拉低下游对消费者的时效履约率。',
    focus: ['F1', 'W1', 'S1', 'C0'],
    arrows: [
      { from: 'F1', to: 'W1', kind: 'fulfil' },
      { from: 'W1', to: 'S1', kind: 'fulfil' },
      { from: 'S1', to: 'C0', kind: 'fulfil', win: true },
    ],
    chips: [
      { from: 'F1', verdict: 'fulfil', score: 92 },
      { from: 'W1', verdict: 'fulfil', score: 95 },
      { from: 'S1', verdict: 'fulfil', score: 90 },
    ],
    tags: ['履约强制上链', '信用沿链穿透', '不可篡改'],
  },
  {
    title: '⑥ 信用回写 · 沉淀为全网资产',
    narration:
      '鉴证数据回流 RepChain，全链信用更新、品类榜刷新。这一次履约试错，沉淀为全网共享的可信信用资产——后来的 C-Agent 无需重复踩坑，直接调用即可决策。',
    focus: [],
    arrows: [],
    chips: [
      { from: 'S1', verdict: 'fulfil', score: 90 },
      { from: 'C0', verdict: 'fulfil', score: 91 },
    ],
    tags: ['单次试错→全网资产', '降低全网交易摩擦', '闭环'],
  },
]

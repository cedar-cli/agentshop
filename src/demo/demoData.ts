export type DemoScene =
  | 'passive'
  | 'restock'
  | 'scarce'
  | 'lowprice'
  | 'secondhand'

export type PurchaseMode = 'request' | 'approval' | 'autonomous'

export type DemoEventKind =
  | 'user'
  | 'agent'
  | 'evidence'
  | 'seller-message'
  | 'comparison'
  | 'negotiation'
  | 'approval'
  | 'payment'
  | 'fulfilment'
  | 'attestation'
  | 'memory'

/** 供反事实推演的四维底层硬指标（0-100，price 越高=越便宜越划算） */
export interface OfferMetrics {
  timeliness: number
  spec: number
  afterSales: number
  price: number
}

/** 消费者偏好权重（四维，驱动反事实重排） */
export interface OfferPreference {
  timeliness: number
  spec: number
  price: number
  afterSales: number
}

export interface DemoOffer {
  seller: string
  price: number
  originalPrice: number
  credit: number
  match: number
  eta: string
  promise: string
  selected: boolean
  reason: string
  /** 反事实推演用的底层维度分 */
  metrics: OfferMetrics
}

export interface DemoEvent {
  id: string
  kind: DemoEventKind
  actor: string
  time: string
  title: string
  body: string
  evidence?: string
  impact?: string
  origin?: 'llm' | 'rule' | 'simulation'
}

export interface DemoPurchase {
  id: string
  title: string
  product: string
  category: string
  scene: DemoScene
  sceneLabel: string
  mode: PurchaseMode
  status: 'monitoring' | 'negotiating' | 'awaiting' | 'fulfilling' | 'completed'
  statusLabel: string
  buyerName: string
  merchantName: string
  mechanism: string
  date: string
  budget: number
  paid: number
  saved: number
  trustScore: number
  authorization: string
  trigger: string
  constraints: string[]
  result: string
  memory: string
  offers: DemoOffer[]
  events: DemoEvent[]
  /** 下单时的偏好基线；反事实推演从这里出发，拖动即可看冠军如何改变 */
  baselinePref: OfferPreference
}

const laptopEvents: DemoEvent[] = [
  {
    id: 'lp-1', kind: 'user', actor: '你', time: '10:02', title: '提出购买委托',
    body: '下周出差前买一台轻薄本，预算 9000 元，续航优先，必须有全国联保。',
  },
  {
    id: 'lp-2', kind: 'agent', actor: 'C-Agent', time: '10:02', title: '约束结构化',
    body: '已拆解为硬约束：≤1.3kg、续航≥12h、3 天内送达、全国联保；价格为软约束。',
    evidence: '读取出差日历、历史退货原因与 3C 售后偏好。',
  },
  {
    id: 'lp-3', kind: 'seller-message', actor: '3 家 S-Agent', time: '10:03', title: '提案进入决策集',
    body: '收到 7 份提案，3 份通过 RepChain 准入；2 份因售后响应低于 80 分被过滤。',
    impact: '候选 7 → 3',
  },
  {
    id: 'lp-4', kind: 'comparison', actor: 'C-Agent', time: '10:03', title: '全量比较',
    body: '云仓旗舰店综合匹配 94 分，价格不是最低，但时效、售后与参数符合度领先。',
    evidence: '对比 186 笔履约鉴证，未采用广告、佣金或人工评分。',
  },
  {
    id: 'lp-5', kind: 'negotiation', actor: 'C-Agent ↔ 销售 Agent', time: '10:04', title: '自动议价',
    body: '以同配置最低可信报价为锚，换取 3 年保修与次日达；卖家从 ¥8,799 调整至 ¥8,499。',
    impact: '节省 ¥300 + 延保 1 年',
  },
  {
    id: 'lp-6', kind: 'approval', actor: 'C-Agent', time: '10:05', title: '请求最终确认',
    body: '方案满足全部硬约束，风险低于授权阈值。你确认后，财务 Agent 完成托管支付。',
  },
  {
    id: 'lp-7', kind: 'fulfilment', actor: '物流 / 仓储 Agent', time: '次日 09:26', title: '履约完成',
    body: '提前 6 小时送达；序列号、重量、电池健康度与包装完整度均通过交叉验收。',
  },
  {
    id: 'lp-8', kind: 'attestation', actor: 'RepChain', time: '次日 09:27', title: '自动鉴证上链',
    body: '时效 98、参数 97、包装 100、售后窗口零争议；本次鉴证权重 4.5×。',
    impact: '商家信用 88.1 → 88.4',
  },
]

const restockEvents: DemoEvent[] = [
  { id: 'rs-1', kind: 'agent', actor: 'C-Agent', time: '08:00', title: '库存预测触发', body: '依据近 90 天消耗速度，预测厨房纸将在 4 天后耗尽。', evidence: '置信度 93%，允许在 ¥140 内自动补库。' },
  { id: 'rs-2', kind: 'seller-message', actor: '4 家 S-Agent', time: '08:00', title: '匿名轮廓竞价', body: '需求只公开品类、数量和到货窗口，不公开身份与精准底价。' },
  { id: 'rs-3', kind: 'comparison', actor: 'C-Agent', time: '08:01', title: '规格与单价归一', body: '按每 100 抽、层数、原生浆比例统一口径，排除“低总价高单位价”提案。' },
  { id: 'rs-4', kind: 'negotiation', actor: 'C-Agent ↔ S-Agent', time: '08:01', title: '凑单与议价', body: '联合补购洗手液达到仓配阈值，免运费并额外降价 8 元。', impact: '总成本降低 14%' },
  { id: 'rs-5', kind: 'payment', actor: '财务 Agent', time: '08:02', title: '授权内自动下单', body: '金额与品类均在月度授权范围内，无需打扰用户。' },
  { id: 'rs-6', kind: 'fulfilment', actor: '仓储 / 物流 Agent', time: '次日 14:10', title: '验收入库', body: '数量、规格与包装完整度自动核对，家庭库存同步更新。' },
  { id: 'rs-7', kind: 'attestation', actor: 'RepChain', time: '次日 14:11', title: '履约评价', body: '参数 99、价格稳定 96、包装 98；自动生成不可修改鉴证。' },
  { id: 'rs-8', kind: 'memory', actor: 'C-Agent', time: '次日 14:11', title: '更新消费记忆', body: '记录实际消耗周期 27 天，下次预计提前 5 天启动补库。' },
]

const scarceEvents: DemoEvent[] = [
  { id: 'sc-1', kind: 'agent', actor: 'C-Agent', time: '开售前 24h', title: '稀缺资源监测', body: '演出日程与城市行程匹配，座位偏好和最高溢价已在授权策略内。' },
  { id: 'sc-2', kind: 'seller-message', actor: '票务 S-Agent', time: '开售前 10m', title: '库存信号到达', body: '两个可信票务节点开放配额，均通过实名、退改和出票时效校验。' },
  { id: 'sc-3', kind: 'comparison', actor: 'C-Agent', time: '19:59:58', title: '席位效用比较', body: 'A 区视野得分 91，B 区价格更低但遮挡风险高；选择 A 区双人连座。' },
  { id: 'sc-4', kind: 'negotiation', actor: 'C-Agent ↔ 票务 Agent', time: '20:00:00', title: '锁位条件协商', body: '接受 90 秒支付窗口，换取零服务费与未出票自动赔付条款。' },
  { id: 'sc-5', kind: 'payment', actor: '财务 Agent', time: '20:00:04', title: '全权授权代买', body: '在 ¥2,600 授权上限内完成锁位和支付，无需人工抢购。' },
  { id: 'sc-6', kind: 'fulfilment', actor: '票务 / 身份 Agent', time: '20:00:31', title: '出票与实名完成', body: '双人连座出票成功，票面、身份与入场规则已校验。' },
  { id: 'sc-7', kind: 'attestation', actor: 'RepChain', time: '演出后', title: '履约评价', body: '出票时效 100、参数符合 100、价格稳定 94，售后窗口关闭后上链。' },
]

const cameraEvents: DemoEvent[] = [
  { id: 'cm-1', kind: 'agent', actor: 'C-Agent', time: '持续监测', title: '价格与需求联合监测', body: '目标 DJI Pocket 3 全能套装；仅在可信全新渠道低于 ¥4,800 时提醒。' },
  { id: 'cm-2', kind: 'seller-message', actor: '云仓销售 Agent', time: '今天 09:18', title: '价格事件到达 Inbox', body: '官方渠道券后 ¥4,699，库存 32，价格稳定度 97。' },
  { id: 'cm-3', kind: 'comparison', actor: 'C-Agent', time: '09:18', title: '全年价格验证', body: '当前价格位于 12 个月可信成交价的 2.1% 分位，非先涨后降。' },
  { id: 'cm-4', kind: 'negotiation', actor: 'C-Agent ↔ 销售 Agent', time: '09:19', title: '权益议价', body: '价格已触底，转而争取 128GB 存储卡与 2 年意外保障。' },
  { id: 'cm-5', kind: 'approval', actor: 'C-Agent', time: '09:19', title: '等待确认', body: '高值商品超出自动代买阈值，已保价锁库存 20 分钟。', impact: '待用户确认' },
  { id: 'cm-6', kind: 'fulfilment', actor: '履约预测', time: '预计明日', title: '履约方案已锁定', body: '同城仓次日达，开箱验机由专业鉴证 Agent 协同完成。' },
  { id: 'cm-7', kind: 'attestation', actor: 'RepChain 预案', time: '交付后', title: '预设鉴证闭环', body: '将核验序列号、激活状态、配件齐全度、交付时效和售后承诺。' },
]

const secondhandEvents: DemoEvent[] = [
  { id: 'sh-1', kind: 'user', actor: '你', time: '昨天 16:20', title: '公开二手需求', body: '寻找 27 英寸 4K 显示器，预算 1800 元，可接受轻微外观痕迹。' },
  { id: 'sh-2', kind: 'seller-message', actor: '个人 / 商家 Agent', time: '16:24', title: '卖家主动上门', body: '收到 11 份提案；公开信号隐藏联系方式与最高心理价位。' },
  { id: 'sh-3', kind: 'comparison', actor: 'C-Agent', time: '16:26', title: '成色与风险比较', body: '统一换算面板工时、坏点、接口、保修和运输风险，保留 3 台候选。' },
  { id: 'sh-4', kind: 'negotiation', actor: 'C-Agent ↔ 卖家 Agent', time: '16:28', title: '条件式砍价', body: '以边角磕碰和剩余保修为依据，从 ¥1,750 议至 ¥1,590，并要求专业验机后放款。' },
  { id: 'sh-5', kind: 'approval', actor: 'C-Agent', time: '16:31', title: '方案确认', body: '价格低于同等成色可信中位数 9.7%，风险由托管与验机覆盖。' },
  { id: 'sh-6', kind: 'fulfilment', actor: '专业鉴证 Agent', time: '今天 11:10', title: '验机履约', body: '面板工时 1,204h、零坏点、接口正常；发现支架划痕与描述一致。' },
  { id: 'sh-7', kind: 'attestation', actor: 'RepChain', time: '今天 11:12', title: '双方鉴证', body: '卖家参数符合 99；买家按时确认收货，双方信用同步更新。' },
]

export const DEMO_PURCHASES: DemoPurchase[] = [
  {
    id: 'laptop-trip', title: '出差轻薄本采购', product: '14 英寸 AI 轻薄本', category: '3C 数码',
    scene: 'passive', sceneLabel: '被动服务', mode: 'approval', status: 'completed', statusLabel: '已鉴证',
    buyerName: '买家·高信用 091', merchantName: '云仓·旗舰店', mechanism: '精准推销 + 声誉排序', date: '今天',
    budget: 9000, paid: 8499, saved: 801, trustScore: 94, authorization: '确认后下单',
    trigger: '用户会话委托', constraints: ['≤1.3kg', '续航 ≥12h', '3 天内送达', '全国联保'],
    result: '全部硬约束满足，次日提前送达并完成链上鉴证。', memory: '出差设备优先续航和售后，价格权重低于可靠履约。',
    offers: [
      { seller: '云仓·旗舰店', price: 8499, originalPrice: 8799, credit: 88, match: 94, eta: '次日达', promise: '3 年联保', selected: true, reason: '时效与售后领先，综合风险最低', metrics: { timeliness: 95, spec: 95, afterSales: 96, price: 62 } },
      { seller: '极物·数码', price: 8299, originalPrice: 8399, credit: 82, match: 87, eta: '3 天', promise: '2 年联保', selected: false, reason: '价格低，但售后响应低 11 分', metrics: { timeliness: 88, spec: 90, afterSales: 80, price: 82 } },
      { seller: '锐捷·数码', price: 8199, originalPrice: 8299, credit: 76, match: 79, eta: '5 天', promise: '1 年联保', selected: false, reason: '价格最低，但 5 天送达、售后偏弱', metrics: { timeliness: 60, spec: 85, afterSales: 72, price: 91 } },
    ], baselinePref: { timeliness: 30, spec: 30, price: 25, afterSales: 15 }, events: laptopEvents,
  },
  {
    id: 'paper-restock', title: '家庭日用品补库', product: '厨房纸 + 洗手液', category: '日用百货',
    scene: 'restock', sceneLabel: '日用品补库', mode: 'autonomous', status: 'completed', statusLabel: '自动完成',
    buyerName: '买家·家庭补库 017', merchantName: '云仓·旗舰店', mechanism: '精准推销', date: '昨天',
    budget: 140, paid: 118, saved: 19, trustScore: 96, authorization: '授权内代买', trigger: '预计 4 天后耗尽',
    constraints: ['原生浆', '无香型', '7 天内不重复采购', '月度授权 ¥500'], result: '未打扰用户完成补库，库存预测与真实消耗同步校准。',
    memory: '厨房纸实际消耗周期为 27 天，偏好无香型洗手液。',
    offers: [
      { seller: '云仓·旗舰店', price: 118, originalPrice: 132, credit: 88, match: 96, eta: '次日达', promise: '规格不符双倍赔付', selected: true, reason: '单位价格与包装信用最佳', metrics: { timeliness: 92, spec: 96, afterSales: 88, price: 78 } },
      { seller: '普惠·日用', price: 112, originalPrice: 129, credit: 71, match: 81, eta: '2 天', promise: '七日退换', selected: false, reason: '更便宜，但近期包装损耗偏高', metrics: { timeliness: 80, spec: 70, afterSales: 72, price: 88 } },
    ], baselinePref: { timeliness: 25, spec: 25, price: 35, afterSales: 15 }, events: restockEvents,
  },
  {
    id: 'concert-ticket', title: '稀缺门票抢购', product: '首尔演唱会双人连座', category: '票务服务',
    scene: 'scarce', sceneLabel: '稀缺品抢购', mode: 'autonomous', status: 'completed', statusLabel: '抢购成功',
    buyerName: '买家·稀缺资源 204', merchantName: '云仓·票务节点', mechanism: '声誉排序', date: '3 天前',
    budget: 2600, paid: 2380, saved: 120, trustScore: 98, authorization: '稀缺资源全权代买', trigger: '可信库存出现',
    constraints: ['双人连座', 'A/B 区', '实名可入场', '溢价 ≤8%'], result: '开售后 31 秒完成出票，零人工抢购。', memory: '演出偏好双人连座，A 区视野价值高于 10% 价差。',
    offers: [
      { seller: '云仓·票务节点', price: 2380, originalPrice: 2500, credit: 92, match: 98, eta: '31 秒出票', promise: '未出票自动赔付', selected: true, reason: '库存真实性与出票时效最高', metrics: { timeliness: 99, spec: 96, afterSales: 94, price: 70 } },
      { seller: '万联·票务', price: 2290, originalPrice: 2290, credit: 78, match: 80, eta: '10 分钟', promise: '人工复核', selected: false, reason: '更便宜，但出票不确定性超出稀缺品阈值', metrics: { timeliness: 72, spec: 80, afterSales: 70, price: 85 } },
    ], baselinePref: { timeliness: 55, spec: 15, price: 15, afterSales: 15 }, events: scarceEvents,
  },
  {
    id: 'camera-lowprice', title: '高值商品蹲低价', product: 'DJI Pocket 3 全能套装', category: '3C 数码',
    scene: 'lowprice', sceneLabel: '高值蹲低价', mode: 'approval', status: 'awaiting', statusLabel: '待你确认',
    buyerName: '买家·价格监测 118', merchantName: '云仓·旗舰店', mechanism: '广播推销 + 声誉排序', date: '进行中',
    budget: 4800, paid: 4699, saved: 600, trustScore: 95, authorization: '高值商品需确认', trigger: '进入全年价格 2.1% 分位',
    constraints: ['全新未激活', '官方保修', '≤¥4,800', '可信渠道'], result: '库存与价格已锁定 20 分钟，等待用户确认。',
    memory: '高值数码接受等待低价，但不接受非官方保修渠道。',
    offers: [
      { seller: '云仓·旗舰店', price: 4699, originalPrice: 5299, credit: 88, match: 95, eta: '次日达', promise: '官方保修 + 意外保障', selected: true, reason: '全年低位且价格稳定度 97', metrics: { timeliness: 90, spec: 94, afterSales: 90, price: 80 } },
      { seller: '甄选·数码', price: 4599, originalPrice: 5199, credit: 73, match: 77, eta: '4 天', promise: '店铺保修', selected: false, reason: '更便宜，但不满足官方保修硬约束', metrics: { timeliness: 70, spec: 72, afterSales: 68, price: 88 } },
    ], baselinePref: { timeliness: 15, spec: 25, price: 45, afterSales: 15 }, events: cameraEvents,
  },
  {
    id: 'used-monitor', title: '二手显示器寻源', product: '27 英寸 4K 显示器', category: '二手交易',
    scene: 'secondhand', sceneLabel: '盯二手商品', mode: 'approval', status: 'fulfilling', statusLabel: '验机完成',
    buyerName: '买家·二手猎人 066', merchantName: '云仓·二手服务', mechanism: '需求轮廓精准推销', date: '进行中',
    budget: 1800, paid: 1590, saved: 160, trustScore: 92, authorization: '验机后放款', trigger: '卖家提案满足成色条件',
    constraints: ['4K IPS', '零坏点', '工时 <2,000h', '支持托管验机'], result: '专业验机通过，等待物流签收后释放托管款。',
    memory: '二手设备可接受外观划痕，但面板健康与托管验机不可妥协。',
    offers: [
      { seller: '个人卖家 A-Agent', price: 1590, originalPrice: 1750, credit: 86, match: 92, eta: '2 天', promise: '专业验机后放款', selected: true, reason: '面板健康、价格与托管条件最佳', metrics: { timeliness: 82, spec: 90, afterSales: 88, price: 82 } },
      { seller: '循环仓·二手', price: 1699, originalPrice: 1799, credit: 91, match: 88, eta: '次日达', promise: '90 天保修', selected: false, reason: '更稳妥、售后更长，但价格高、面板工时更长', metrics: { timeliness: 90, spec: 88, afterSales: 92, price: 72 } },
      { seller: '个人卖家 B-Agent', price: 1450, originalPrice: 1650, credit: 62, match: 61, eta: '自提', promise: '不支持验机', selected: false, reason: '最便宜，但拒绝托管验机，直接过滤', metrics: { timeliness: 60, spec: 58, afterSales: 40, price: 92 } },
    ], baselinePref: { timeliness: 15, spec: 40, price: 20, afterSales: 25 }, events: secondhandEvents,
  },
]

export interface SalesMechanism {
  id: 'precision' | 'distribution' | 'reputation' | 'broadcast'
  index: string
  title: string
  short: string
  description: string
  buyerRecordId: string
  steps: Array<{ owner: string; title: string; detail: string; effect: string }>
  metrics: Array<{ label: string; before: string; after: string; delta: string; positive: boolean }>
}

export const SALES_MECHANISMS: SalesMechanism[] = [
  {
    id: 'precision', index: '01', title: '约束锚定式精准推销', short: '需求信号狙击',
    description: '监听匿名需求轮廓，用真实信用和可兑现承诺争取进入决策集。', buyerRecordId: 'laptop-trip',
    steps: [
      { owner: '销售 Agent', title: '监听需求轮廓', detail: '预算 ≤¥9,000、3 天内、轻薄长续航；身份与精准底价不可见。', effect: '命中度 41% → 93%' },
      { owner: '信用 Agent', title: '装配可信证据', detail: '提取 3C 时效 96、售后 91、参数符合 94 的链上证明。', effect: '准入权重 +18%' },
      { owner: '定价 Agent', title: '生成约束提案', detail: '不打最低价，组合 ¥8,499、次日达与 3 年联保。', effect: '毛利保持 18.6%' },
      { owner: '销售 Agent', title: '进入买家决策集', detail: '击败低价但售后较弱的两家竞品，排名升至第 1。', effect: '成交概率 24% → 72%' },
    ],
    metrics: [
      { label: '决策集排名', before: '#4', after: '#1', delta: '↑3', positive: true },
      { label: '成交概率', before: '24%', after: '72%', delta: '+48%', positive: true },
      { label: '获客成本', before: '¥86', after: '¥12', delta: '-86%', positive: true },
    ],
  },
  {
    id: 'distribution', index: '02', title: '合约裂变式分销', short: '链上返佣自传播',
    description: '公开自动返佣合约，由中继 Agent 自主寻找匹配需求并即时结算。', buyerRecordId: 'paper-restock',
    steps: [
      { owner: '财务 Agent', title: '发布返佣合约', detail: '成交额 3% 自动返佣，链上结算，无审核、无账期。', effect: '合约可信度 100%' },
      { owner: 'DRN 网络', title: '匹配中继节点', detail: '42 个日用消费节点识别出 316 个潜在补库需求。', effect: '覆盖节点 +42' },
      { owner: '中继 Agent', title: '自主精准转发', detail: '只向库存周期、品类和预算匹配的 Inbox 递送。', effect: '无效触达 -91%' },
      { owner: '财务 Agent', title: '成交即时分账', detail: '订单完成即自动支付 ¥3.54 佣金并上链留痕。', effect: '结算周期 30 天 → 0 秒' },
    ],
    metrics: [
      { label: '有效触达', before: '38', after: '316', delta: '+731%', positive: true },
      { label: '分销人力', before: '6 人', after: '0 人', delta: '-100%', positive: true },
      { label: '佣金账期', before: '30 天', after: '实时', delta: '-30 天', positive: true },
    ],
  },
  {
    id: 'reputation', index: '03', title: '履约声誉排序竞争', short: '用履约赢自然准入',
    description: '排名由全量客观鉴证驱动，无法购买；优化履约会直接改变未来获客。', buyerRecordId: 'concert-ticket',
    steps: [
      { owner: '客服 Agent', title: '压缩售后响应', detail: '自动分流标准问题，复杂工单 3 分钟内升级。', effect: '响应 14m → 2m' },
      { owner: '供应链 Agent', title: '提升履约确定性', detail: '切换至信用 92 的同城仓，超时风险下降。', effect: '准时率 89% → 97%' },
      { owner: 'RepChain', title: '新鉴证回写', detail: '连续 18 笔优质履约提升时效与售后向量。', effect: '综合信用 +3.8' },
      { owner: 'DRN 网络', title: '自动提升准入', detail: '品类排名上升，进入默认评估前列，无广告费。', effect: '自然准入 +64%' },
    ],
    metrics: [
      { label: '品类排名', before: '#7', after: '#2', delta: '↑5', positive: true },
      { label: '自然准入', before: '31%', after: '95%', delta: '+64%', positive: true },
      { label: '广告支出', before: '¥42k', after: '¥0', delta: '-100%', positive: true },
    ],
  },
  {
    id: 'broadcast', index: '04', title: '广播推销', short: '买家许可的主动营销',
    description: '仅向公开或满足条件的 Inbox 发送信息，由 C-Agent 先评估价值再决定是否呈现。', buyerRecordId: 'camera-lowprice',
    steps: [
      { owner: '营销 Agent', title: '构造事实型消息', detail: '提交真实到手价、库存、历史分位和链上履约证明。', effect: '信息完整度 98%' },
      { owner: 'Inbox Policy', title: '校验买家许可', detail: '仅通过“3C、全年低位、官方保修”三个条件。', effect: '拦截 82% 不匹配用户' },
      { owner: 'C-Agent', title: '独立价值评估', detail: '验证非先涨后降，判定为高价值商业信息。', effect: '价值评分 91/100' },
      { owner: 'Memory Agent', title: '决定是否写入记忆', detail: '记录官方渠道最低可信价，不记录营销措辞。', effect: '未来决策基线更新' },
    ],
    metrics: [
      { label: '消息通过率', before: '100%', after: '18%', delta: '-82%', positive: true },
      { label: '有效意向', before: '3.2%', after: '38%', delta: '+34.8%', positive: true },
      { label: '用户屏蔽率', before: '21%', after: '1.4%', delta: '-19.6%', positive: true },
    ],
  },
]

export interface DemoInboxMessage {
  id: string
  merchant: string
  title: string
  receivedAt: string
  category: string
  offer: string
  evidence: string[]
  verdict: 'valuable' | 'neutral' | 'blocked'
  verdictLabel: string
  valueScore: number
  agentEvaluation: string
  memoryRecommended: boolean
  memoryReason: string
  relatedPurchaseId?: string
}

export const DEMO_INBOX: DemoInboxMessage[] = [
  {
    id: 'inbox-camera', merchant: '云仓·旗舰店 Sales Agent', title: 'DJI Pocket 3 进入全年可信低价区间', receivedAt: '09:18', category: '3C 数码', offer: '券后 ¥4,699 · 库存 32 · 次日达',
    evidence: ['12 个月价格 2.1% 分位', '价格稳定度 97', '官方保修可验证'], verdict: 'valuable', verdictLabel: '高价值', valueScore: 91,
    agentEvaluation: '符合你设置的高值蹲低价条件，价格已排除先涨后降，且渠道与售后均满足硬约束。', memoryRecommended: true,
    memoryReason: '写入“官方渠道最低可信价 ¥4,699”，用于未来价格判断。', relatedPurchaseId: 'camera-lowprice',
  },
  {
    id: 'inbox-paper', merchant: '普惠·日用 Sales Agent', title: '厨房纸第二件半价', receivedAt: '昨天', category: '日用百货', offer: '组合价 ¥109 · 需购买 6 箱',
    evidence: ['单价低 6%', '数量超过 4 个补库周期', '仓储占用高'], verdict: 'neutral', verdictLabel: '暂不推荐', valueScore: 46,
    agentEvaluation: '折扣真实，但购买量远超家庭消耗周期，资金和储存成本抵消了价格收益。', memoryRecommended: false,
    memoryReason: '不写入偏好记忆，仅保留为价格观察样本。', relatedPurchaseId: 'paper-restock',
  },
  {
    id: 'inbox-fashion', merchant: '快闪服饰 Marketing Agent', title: '限时爆款，仅剩 2 小时', receivedAt: '周一', category: '服饰', offer: '全场 5 折 · 无具体 SKU 与库存证明',
    evidence: ['缺少参数证明', '信用 51，低于 Inbox 阈值', '使用稀缺性措辞但无库存证据'], verdict: 'blocked', verdictLabel: '已拦截', valueScore: 12,
    agentEvaluation: '缺少可验证商品参数与真实库存，商家信用低于你的准入条件，判定为低价值营销。', memoryRecommended: false,
    memoryReason: '不存入消费记忆；将该发送方降权 30 天。',
  },
]

export const getPurchaseById = (id: string) =>
  DEMO_PURCHASES.find((purchase) => purchase.id === id)

export const getPurchasesByScene = (scene: DemoScene) =>
  DEMO_PURCHASES.filter((purchase) => purchase.scene === scene)

export const getMechanismById = (id: SalesMechanism['id']) =>
  SALES_MECHANISMS.find((mechanism) => mechanism.id === id)

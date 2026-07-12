/* ============================================================
   高值商品蹲低价 · 实时盯盘时间线（固定可复现）
   C-Agent 持续盯着多家 agent 店的价格波动，逐条比对：
   谁在涨、谁在跌、距目标价还差多少；
   直到某家「官方保修」店券后直降命中目标价，转入等待确认。
   数据与 demoData(camera-lowprice) / inbox 对齐：
   最终由「云仓·旗舰店」券后 ¥4,699 命中 ≤¥4,800 目标价。
   ============================================================ */

export interface WatchStore {
  id: string
  name: string
  credit: number
  /** 是否满足「官方保修」硬约束；非官方店即便更便宜也会被排除 */
  official: boolean
}

export interface WatchStep {
  seq: number
  time: string
  storeId: string
  storeName: string
  credit: number
  official: boolean
  from: number
  to: number
  /** to - from，负值为下降 */
  delta: number
  direction: 'down' | 'up' | 'flat'
  /** 本步之后全部盯盘店的当前平均价 */
  currentAvg: number
  /** 该店当前价距目标价差额（to - target），正值为仍高于目标 */
  gapToTarget: number
  /** 非官方保修，已被排除在候选之外 */
  excluded: boolean
  /** 官方保修且命中目标价 */
  hit: boolean
  note: string
}

const TARGET = 4800

export const LOWPRICE_WATCH = {
  product: 'DJI Pocket 3 全能套装',
  constraint: '全新未激活 · 官方保修 · ≤¥4,800',
  /** 目标价（硬约束上限） */
  target: TARGET,
  /** 全年平均价（近 12 个月可信成交均价） */
  annualAvg: 5120,
  /** 历史平均价（上市以来可信成交均价） */
  historyAvg: 5380,
} as const

const STORES: Record<string, WatchStore> = {
  yuncang: { id: 'yuncang', name: '云仓·旗舰店', credit: 88, official: true },
  jiwu: { id: 'jiwu', name: '极物·数码', credit: 82, official: true },
  youpin: { id: 'youpin', name: '优品·官方旗舰', credit: 90, official: true },
  zhenxuan: { id: 'zhenxuan', name: '甄选·数码', credit: 73, official: false },
  gongchang: { id: 'gongchang', name: '数码工场', credit: 79, official: true },
}

const INITIAL_PRICES: Record<string, number> = {
  yuncang: 4980,
  jiwu: 4960,
  youpin: 5020,
  zhenxuan: 4880,
  gongchang: 5060,
}

/** 盯盘序列：[店铺, 该步调整后的价格]，收敛到云仓 4699 命中 */
const WALK: Array<[storeId: string, to: number]> = [
  ['gongchang', 5010],
  ['jiwu', 4900],
  ['zhenxuan', 4620],
  ['yuncang', 4890],
  ['youpin', 4950],
  ['jiwu', 4930],
  ['gongchang', 4930],
  ['yuncang', 4830],
  ['zhenxuan', 4599],
  ['youpin', 4870],
  ['jiwu', 4815],
  ['gongchang', 4895],
  ['yuncang', 4699],
]

/** 起始平均价（全部店铺初始价均值） */
export const LOWPRICE_INITIAL_AVG = Math.round(
  Object.values(INITIAL_PRICES).reduce((sum, price) => sum + price, 0) /
    Object.keys(INITIAL_PRICES).length,
)

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

const TIME_STEPS = [4, 7, 5, 6, 8, 3, 5, 9, 4, 6, 7, 5, 8]

function buildNote(step: {
  official: boolean
  direction: WatchStep['direction']
  delta: number
  gapToTarget: number
  hit: boolean
  excluded: boolean
}): string {
  if (step.hit) return '券后直降，命中目标价 · 锁库存并请求确认'
  if (step.excluded) return '店铺保修 · 未过官方保修硬约束，已排除'
  if (step.direction === 'up') return `小幅回调 ¥${Math.abs(step.delta)}，暂不满足，继续观望`
  return `下调 ¥${Math.abs(step.delta)} · 距目标价还差 ¥${step.gapToTarget}`
}

/** 完整盯盘时间线（模块加载时计算一次，保证可复现） */
export const LOWPRICE_STEPS: WatchStep[] = (() => {
  const prices: Record<string, number> = { ...INITIAL_PRICES }
  const storeCount = Object.keys(prices).length
  let minutes = 9 * 60 + 2
  let hitLocked = false

  return WALK.map(([storeId, to], index) => {
    const store = STORES[storeId]
    const from = prices[storeId]
    prices[storeId] = to
    const delta = to - from
    const currentAvg = Math.round(
      Object.values(prices).reduce((sum, price) => sum + price, 0) / storeCount,
    )
    const gapToTarget = to - TARGET
    const excluded = !store.official
    const hit = !hitLocked && store.official && to <= TARGET
    if (hit) hitLocked = true

    minutes += TIME_STEPS[index] ?? 5
    const direction: WatchStep['direction'] = delta < 0 ? 'down' : delta > 0 ? 'up' : 'flat'

    const step = {
      seq: index + 1,
      time: clock(minutes),
      storeId,
      storeName: store.name,
      credit: store.credit,
      official: store.official,
      from,
      to,
      delta,
      direction,
      currentAvg,
      gapToTarget,
      excluded,
      hit,
      note: '',
    }
    step.note = buildNote(step)
    return step
  })
})()

export const LOWPRICE_WATCHED_STORES: WatchStore[] = Object.values(STORES)

/* 世界初始化：生成买家/卖家/供应链/工厂 Agent 编队与初始信用 */

import { makeRng, pick, rint, rfloat, clamp, type Rng } from './rng'
import { vectorAvg } from './credit'
import {
  CATEGORIES,
  type Agent,
  type ActiveScene,
  type Category,
  type CreditVector,
  type WorldState,
} from './types'

const SELLER_BRANDS = [
  '云仓', '鲜达', '极物', '优拣', '恒诚', '拓源', '万联', '锐捷',
  '甄选', '速配', '澄海', '筑基', '普惠', '博裕', '青柠', '朗行',
]
const SUPPLY_BRANDS = ['中枢仓储', '联运分销', '北岸冷链', '云梯物流']
const FACTORY_BRANDS = ['基石制造', '原初工坊', '澜源工厂', '恒工实业']
const CONSUMER_TAGS = [
  '追时效', '重品质', '价格敏感', '售后控', '囤货党', '尝鲜者',
  '极简派', '高值蹲守', '二手猎人', '稳健型',
]

function makeVector(rng: Rng, base: number): CreditVector {
  const j = () => clamp(base + rfloat(rng, -14, 12))
  return {
    timeliness: j(),
    spec: j(),
    afterSales: j(),
    compensation: j(),
    priceStability: j(),
    packaging: j(),
  }
}

function place(rng: Rng): { x: number; y: number } {
  // 单位圆内随机分布，视图再做力导向微调
  const a = rng() * Math.PI * 2
  const r = Math.sqrt(rng())
  return { x: Math.cos(a) * r, y: Math.sin(a) * r }
}

let counter = 0
const nid = (p: string) => `${p}-${(++counter).toString(36).padStart(3, '0')}`

function makeSeller(rng: Rng, cat: Category, baseCredit: number): Agent {
  const vector = makeVector(rng, baseCredit)
  const professional = rng() < 0.06
  return {
    id: nid('S'),
    name: `${pick(rng, SELLER_BRANDS)}·${cat.slice(0, 2)}`,
    role: 'seller',
    category: cat,
    region: rint(rng, 0, 3),
    online: true,
    vector,
    credit: Math.round(vectorAvg(vector)),
    dealCount: rint(rng, 12, 480),
    flagged: false,
    professional,
    ...place(rng),
  }
}

export function createWorld(seed = 42): WorldState {
  counter = 0
  const rng = makeRng(seed)
  const agents: Record<string, Agent> = {}
  const add = (a: Agent) => {
    agents[a.id] = a
  }

  // 卖家编队：每品类若干，信用分布拉开梯度
  for (const cat of CATEGORIES) {
    const n = rint(rng, 7, 10)
    for (let i = 0; i < n; i++) {
      const base = pick(rng, [88, 82, 76, 70, 64, 58, 50, 44])
      add(makeSeller(rng, cat, base))
    }
  }

  // 供应链 / 工厂（上游，构成多层供应链）
  for (const cat of CATEGORIES) {
    for (let i = 0; i < 2; i++) {
      const v = makeVector(rng, pick(rng, [84, 74, 66]))
      add({
        id: nid('U'),
        name: `${pick(rng, SUPPLY_BRANDS)}`,
        role: 'supply',
        category: cat,
        region: rint(rng, 0, 3),
        online: true,
        vector: v,
        credit: Math.round(vectorAvg(v)),
        dealCount: rint(rng, 40, 300),
        flagged: false,
        professional: false,
        ...place(rng),
      })
    }
  }
  for (let i = 0; i < 4; i++) {
    const v = makeVector(rng, pick(rng, [86, 78, 68]))
    add({
      id: nid('F'),
      name: `${FACTORY_BRANDS[i]}`,
      role: 'factory',
      category: pick(rng, CATEGORIES),
      region: rint(rng, 0, 3),
      online: true,
      vector: v,
      credit: Math.round(vectorAvg(v)),
      dealCount: rint(rng, 80, 600),
      flagged: false,
      professional: false,
      ...place(rng),
    })
  }

  // 买家群
  const consumerCount = 26
  for (let i = 0; i < consumerCount; i++) {
    const base = pick(rng, [92, 86, 78, 72, 64, 55, 40])
    const v = makeVector(rng, base)
    add({
      id: nid('C'),
      name: `买家·${pick(rng, CONSUMER_TAGS)}${rint(rng, 10, 99)}`,
      role: 'consumer',
      category: pick(rng, CATEGORIES),
      region: rint(rng, 0, 3),
      online: rng() < 0.9,
      vector: v,
      credit: base,
      dealCount: rint(rng, 3, 220),
      flagged: false,
      professional: false,
      ...place(rng),
    })
  }

  // 主视角：高信用买家 + 中上信用卖家（留出成长空间）
  const consumers = Object.values(agents).filter((a) => a.role === 'consumer')
  const sellers = Object.values(agents).filter((a) => a.role === 'seller')
  const meConsumer = consumers.reduce((a, b) => (a.credit >= b.credit ? a : b))
  meConsumer.name = '我的 C-Agent'
  meConsumer.credit = 90
  meConsumer.vector = makeVector(rng, 90)
  const meSeller =
    sellers.find((s) => s.credit >= 68 && s.credit <= 80) ?? sellers[0]
  meSeller.name = `${meSeller.name.split('·')[0]}·旗舰店`

  return {
    tick: 0,
    running: true,
    speed: 1,
    agents,
    transactions: [],
    attestations: [],
    riskEvents: [],
    meConsumerId: meConsumer.id,
    meSellerId: meSeller.id,
    preference: { timeliness: 30, spec: 30, price: 25, afterSales: 15 },
    inbox: 'conditional',
    inboxCategory: null,
    activeScenes: initScenes(),
  }
}

function initScenes(): ActiveScene[] {
  return [
    {
      id: 'restock',
      title: '日用品补库',
      sample: '卫生纸 · 洗发水',
      desc: '固定周期消耗品库存不足时自动补采',
      armed: true,
      progress: 68,
      triggered: false,
    },
    {
      id: 'scarce',
      title: '稀缺品抢购',
      sample: '演唱会门票',
      desc: '供给有限资源第一时间锁定采购',
      armed: true,
      progress: 32,
      triggered: false,
    },
    {
      id: 'lowprice',
      title: '高值蹲低价',
      sample: '大疆相机',
      desc: '监测到全年最低价自动触发下单',
      armed: true,
      progress: 81,
      triggered: false,
    },
    {
      id: 'secondhand',
      title: '盯二手商品',
      sample: '二手交易',
      desc: '发布公开需求，等商家 Agent 上门',
      armed: false,
      progress: 12,
      triggered: false,
    },
  ]
}

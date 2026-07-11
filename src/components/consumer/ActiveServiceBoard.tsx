import { BellRing, Camera, PackageOpen, ShieldCheck, TicketCheck } from 'lucide-react'
import { DEMO_PURCHASES, type DemoScene } from '../../demo/demoData'

const SCENES: Array<{
  scene: Exclude<DemoScene, 'passive'>
  icon: typeof BellRing
  color: string
  logic: string
  signal: string
}> = [
  { scene: 'restock', icon: PackageOpen, color: 'green', logic: '库存预测 × 消耗周期 × 月度授权', signal: '预计 4 天后耗尽' },
  { scene: 'scarce', icon: TicketCheck, color: 'gold', logic: '供给稀缺度 × 可信库存 × 自动代买授权', signal: '31 秒完成出票' },
  { scene: 'lowprice', icon: Camera, color: 'cyan', logic: '历史价格分位 × 渠道信用 × 高值确认阈值', signal: '全年价格 2.1% 分位' },
  { scene: 'secondhand', icon: BellRing, color: 'violet', logic: '公开需求 × 成色归一 × 托管验机', signal: '11 个卖家主动提案' },
]

export function ActiveServiceBoard({ onOpenPurchase }: { onOpenPurchase: (id: string) => void }) {
  return (
    <div className="active-service-board scroll-y">
      <header className="board-head">
        <div>
          <span className="eyebrow">Agent 主动发现与执行</span>
          <h3>主动服务场景</h3>
        </div>
        <div className="board-summary"><ShieldCheck size={15} /> 2 个全权代买 · 2 个确认后执行</div>
      </header>

      <div className="service-grid">
        {SCENES.map((item) => {
          const purchase = DEMO_PURCHASES.find((record) => record.scene === item.scene)!
          const Icon = item.icon
          return (
            <article className={`service-case service-${item.color}`} key={item.scene}>
              <div className="service-case-head">
                <span className="service-icon"><Icon size={20} /></span>
                <div>
                  <span className="service-state">{purchase.statusLabel}</span>
                  <h4>{purchase.sceneLabel}</h4>
                </div>
                <span className="service-mode">{purchase.mode === 'autonomous' ? '全权代买' : '确认后执行'}</span>
              </div>
              <div className="service-product">{purchase.product}</div>
              <div className="service-trigger">
                <span>触发信号</span>
                <strong>{item.signal}</strong>
              </div>
              <div className="service-logic">
                <span>可审计决策模型</span>
                <p>{item.logic}</p>
              </div>
              <div className="service-mini-flow">
                {purchase.events.slice(0, 4).map((event, index) => (
                  <div key={event.id}>
                    <b className="num">0{index + 1}</b>
                    <span>{event.title}</span>
                  </div>
                ))}
              </div>
              <footer>
                <span className="num">可信度 {purchase.trustScore}</span>
                <button type="button" onClick={() => onOpenPurchase(purchase.id)}>查看完整过程</button>
              </footer>
            </article>
          )
        })}
      </div>
    </div>
  )
}

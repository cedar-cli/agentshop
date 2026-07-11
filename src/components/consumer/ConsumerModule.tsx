import { Bot, Inbox, MessageSquareText, Radar, ShieldCheck, Swords } from 'lucide-react'
import { useState } from 'react'
import { DEMO_PURCHASES } from '../../demo/demoData'
import { ConsumerConversation } from './ConsumerConversation'
import { DecisionTheater } from './DecisionTheater'
import { ActiveServiceBoard } from './ActiveServiceBoard'
import { ConsumerInbox } from './ConsumerInbox'
import './consumer.css'

type ConsumerView = 'agent' | 'theater' | 'services' | 'inbox'

const VIEWS: Array<{
  key: ConsumerView
  label: string
  icon: typeof Bot
  badge?: string
}> = [
  { key: 'agent', label: '消费 Agent', icon: MessageSquareText },
  { key: 'theater', label: '决策剧场', icon: Swords },
  { key: 'services', label: '主动服务', icon: Radar, badge: '4' },
  { key: 'inbox', label: 'Inbox', icon: Inbox, badge: '3' },
]

export function ConsumerModule() {
  const [view, setView] = useState<ConsumerView>('agent')
  const [selectedId, setSelectedId] = useState(DEMO_PURCHASES[0].id)

  const openPurchase = (id: string) => {
    setSelectedId(id)
    setView('agent')
  }

  return (
    <div className="module consumer-module">
      <header className="consumer-head">
        <div className="consumer-title-wrap">
          <span className="consumer-agent-mark"><Bot size={18} /></span>
          <div>
            <h2 className="module-title">我的消费 Agent</h2>
            <p className="module-desc">只代表你的利益，基于 RepChain 证据完成比较、议价、履约与评价。</p>
          </div>
        </div>
        <div className="consumer-trust-strip">
          <span><ShieldCheck size={15} /> 忠诚归属：买家</span>
          <span className="num">信用 90 · 鉴证权重 4.5×</span>
        </div>
      </header>

      <nav className="consumer-tabs" aria-label="消费者工作台">
        {VIEWS.map((item) => {
          const Icon = item.icon
          return (
            <button
              type="button"
              key={item.key}
              className={view === item.key ? 'on' : ''}
              onClick={() => setView(item.key)}
            >
              <Icon size={16} />
              <span>{item.label}</span>
              {item.badge && <b className="consumer-tab-badge num">{item.badge}</b>}
            </button>
          )
        })}
      </nav>

      <div className="consumer-stage panel">
        {view === 'agent' && (
          <ConsumerConversation selectedId={selectedId} onSelect={setSelectedId} />
        )}
        {view === 'theater' && <DecisionTheater />}
        {view === 'services' && <ActiveServiceBoard onOpenPurchase={openPurchase} />}
        {view === 'inbox' && <ConsumerInbox onOpenPurchase={openPurchase} />}
      </div>
    </div>
  )
}

import {
  Bot,
  CheckCircle2,
  CircleDollarSign,
  MessageCircleMore,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
} from 'lucide-react'
import type { DemoEvent } from '../../demo/demoData'
import { openImageLightbox } from '../shared/ImageLightbox'

export const KIND_ICON = {
  user: UserRound,
  agent: Bot,
  evidence: ShieldCheck,
  'seller-message': Store,
  comparison: Sparkles,
  negotiation: MessageCircleMore,
  approval: CheckCircle2,
  payment: CircleDollarSign,
  fulfilment: PackageCheck,
  attestation: ShieldCheck,
  memory: Bot,
} as const

const ORIGIN_LABEL = { llm: 'LLM', simulation: '模拟', rule: '规则' } as const

export function EventRow({ event, active }: { event: DemoEvent; active: boolean }) {
  const Icon = KIND_ICON[event.kind]
  return (
    <li className={`event-row event-${event.kind} ${active ? 'active' : ''}`}>
      <span className="event-node"><Icon size={14} /></span>
      <div className="event-body">
        <div className="event-title-row">
          <strong>{event.title}</strong>
          {event.origin && (
            <span className={`event-origin origin-${event.origin}`}>{ORIGIN_LABEL[event.origin]}</span>
          )}
          <span>{event.actor}</span>
          <time className="num">{event.time}</time>
        </div>
        <p>{event.body}</p>
        {event.images && event.images.length > 0 && (
          // 真实商品检索命中：展示召回商品的真实缩略图，直观证明「真的搜到了真实商品」
          <div className="event-thumbs">
            {event.images.map((url, index) => (
              <img
                key={`${url}-${index}`}
                className="event-thumb"
                src={url}
                alt="召回商品缩略图"
                loading="lazy"
                referrerPolicy="no-referrer"
                // 点击缩略图放大查看
                onClick={() => openImageLightbox(url, '召回商品')}
                // 图片外链失败（防盗链/网络）时隐藏该缩略图，不留破图占位
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ))}
          </div>
        )}
        {(event.evidence || event.impact) && (
          <div className="event-evidence">
            {event.evidence && <span><ShieldCheck size={12} />{event.evidence}</span>}
            {event.impact && <b>{event.impact}</b>}
          </div>
        )}
      </div>
    </li>
  )
}

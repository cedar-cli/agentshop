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

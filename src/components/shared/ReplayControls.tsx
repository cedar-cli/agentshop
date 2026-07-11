import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { useEffect, useState } from 'react'

export function useReplay(recordId: string, total: number) {
  const [cursor, setCursor] = useState(total)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setCursor(total)
    setPlaying(false)
  }, [recordId, total])

  useEffect(() => {
    if (!playing) return
    if (cursor >= total) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => setCursor((value) => value + 1), 720)
    return () => window.clearTimeout(timer)
  }, [cursor, playing, total])

  const toggle = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (cursor >= total) setCursor(1)
    setPlaying(true)
  }

  const reset = () => {
    setCursor(1)
    setPlaying(false)
  }

  const next = () => {
    setPlaying(false)
    setCursor((value) => Math.min(total, value + 1))
  }

  return { cursor, playing, toggle, reset, next }
}

export function ReplayControls({
  cursor,
  total,
  playing,
  onToggle,
  onReset,
  onNext,
}: {
  cursor: number
  total: number
  playing: boolean
  onToggle: () => void
  onReset: () => void
  onNext: () => void
}) {
  return (
    <div className="replay-controls" aria-label="记录回放控制">
      <button type="button" onClick={onReset} title="回到第一步" aria-label="重置回放">
        <RotateCcw size={15} />
      </button>
      <button
        type="button"
        className="replay-primary"
        onClick={onToggle}
        aria-label={playing ? '暂停回放' : '开始回放'}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
        <span>{playing ? '暂停' : '开始回放'}</span>
      </button>
      <button type="button" onClick={onNext} title="下一步" aria-label="下一步" disabled={cursor >= total}>
        <SkipForward size={15} />
      </button>
      <span className="replay-count num">{Math.min(cursor, total)} / {total}</span>
    </div>
  )
}

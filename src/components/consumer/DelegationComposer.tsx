import { ArrowUp, AtSign, Radar, X } from 'lucide-react'
import { FormEvent, useMemo, useRef, useState } from 'react'
import { DELEGATION_MODES, getDelegationMode } from '../../demo/delegationRuntime'
import type { DelegationMode } from '../../hooks/useConsumerDelegations'

interface DelegationComposerProps {
  onSubmit: (requestText: string, mode: DelegationMode) => void
  autoFocus?: boolean
}

/**
 * 新增委托任务输入框。
 *
 * - 输入 `@` 触发主动服务方式选择器；选中后以 chip 呈现，并从文本中移除 @token。
 * - 不 @ 时以默认「全权代买」提交完整购物意图。
 */
export function DelegationComposer({ onSubmit, autoFocus }: DelegationComposerProps) {
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<DelegationMode>('auto')
  const [showPicker, setShowPicker] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 当前正在输入的 @token（用于筛选候选）。仅当光标末尾 token 以 @ 开头时非空。
  const atToken = useMemo(() => {
    const match = draft.match(/(?:^|\s)@([^\s@]*)$/)
    return match ? match[1] : null
  }, [draft])

  const suggestions = useMemo(() => {
    const keyword = atToken?.toLowerCase() ?? ''
    return DELEGATION_MODES.filter((item) => item.mode !== 'auto').filter(
      (item) => keyword === '' || item.label.toLowerCase().includes(keyword) || item.mode.includes(keyword),
    )
  }, [atToken])

  const pickerOpen = showPicker && atToken !== null && suggestions.length > 0

  const handleChange = (value: string) => {
    setDraft(value)
    setShowPicker(/(?:^|\s)@[^\s@]*$/.test(value))
  }

  const selectMode = (nextMode: DelegationMode) => {
    setMode(nextMode)
    // 去掉正在输入的 @token，仅保留购物意图文本。
    setDraft((current) => current.replace(/(?:^|\s)@[^\s@]*$/, '').replace(/^\s+/, ''))
    setShowPicker(false)
    inputRef.current?.focus()
  }

  const clearMode = () => setMode('auto')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = draft.trim()
    if (!value) return
    onSubmit(value, mode)
    setDraft('')
    setMode('auto')
    setShowPicker(false)
  }

  const activeMode = getDelegationMode(mode)

  return (
    <form className="agent-composer delegation-composer" onSubmit={submit}>
      {pickerOpen && (
        <div className="delegation-picker" role="listbox" aria-label="选择主动服务方式">
          <span className="delegation-picker-title"><Radar size={12} /> 主动服务方式</span>
          {suggestions.map((item) => (
            <button type="button" key={item.mode} role="option" aria-selected={mode === item.mode} onClick={() => selectMode(item.mode)}>
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
      )}
      <div className="delegation-composer-row">
        {mode !== 'auto' && (
          <span className="delegation-mode-chip">
            <AtSign size={11} />{activeMode.label}
            <button type="button" aria-label="移除主动服务方式" onClick={clearMode}><X size={11} /></button>
          </span>
        )}
        <input
          ref={inputRef}
          value={draft}
          autoFocus={autoFocus}
          onChange={(event) => handleChange(event.target.value)}
          aria-label="新增委托任务"
          placeholder={mode === 'auto' ? '描述完整购物意图，或输入 @ 选择主动服务方式…' : `${activeMode.label} · 补充这次委托的商品与约束…`}
        />
        <button type="submit" aria-label="发起委托" disabled={!draft.trim()}><ArrowUp size={18} /></button>
      </div>
    </form>
  )
}

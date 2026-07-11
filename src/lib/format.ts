/* 格式化工具 */

export const yuan = (n: number | null): string =>
  n == null ? '—' : `¥${n.toLocaleString('zh-CN')}`

export const pct = (n: number, digits = 0): string => `${n.toFixed(digits)}%`

export const scoreOf = (n: number): string => n.toFixed(0)

export const shortId = (id: string): string => id.toUpperCase()

/** tick 距今描述 */
export const ago = (tick: number, now: number): string => {
  const d = now - tick
  if (d <= 0) return '刚刚'
  if (d < 60) return `${d} tick 前`
  return `${Math.floor(d / 60)} 轮前`
}

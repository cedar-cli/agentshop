/* Canvas 用具体色值（与 tokens.css 语义对应）
   ORION 浅色主题：节点/连线为浅底上够鲜明的多彩色，文字为深墨 */

export const PALETTE = {
  void: '#f4f2fa',
  surface: '#ffffff',
  grid: 'rgba(120,110,165,0.18)',
  text: '#2e2350', // 深靛墨（选中环 / 关键文字）
  textDim: '#6b6382',
  textFaint: '#9a93ad',
  dim: '#b9b0c4', // 风控降级节点的降噪灰
  fulfil: '#22c07e',
  breach: '#f2513e',
  proposal: '#f2953a',
  data: '#4560e6',
  verify: '#8a41e8',
  pink: '#f0479e',
  consumer: '#4560e6',
  seller: '#f2953a',
  supply: '#8a41e8',
  factory: '#e0865a',
} as const

export function roleCanvasColor(role: string): string {
  switch (role) {
    case 'consumer':
      return PALETTE.consumer
    case 'seller':
      return PALETTE.seller
    case 'supply':
      return PALETTE.supply
    case 'factory':
      return PALETTE.factory
    default:
      return PALETTE.textDim
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

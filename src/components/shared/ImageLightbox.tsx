import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * 全局图片灯箱：在任意组件里调用 openImageLightbox(src, alt) 即可放大查看一张图，
 * 无需在调用处维护弹层状态或层层透传 props。
 *
 * 实现方式：模块级订阅器 + useSyncExternalStore。
 * <ImageLightbox/> 在 App 里挂载一次即可，内部用 createPortal 把遮罩渲染到 body，
 * 点击遮罩空白处或按 Esc 关闭。
 */

// 当前正在展示的图片；null 表示灯箱关闭
interface LightboxState {
  src: string
  alt: string
}

let current: LightboxState | null = null
const listeners = new Set<() => void>()

/** 通知所有订阅者状态已变化，触发 <ImageLightbox/> 重渲染 */
function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * 打开灯箱展示一张图片。src 为空时视为无操作（避免打开空白灯箱）。
 * @param src 图片 URL
 * @param alt 无障碍描述与加载失败时的替代文本
 */
export function openImageLightbox(src: string, alt = ''): void {
  if (!src) return
  current = { src, alt }
  emit()
}

/** 关闭灯箱 */
function closeImageLightbox(): void {
  current = null
  emit()
}

/** useSyncExternalStore 订阅入口：注册监听器并返回取消订阅函数 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** useSyncExternalStore 快照读取：返回当前灯箱状态 */
function getSnapshot(): LightboxState | null {
  return current
}

/**
 * 灯箱容器组件：挂在 App 根部一次即可。
 * 根据模块级状态决定是否渲染遮罩层；未打开时返回 null，不产生任何 DOM。
 */
export function ImageLightbox() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // 灯箱打开时监听 Esc 关闭；关闭或卸载时移除监听，避免泄漏
  useEffect(() => {
    if (!state) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeImageLightbox()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state])

  if (!state) return null

  return createPortal(
    // 点击遮罩空白处关闭；点击图片本身不冒泡关闭
    <div className="lightbox-overlay" role="dialog" aria-modal="true" onClick={closeImageLightbox}>
      <button type="button" className="lightbox-close" aria-label="关闭" onClick={closeImageLightbox}>
        <X size={20} />
      </button>
      <img
        className="lightbox-image"
        src={state.src}
        alt={state.alt}
        referrerPolicy="no-referrer"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  )
}

import { useRef, useState } from "react"

/**
 * useMessagePin - 用户消息吸顶：滚动监听 + 各用户消息自然流结束位置锚点，
 * 用户消息完全滚出滚动容器视口顶部后，将其 sticky 钉在容器顶部。
 * 主消息列表与子代理面板复用。
 */
export const useMessagePin = () => {
  // 当前钉住的用户消息 id。
  const [pinnedUserMessageId, setPinnedUserMessageId] = useState<string | null>(null)
  // 各用户消息自然流结束位置的 DOM 引用（按用户消息 id 索引）。
  const userMessageEndRefs = useRef(new Map<string, HTMLDivElement>())

  // 仅在用户消息完全离开视口后启用吸顶。
  const updatePinnedQuestion = (container: HTMLDivElement | null): void => {
    if (!container) return
    let pinnedId: string | null = null
    const containerTop = container.getBoundingClientRect().top

    for (const [id, messageEnd] of userMessageEndRefs.current) {
      const isCurrentlyPinned = pinnedUserMessageId === id
      const rectTop = messageEnd.getBoundingClientRect().top

      // 滞后（Hysteresis）缓冲区：若当前已处于吸顶状态，释放吸顶（unpin）需要更宽松的阈值（比如往下滚动 64px 以上才解除），
      // 避免由于吸顶后高度变小、滚动条回弹导致在吸顶临界点产生无限循环抖动。
      const threshold = isCurrentlyPinned ? containerTop + 64 : containerTop

      if (container.scrollTop > 0.5 && rectTop <= threshold) {
        pinnedId = id
      }
    }
    setPinnedUserMessageId(pinnedId)
  }

  const attachUserMessageEndRef =
    (messageId: string) =>
    (el: HTMLDivElement | null): void => {
      if (el) userMessageEndRefs.current.set(messageId, el)
      else userMessageEndRefs.current.delete(messageId)
    }

  return { pinnedUserMessageId, attachUserMessageEndRef, updatePinnedQuestion }
}

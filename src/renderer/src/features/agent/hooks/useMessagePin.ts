import { type MutableRefObject, useRef, useState } from "react"

/**
 * useMessagePin - 用户消息吸顶：滚动监听 + 各用户消息自然流结束位置锚点，
 * 用户消息完全滚出滚动容器视口顶部后，将其 sticky 钉在容器顶部。
 * 主消息列表与子代理面板复用。
 */
export const useMessagePin = (groupRefs?: MutableRefObject<Map<string, HTMLDivElement>>) => {
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
      const rectTop = messageEnd.getBoundingClientRect().top

      // 严格判定：只有当用户消息底部完全滚出容器视口顶部时才启用吸顶，
      // 没有任何滞后缓冲区，确保只要任何一部分消息在视口内，就不显示吸顶消息。
      const threshold = containerTop

      if (container.scrollTop > 0.5 && rectTop <= threshold) {
        // 如果提供了 groupRefs 且该 QA 组内的 AI 消息气泡的 bottom 边界已完全离开视口，则不再吸顶该消息
        if (groupRefs) {
          const groupEl = groupRefs.current.get(id)
          if (groupEl) {
            // 优先获取 AI 消息气泡容器进行高精边界测量，从而避免吸顶用户消息超界遮挡下方的功能 icon 或 token 统计
            const bubbleEl = groupEl.querySelector('[data-assistant-bubble="true"]')
            const limitEl = bubbleEl || groupEl
            const groupBottom = limitEl.getBoundingClientRect().bottom
            if (groupBottom <= containerTop + 8) {
              continue
            }
          }
        }
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

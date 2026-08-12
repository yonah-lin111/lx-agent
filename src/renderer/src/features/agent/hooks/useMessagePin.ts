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

  // 用户消息在自然流中的底部已完全越过滚动容器视口顶部。
  const hasUserMessageFullyScrolledPast = (
    messageEnd: HTMLDivElement,
    container: HTMLDivElement,
  ): boolean => {
    if (container.scrollTop <= 0.5) return false
    const containerTop = container.getBoundingClientRect().top
    return messageEnd.getBoundingClientRect().top <= containerTop
  }

  // 仅在用户消息完全离开视口后启用吸顶。
  const updatePinnedQuestion = (container: HTMLDivElement | null): void => {
    if (!container) return
    let pinnedId: string | null = null
    for (const [id, messageEnd] of userMessageEndRefs.current) {
      if (hasUserMessageFullyScrolledPast(messageEnd, container)) {
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

import { useCallback, useEffect, useRef, useState } from "react"
import { promptHistoryApi } from "../api/promptHistoryApi"

// 历史浏览结果：切换后的文本与光标落点；null = 未处理（到顶/到底/无历史）。
export type PromptHistoryNavigation = { text: string; cursor: "start" | "end" } | null

/**
 * 管理输入框历史提示词：全局共享从主进程加载，发送时记录，
 * 支持 pi 风格 ↑↓ 浏览（进入时保存草稿，离开时恢复）。
 */
export const usePromptHistory = () => {
  const [history, setHistory] = useState<string[]>([])
  // 是否处于历史浏览中（驱动 ↑↓ 触发条件）。
  const [browsing, setBrowsing] = useState(false)
  // 当前浏览位置：-1 = 未浏览，0 = 最近一条，越大越旧。
  const historyIndex = useRef(-1)
  // 进入历史时保存的输入草稿，离开历史时恢复。
  const draft = useRef("")

  useEffect(() => {
    let current = true
    void promptHistoryApi.get().then((items) => {
      if (current) setHistory(items)
    })
    return () => {
      current = false
    }
  }, [])

  // 记录一条已发送提示词（去空白、跳过连续重复由主进程服务负责）。
  const record = useCallback((text: string): void => {
    const trimmed = text.trim()
    if (!trimmed) return
    void promptHistoryApi.add(trimmed).then(setHistory)
  }, [])

  // 退出历史浏览：下次 ↑ 重新进入并保存最新草稿。
  const reset = useCallback((): void => {
    historyIndex.current = -1
    draft.current = ""
    setBrowsing(false)
  }, [])

  // ↑↓ 浏览历史：返回新文本与光标落点；未命中返回 null。
  const navigate = useCallback(
    (direction: "up" | "down", text: string): PromptHistoryNavigation => {
      const index = historyIndex.current
      if (direction === "up") {
        if (history.length === 0) return null
        if (index === -1) {
          draft.current = text
          historyIndex.current = 0
          setBrowsing(true)
          return { text: history[0] ?? "", cursor: "start" }
        }
        if (index < history.length - 1) {
          const next = index + 1
          historyIndex.current = next
          return { text: history[next] ?? "", cursor: "start" }
        }
        return null
      }
      if (index > 0) {
        const next = index - 1
        historyIndex.current = next
        return { text: history[next] ?? "", cursor: "end" }
      }
      if (index === 0) {
        historyIndex.current = -1
        const saved = draft.current
        draft.current = ""
        setBrowsing(false)
        return { text: saved, cursor: "end" }
      }
      return null
    },
    [history],
  )

  return { browsing, record, reset, navigate }
}

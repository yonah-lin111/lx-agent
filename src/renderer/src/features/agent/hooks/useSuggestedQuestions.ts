import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"
import { useCallback, useEffect, useRef, useState } from "react"
import { agentApi } from "../api/agentApi"

// 建议问题 Hook 参数。
type UseSuggestedQuestionsOptions = {
  // 是否满足触发条件（最后一条 AI 回答 + 正常完成 + 有上下文）。
  enabled: boolean
  // 生成建议所需的对话上下文（按内容键去重，避免重复生成）。
  context: SuggestedQuestionContextMessage[]
}

/**
 * 为最后一条 AI 回答生成建议问题；条件不满足或条目不再是最后一条时清理状态。
 */
export const useSuggestedQuestions = ({
  enabled,
  context,
}: UseSuggestedQuestionsOptions): {
  questions: string[]
  isLoading: boolean
  clear: () => void
} => {
  const [questions, setQuestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const contextKey = context.map((item) => `${item.role}:${item.content}`).join("\u0000")
  const generatedKeyRef = useRef("")

  // 手动清空（发送/回显建议问题后立即隐藏）。
  const clear = useCallback((): void => {
    setQuestions([])
    setIsLoading(false)
    generatedKeyRef.current = ""
  }, [])

  useEffect(() => {
    // 条件不满足（流式中、非最后一条、无上下文等）：清理状态，允许后续重新生成。
    if (!enabled) {
      setQuestions([])
      setIsLoading(false)
      generatedKeyRef.current = ""
      return
    }
    // 同一上下文的生成已完成或进行中：避免重复请求。
    if (!context.length || generatedKeyRef.current === contextKey) return

    let active = true
    generatedKeyRef.current = contextKey
    setIsLoading(true)
    void agentApi
      .suggestedQuestions(context)
      .then((next) => {
        if (active) setQuestions(next)
      })
      .catch(() => {
        if (active) setQuestions([])
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [enabled, context, contextKey])

  return { questions, isLoading, clear }
}

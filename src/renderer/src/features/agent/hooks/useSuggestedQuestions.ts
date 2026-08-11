import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"
import { useCallback, useEffect, useRef, useState } from "react"
import { agentApi } from "../api/agentApi"

// 建议问题 Hook 参数。
type UseSuggestedQuestionsOptions = {
  // 触发条件（最后一条 AI 回答 + 正常完成 + 无错误 + 有上下文等静态守卫）。
  enabled: boolean
  // 当前条目是否处于流式输出中（用于判定"流式→完成"实时转换）。
  isStreaming: boolean
  // 是否为当前最后一条 AI 回答（不再是时复位转换标记）。
  isLastAssistant: boolean
  // 生成建议所需的对话上下文。
  context: SuggestedQuestionContextMessage[]
}

/**
 * 为最后一条 AI 回答生成建议问题。
 * 仅在"流式→完成"实时转换后生成：恢复的历史消息挂载即完成（无此转换），不生成。
 * 条件不再满足或条目不再是最后一条时清理状态。
 */
export const useSuggestedQuestions = ({
  enabled,
  isStreaming,
  isLastAssistant,
  context,
}: UseSuggestedQuestionsOptions): {
  questions: string[]
  isLoading: boolean
  clear: () => void
} => {
  const [questions, setQuestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const contextKey = context.map((item) => `${item.role}:${item.content}`).join("\u0000")
  // 成功生成过的上下文键（同内容不重复请求）。
  const completedKeyRef = useRef("")
  // 正在生成的上下文键（并发去重，卸载清理以兼容 StrictMode 双挂载）。
  const inFlightKeyRef = useRef("")
  // 最近一次渲染是否观察到"流式→完成"转换。
  const freshCompletionRef = useRef(false)
  const prevStreamingRef = useRef(isStreaming)

  // 渲染期同步转换状态（纯派生）：记录流式结束的瞬间；
  // 新一轮流式开始或条目不再是最后一条时复位（恢复的历史消息无此转换，不生成）。
  if (!isStreaming && prevStreamingRef.current) {
    freshCompletionRef.current = true
  }
  if (isStreaming || !isLastAssistant) {
    freshCompletionRef.current = false
  }
  prevStreamingRef.current = isStreaming

  // 手动清空（发送/回显建议问题后立即隐藏）。
  const clear = useCallback((): void => {
    setQuestions([])
    setIsLoading(false)
    completedKeyRef.current = ""
    inFlightKeyRef.current = ""
    freshCompletionRef.current = false
  }, [])

  useEffect(() => {
    // 条件不满足（流式中、非最后一条、无实时完成转换等）：清理状态，允许后续重新生成。
    if (!enabled || isStreaming || !freshCompletionRef.current) {
      setQuestions([])
      setIsLoading(false)
      completedKeyRef.current = ""
      inFlightKeyRef.current = ""
      return
    }
    // 同内容已生成或正在生成：避免重复请求。
    if (!context.length || completedKeyRef.current === contextKey) return
    if (inFlightKeyRef.current === contextKey) return

    let active = true
    inFlightKeyRef.current = contextKey
    setIsLoading(true)
    void agentApi
      .suggestedQuestions(context)
      .then((next) => {
        if (active) {
          setQuestions(next)
          completedKeyRef.current = contextKey
        }
      })
      .catch(() => {
        if (active) setQuestions([])
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
      // 卸载时释放进行中标记，兼容 StrictMode 模拟卸载后重新生成。
      inFlightKeyRef.current = ""
    }
  }, [enabled, isStreaming, context, contextKey])

  return { questions, isLoading, clear }
}

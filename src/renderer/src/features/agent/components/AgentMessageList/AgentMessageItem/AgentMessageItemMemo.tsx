import { memo } from "react"
import type { ChatMessage } from "@/features/agent/types"
import { AgentMessageItem } from "./AgentMessageItem"

/**
 * 续写消息数组按元素引用比较：分组每次全量重建会产生新数组，若直接比较数组引用，
 * 所有含工具结果的 QA 组都会在每帧重渲染（含 markdown 重解析）；元素逐一相同即视为未变化。
 */
const isSameMessageList = (
  prev: ChatMessage[] | undefined,
  next: ChatMessage[] | undefined,
): boolean => {
  if (prev === next) return true
  const prevList = prev ?? []
  const nextList = next ?? []
  if (prevList.length !== nextList.length) return false
  for (let index = 0; index < prevList.length; index++) {
    if (prevList[index] !== nextList[index]) return false
  }
  return true
}

// 仅比较数据 props 的 memo：流式时 useAgentChat 只替换当前消息对象，其余消息引用不变，
// 借此跳过所有未变化消息的重渲染（其 markdown 渲染成本不再每 tick 重跑）。
export const AgentMessageItemMemo = memo(AgentMessageItem, (prev, next) => {
  return (
    prev.message === next.message &&
    isSameMessageList(prev.continuationMessages, next.continuationMessages) &&
    prev.isLoading === next.isLoading &&
    prev.isEditing === next.isEditing &&
    prev.isLastAssistant === next.isLastAssistant &&
    prev.readOnly === next.readOnly &&
    prev.showScrollToBottom === next.showScrollToBottom &&
    prev.canContinue === next.canContinue &&
    prev.suggestedQuestionContext === next.suggestedQuestionContext
  )
})

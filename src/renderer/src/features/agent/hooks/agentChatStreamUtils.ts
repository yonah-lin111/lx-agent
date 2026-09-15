import type { QuestionAnswer, SubagentData } from "@shared/contracts/agent"
import type { ChatBlock, ChatMessage } from "@/features/agent/types"
import { parseQuestionAnswersFromText } from "@/features/agent/utils"

// 展示条目 id 自增（模块单例，跨 Hook 实例保持唯一）。
let messageSequence = 0

// 生成下一条展示条目 id。
export const createChatMessageId = (): string => `m${++messageSequence}`

// 请求下一帧（rAF 不可用时退化为 16ms 定时器）。
export const requestFrame = (callback: () => void): number =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : (setTimeout(callback, 16) as unknown as number)

// 取消帧回调。
export const cancelFrame = (handle: number): void => {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle)
  } else {
    clearTimeout(handle)
  }
}

// 恢复会话时把 task 子代理快照与 question 答案（兜底）回填到对应 toolCall 块。
export const mergeSubagentSnapshots = (chatMessages: ChatMessage[]): ChatMessage[] => {
  const subagentByToolCallId = new Map<string, SubagentData>()
  const answersByToolCallId = new Map<string, QuestionAnswer[]>()
  for (const message of chatMessages) {
    for (const block of message.blocks) {
      if (block.kind === "toolResult") {
        if (block.subagent) {
          subagentByToolCallId.set(block.toolCallId, block.subagent)
        }
        if (block.toolName === "question" && block.text) {
          const parsed = parseQuestionAnswersFromText(block.text)
          if (parsed) {
            answersByToolCallId.set(block.toolCallId, parsed)
          }
        }
      }
    }
  }
  if (subagentByToolCallId.size === 0 && answersByToolCallId.size === 0) return chatMessages
  return chatMessages.map((message) => ({
    ...message,
    blocks: message.blocks.map((block) => {
      if (block.kind === "toolCall") {
        const subagent = subagentByToolCallId.get(block.toolCallId)
        const fallbackAnswers = answersByToolCallId.get(block.toolCallId)
        return {
          ...block,
          ...(subagent ? { subagent } : {}),
          ...(!block.answers && fallbackAnswers ? { answers: fallbackAnswers } : {}),
        }
      }
      return block
    }),
  }))
}

// 工具调用块及补丁类型（流式进度/子代理快照按 toolCallId 定点更新）。
export type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>
export type ToolCallPatch = Partial<ToolCallBlock>

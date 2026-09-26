import type { BtwContextMessage, SuggestedQuestionContextMessage } from "@shared/contracts/agent"

// 上下文保留条数上限（最近的 N 条消息）。
export const MAX_CONTEXT_MESSAGES = 12
// 单条消息内容截断上限。
export const MAX_MESSAGE_CHARS = 8000

// 上下文裁剪可接受的文本消息形状（建议问题与 btw 侧问共用）。
type ConversationContextMessage = SuggestedQuestionContextMessage | BtwContextMessage

/**
 * 按上下文预算保留最近对话，避免旁路模型请求挤占主对话可用上下文。
 */
export const trimConversationContext = <T extends ConversationContextMessage>(
  messages: T[],
  maxChars: number,
): T[] => {
  const selected: T[] = []
  let usedChars = 0

  for (const message of messages.slice(-MAX_CONTEXT_MESSAGES).reverse()) {
    const availableChars = maxChars - usedChars
    if (availableChars <= 0) break
    const content = message.content.slice(-Math.min(MAX_MESSAGE_CHARS, availableChars))
    if (!content) continue
    selected.unshift({ ...message, content } as T)
    usedChars += content.length
  }

  return selected
}

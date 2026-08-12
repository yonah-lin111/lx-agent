import type { ChatMessage } from "./types"

// AI 消息与同一轮后续消息的展示条目（助手消息 + 随后的工具结果/续写消息，供 AgentMessageList 与子代理面板复用）。
export interface MessageGroupEntry {
  message: ChatMessage
  continuationMessages: ChatMessage[]
}

// QA 对展示组：用户消息作为组头吸顶，紧随其后的 AI 条目作为回复。
export interface MessageQaGroup {
  // 组头用户消息（可能为空的孤立 AI 条目）。
  userMessage: ChatMessage | null
  // 紧随其后的 AI 回复条目（可能缺失，如用户消息尚无回复）。
  assistant: MessageGroupEntry | null
}

export const groupAgentMessages = (messages: ChatMessage[]): MessageGroupEntry[] =>
  messages.reduce<MessageGroupEntry[]>((entries, message) => {
    const previousEntry = entries.at(-1)

    if (
      message.role !== "user" &&
      message.role !== "compactionSummary" &&
      previousEntry?.message.role === "assistant"
    ) {
      previousEntry.continuationMessages.push(message)
      return entries
    }

    entries.push({ message, continuationMessages: [] })
    return entries
  }, [])

export const buildQaGroups = (entries: MessageGroupEntry[]): MessageQaGroup[] => {
  const groups: MessageQaGroup[] = []
  for (const entry of entries) {
    if (entry.message.role === "user") {
      groups.push({ userMessage: entry.message, assistant: null })
      continue
    }
    const lastGroup = groups.at(-1)
    if (lastGroup?.userMessage && !lastGroup.assistant) {
      lastGroup.assistant = entry
    } else {
      groups.push({ userMessage: null, assistant: entry })
    }
  }
  return groups
}

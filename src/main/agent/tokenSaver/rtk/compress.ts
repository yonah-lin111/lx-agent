// 工具结果消息压缩：非破坏性替换文本块，跳过错误结果。
import type { LlmMessage } from "@/agent/core/types"
import { compressToolOutputText } from "./applyFilter"

type ToolResultLlmMessage = Extract<LlmMessage, { role: "toolResult" }>

// 压缩单条工具结果消息；未发生变更时返回原对象。
const compressToolResultMessage = (message: ToolResultLlmMessage): ToolResultLlmMessage => {
  // 错误输出保留原始 trace。
  if (message.isError) return message

  let changed = false
  const content = message.content.map((block) => {
    if (block.type !== "text") return block
    const compressed = compressToolOutputText(block.text)
    if (compressed === block.text) return block
    changed = true
    return { ...block, text: compressed }
  })

  return changed ? { ...message, content } : message
}

// 压缩消息列表中的全部工具结果；无任何变更时返回原数组引用。
export const compressToolResultMessages = (messages: LlmMessage[]): LlmMessage[] => {
  let changed = false
  const next = messages.map((message) => {
    if (message.role !== "toolResult") return message
    const compressed = compressToolResultMessage(message)
    if (compressed !== message) changed = true
    return compressed
  })
  return changed ? next : messages
}

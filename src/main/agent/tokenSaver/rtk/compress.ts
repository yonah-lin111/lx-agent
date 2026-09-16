// 工具结果消息压缩：非破坏性替换文本块，跳过错误结果。

import type { TokenSaverHit } from "@shared/contracts/agent"
import type { LlmMessage } from "@/agent/core/types"
import { compressToolOutputText } from "./applyFilter"
import type { RtkFilterName } from "./constants"

type ToolResultLlmMessage = Extract<LlmMessage, { role: "toolResult" }>

// RTK 压缩统计累加器（随出站请求汇总，供消息落库与执行流程展示）。
export interface RtkCompressionStats {
  // 实际生效的过滤器名（去重，按首次生效顺序）。
  filters: Set<RtkFilterName>
  // 整轮节省的字符数。
  savedChars: number
  // 逐条工具输出的命中明细（按 toolCallId 归因）。
  hits: TokenSaverHit[]
}

// 创建空统计累加器。
export const createRtkCompressionStats = (): RtkCompressionStats => ({
  filters: new Set(),
  savedChars: 0,
  hits: [],
})

// 压缩单条工具结果消息；未发生变更时返回原对象。
const compressToolResultMessage = (
  message: ToolResultLlmMessage,
  stats?: RtkCompressionStats,
): ToolResultLlmMessage => {
  // 错误输出保留原始 trace。
  if (message.isError) return message

  let changed = false
  const content = message.content.map((block) => {
    if (block.type !== "text") return block
    const result = compressToolOutputText(block.text)
    if (result.text === block.text) return block
    changed = true
    if (stats && result.filterName && result.savedChars !== undefined) {
      stats.filters.add(result.filterName)
      stats.savedChars += result.savedChars
      stats.hits.push({
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        filter: result.filterName,
        savedChars: result.savedChars,
      })
    }
    return { ...block, text: result.text }
  })

  return changed ? { ...message, content } : message
}

// 压缩消息列表中的全部工具结果；无任何变更时返回原数组引用。
export const compressToolResultMessages = (
  messages: LlmMessage[],
  stats?: RtkCompressionStats,
): LlmMessage[] => {
  let changed = false
  const next = messages.map((message) => {
    if (message.role !== "toolResult") return message
    const compressed = compressToolResultMessage(message, stats)
    if (compressed !== message) changed = true
    return compressed
  })
  return changed ? next : messages
}

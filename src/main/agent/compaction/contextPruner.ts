import type { AgentMessage, TextContent, ToolResultMessage } from "@shared/contracts/agent"

/**
 * 上下文智能修剪配置 (Context Pruner Config)
 *
 * 借鉴 oh-my-pi 的 session-maintenance / pruneToolOutputs 机制：
 * 在消息进入模型上下文或生成摘要之前，修剪历史较早的只读大输出（read, grep, find, ls, webfetch），
 * 替换为纯文本占位符，从而极大压缩长会话上下文 Token 消耗。
 */
export interface ContextPrunerOptions {
  /** 保留最近完整输出的消息轮数（从尾部倒数），默认 6 条消息 */
  recentMessagesToKeep?: number
  /** 单个工具输出超过多少行触发修剪，默认 20 行 */
  lineThreshold?: number
  /** 单个工具输出超过多少字符触发修剪，默认 500 字符 */
  charThreshold?: number
  /** 纳入修剪的目标只读工具集合 */
  prunableTools?: string[]
}

const DEFAULT_PRUNABLE_TOOLS = ["read", "grep", "find", "ls", "webfetch", "webSearch"]

/**
 * 纯函数：对 AgentMessage[] 执行只读工具大输出修剪
 * 注意：返回修剪后的浅拷贝数组与修剪后的 message 对象，绝不污染原始持久化数据。
 */
export function pruneHistoricalToolOutputs(
  messages: AgentMessage[],
  options: ContextPrunerOptions = {},
): AgentMessage[] {
  if (messages.length === 0) return []

  const recentToKeep = options.recentMessagesToKeep ?? 6
  const lineThreshold = options.lineThreshold ?? 20
  const charThreshold = options.charThreshold ?? 500
  const prunableSet = new Set(options.prunableTools ?? DEFAULT_PRUNABLE_TOOLS)

  // 计算可修剪的历史截止索引（尾部 recentToKeep 条消息完全豁免）
  const pruneCutoffIndex = Math.max(0, messages.length - recentToKeep)

  return messages.map((message, index) => {
    // 尾部消息保持原样
    if (index >= pruneCutoffIndex) {
      return message
    }

    if (message.role === "toolResult") {
      return pruneToolResultMessage(
        message as ToolResultMessage,
        prunableSet,
        lineThreshold,
        charThreshold,
      )
    }

    return message
  })
}

function pruneToolResultMessage(
  msg: ToolResultMessage,
  prunableSet: Set<string>,
  lineThreshold: number,
  charThreshold: number,
): ToolResultMessage {
  // 非目标工具不修剪
  if (msg.toolName && !prunableSet.has(msg.toolName)) {
    return msg
  }

  let modified = false
  const newContent = msg.content.map((block) => {
    if (block.type !== "text") return block

    const text = block.text
    const lines = text.split("\n")
    const lineCount = lines.length
    const charCount = text.length

    if (lineCount > lineThreshold || charCount > charThreshold) {
      modified = true
      const toolLabel = msg.toolName ? ` "${msg.toolName}"` : ""
      return {
        type: "text",
        text: `[Historical output of tool${toolLabel} pruned (${lineCount} lines / ${charCount} chars). Refer to latest tool outputs if needed.]`,
      } as TextContent
    }

    return block
  })

  if (!modified) return msg

  return {
    ...msg,
    content: newContent,
  }
}

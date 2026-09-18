import { readFileSync } from "node:fs"
import type { AgentMessage, ImageContent, TextContent, ToolCall } from "@shared/contracts/agent"
import type { ModelMessage } from "ai"
import { tool as aiTool } from "ai"
import type { AgentTool, LlmMessage } from "../core/types"

// 文本块内容拼接。
const blockText = (block: TextContent | ImageContent): string =>
  block.type === "text" ? block.text : `[image: ${block.mimeType}]`

// 将工具内容块序列化为模型可读文本。
const contentToText = (content: Array<TextContent | ImageContent>): string =>
  content.map(blockText).join("\n")

type UserLlmMessage = Extract<LlmMessage, { role: "user" }>
type AssistantLlmMessage = Extract<LlmMessage, { role: "assistant" }>
type ToolResultLlmMessage = Extract<LlmMessage, { role: "toolResult" }>

// 单条 user 消息转换（文本/图片内容块 + 附件动态读取）。
const convertUserMessage = (message: UserLlmMessage): ModelMessage => {
  const agentMsg = message as unknown as AgentMessage
  const contentArray: any[] = []

  // 1. 获取并转换原本已存在于 content 中的内容块（保持对标准多模态数组和纯字符串的完全向下兼容）
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block.type === "image") {
        contentArray.push({
          type: "image" as const,
          image: `data:${block.mimeType};base64,${block.data}`,
        })
      } else if (block.type === "text" && block.text) {
        contentArray.push({
          type: "text" as const,
          text: block.text,
        })
      }
    }
  } else if (typeof message.content === "string" && message.content) {
    contentArray.push({
      type: "text" as const,
      text: message.content,
    })
  }

  // 2. 动态追加附件（图片只给路径提示、由模型调用 view_image 查看；文本文件内联为文档）
  if (agentMsg.role === "user" && agentMsg.files) {
    for (const file of agentMsg.files) {
      if (file.type === "image") {
        contentArray.push({
          type: "text" as const,
          text: `Attached image: ${file.path} (use the view_image tool to inspect it)`,
        })
      } else if (file.type === "text") {
        try {
          const fileContent = readFileSync(file.path, "utf8")
          contentArray.push({
            type: "text" as const,
            text: `\n\n<document path="${file.name}">\n${fileContent}\n</document>`,
          })
        } catch (err) {
          console.error(`Failed to read text file for LLM: ${file.path}`, err)
        }
      }
    }
  }

  return {
    role: "user",
    content:
      contentArray.length > 0
        ? contentArray.length === 1 && contentArray[0].type === "text"
          ? contentArray[0].text
          : contentArray
        : "",
  } as ModelMessage
}

// 单条 assistant 消息转换（text / reasoning / tool-call parts）。
const convertAssistantMessage = (message: AssistantLlmMessage): ModelMessage => {
  const parts = message.content.map((block) => {
    if (block.type === "text") {
      return { type: "text" as const, text: block.text }
    }
    if (block.type === "thinking") {
      // 带签名的思考块必须原样回传：Anthropic 扩展思考 + 工具续轮校验签名，
      // 无签名 reasoning 会被 @ai-sdk/anthropic 丢弃（unsupported reasoning metadata）。
      return block.signature
        ? {
            type: "reasoning" as const,
            text: block.thinking,
            providerOptions: { anthropic: { signature: block.signature } },
          }
        : { type: "reasoning" as const, text: block.thinking }
    }
    return {
      type: "tool-call" as const,
      toolCallId: block.id,
      toolName: block.name,
      input: block.arguments,
    }
  })
  return { role: "assistant", content: parts } as ModelMessage
}

// 单条 toolResult → tool 消息（图片不进入 tool-result output，见下方说明）。
const convertToolResultMessage = (message: ToolResultLlmMessage): ModelMessage =>
  ({
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        // 工具错误已编码在内容文本中；isError 不映射到 AI SDK tool-result part。
        output: { type: "text", value: contentToText(message.content) },
      },
    ],
  }) as ModelMessage

/**
 * 连续 toolResult（并行工具调用的结果段）合并为一条 user 图片消息。
 *
 * 图片不放进 tool-result output：openai / openai-compatible 会把 content parts
 * JSON.stringify 成纯文本，图像实际丢失。同时 Provider 要求一个 assistant 消息的
 * 全部 tool 结果必须连续，因此图片消息只能在整段 tool 结果之后追加一条。
 */
const convertToolResultImages = (group: ToolResultLlmMessage[]): ModelMessage | null => {
  const parts: any[] = []
  for (const message of group) {
    const images = message.content.filter((block): block is ImageContent => block.type === "image")
    if (images.length === 0) continue
    const imageDetails = (message as { image?: { path?: string } }).image
    const pathHint = imageDetails?.path ? ` (${imageDetails.path})` : ""
    for (const block of images) {
      parts.push({
        type: "text" as const,
        text: `Image from tool "${message.toolName}"${pathHint}:`,
      })
      parts.push({
        type: "image" as const,
        image: `data:${block.mimeType};base64,${block.data}`,
      })
    }
  }
  if (parts.length === 0) return null
  return { role: "user", content: parts } as ModelMessage
}

/**
 * 悬空 toolCall 兜底修复：assistant 的 toolCall 在后续消息中找不到对应 toolResult 时，
 * 在投递前补一条合成错误结果。残缺 assistant 消息（流中断/中止/旧数据）会让 AI SDK
 * 抛 MissingToolResultsError 并卡死会话；此处只修请求载荷，不改写会话历史。
 */
const repairDanglingToolCalls = (messages: LlmMessage[]): LlmMessage[] => {
  const repaired: LlmMessage[] = []
  let pendingToolCalls: Array<{ id: string; name: string }> = []
  // 已补合成结果的 toolCall：迟到的真实结果必须丢弃，否则会变成 provider 拒绝的孤儿 tool_result。
  const synthesizedToolCallIds = new Set<string>()

  const flushPendingToolCalls = () => {
    for (const toolCall of pendingToolCalls) {
      synthesizedToolCallIds.add(toolCall.id)
      repaired.push({
        role: "toolResult",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: [
          {
            type: "text",
            text: `Tool call "${toolCall.name}" was not executed: no matching tool result exists in the assistant turn. Re-issue the tool call if it is still needed.`,
          },
        ],
        isError: true,
      })
    }
    pendingToolCalls = []
  }

  for (const message of messages) {
    if (message.role === "assistant") {
      flushPendingToolCalls()
      repaired.push(message)
      pendingToolCalls = message.content
        .filter((block): block is ToolCall => block.type === "toolCall")
        .map((block) => ({ id: block.id, name: block.name }))
      continue
    }
    if (message.role === "toolResult") {
      if (synthesizedToolCallIds.has(message.toolCallId)) continue
      pendingToolCalls = pendingToolCalls.filter((toolCall) => toolCall.id !== message.toolCallId)
      repaired.push(message)
      continue
    }
    // user 消息前的悬空调用先补齐，保证 toolResult 紧跟其 assistant 消息。
    flushPendingToolCalls()
    repaired.push(message)
  }
  flushPendingToolCalls()
  return repaired
}

/**
 * LlmMessage → AI SDK ModelMessage。
 *
 * 字段名必须与 AI SDK ModelMessage schema 完全一致（zod 默认 strip 未知字段）：
 * - tool-call part 的参数字段为 `input`
 * - tool-result part 的 output 为 `{ type: "text", value }`
 */
export const toModelMessages = (messages: LlmMessage[]): ModelMessage[] => {
  const result: ModelMessage[] = []
  const repairedMessages = repairDanglingToolCalls(messages)
  for (let index = 0; index < repairedMessages.length; index += 1) {
    const message = repairedMessages[index]
    if (message.role === "user") {
      result.push(convertUserMessage(message))
      continue
    }
    if (message.role === "assistant") {
      // 空 content 的 assistant（首 token 前失败/中止）对 provider 非法（Anthropic 要求非末尾消息内容非空），
      // 且不携带任何语义：仅从请求载荷中剔除，会话历史与 UI 展示保持不变。
      if (message.content.length === 0) continue
      result.push(convertAssistantMessage(message))
      continue
    }

    // 收集连续 toolResult：先输出全部 tool 消息，再按段合并一条 user 图片消息。
    const group: ToolResultLlmMessage[] = []
    while (index < repairedMessages.length && repairedMessages[index].role === "toolResult") {
      group.push(repairedMessages[index] as ToolResultLlmMessage)
      index += 1
    }
    index -= 1
    for (const item of group) {
      result.push(convertToolResultMessage(item))
    }
    const imagesMessage = convertToolResultImages(group)
    if (imagesMessage) {
      result.push(imagesMessage)
    }
  }
  return result
}

// AgentTool → AI SDK tool 定义（不提供 execute：工具执行权在 agent-loop）。
export const toAiTools = (
  tools: AgentTool<any>[] | undefined,
): Record<string, ReturnType<typeof aiTool>> | undefined => {
  if (!tools || tools.length === 0) return undefined
  return Object.fromEntries(
    tools.map((tool) => [
      tool.name,
      aiTool({ description: tool.description, inputSchema: tool.inputSchema }),
    ]),
  )
}

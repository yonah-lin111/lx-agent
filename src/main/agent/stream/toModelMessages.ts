import { readFileSync } from "node:fs"
import type { AgentMessage, ImageContent, TextContent } from "@shared/contracts/agent"
import type { ModelMessage } from "ai"
import { tool as aiTool } from "ai"
import { nativeImage } from "electron"
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

  // 2. 动态读取并追加附件（图片转为 base64, 文本文件作为文本追加）
  if (agentMsg.role === "user" && agentMsg.files) {
    for (const file of agentMsg.files) {
      if (file.type === "image") {
        try {
          let base64Data: string
          let mimeType = "image/jpeg" // 压缩为 JPEG 格式

          const img = nativeImage.createFromPath(file.path)
          if (!img.isEmpty()) {
            const size = img.getSize()
            const maxDim = 1024
            let width = size.width
            let height = size.height

            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width)
                width = maxDim
              } else {
                width = Math.round((width * maxDim) / height)
                height = maxDim
              }
            }

            const resizedImg = img.resize({ width, height, quality: "better" })
            const jpegBuffer = resizedImg.toJPEG(80)
            base64Data = jpegBuffer.toString("base64")
          } else {
            // 兜底降级：如果 nativeImage 加载失败，则读取原文件字节并判定 MIME 类型
            base64Data = readFileSync(file.path).toString("base64")
            const ext = file.name.split(".").pop()?.toLowerCase() || ""
            mimeType = "image/png"
            if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg"
            else if (ext === "gif") mimeType = "image/gif"
            else if (ext === "webp") mimeType = "image/webp"
            else if (ext === "svg") mimeType = "image/svg+xml"
            else if (ext === "avif") mimeType = "image/avif"
            else if (ext === "bmp") mimeType = "image/bmp"
          }

          contentArray.push({
            type: "image" as const,
            image: `data:${mimeType};base64,${base64Data}`,
          })
        } catch (err) {
          console.error(`Failed to read image for LLM: ${file.path}`, err)
        }
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
      return { type: "reasoning" as const, text: block.thinking }
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
 * LlmMessage → AI SDK ModelMessage。
 *
 * 字段名必须与 AI SDK ModelMessage schema 完全一致（zod 默认 strip 未知字段）：
 * - tool-call part 的参数字段为 `input`
 * - tool-result part 的 output 为 `{ type: "text", value }`
 */
export const toModelMessages = (messages: LlmMessage[]): ModelMessage[] => {
  const result: ModelMessage[] = []
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (message.role === "user") {
      result.push(convertUserMessage(message))
      continue
    }
    if (message.role === "assistant") {
      result.push(convertAssistantMessage(message))
      continue
    }

    // 收集连续 toolResult：先输出全部 tool 消息，再按段合并一条 user 图片消息。
    const group: ToolResultLlmMessage[] = []
    while (index < messages.length && messages[index].role === "toolResult") {
      group.push(messages[index] as ToolResultLlmMessage)
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

import type { ImageContent, TextContent } from "@shared/contracts/agent"
import type { ModelMessage } from "ai"
import { tool as aiTool } from "ai"
import type { AgentTool, LlmMessage } from "../core/types"

// 文本块内容拼接。
const blockText = (block: TextContent | ImageContent): string =>
  block.type === "text" ? block.text : `[image: ${block.mimeType}]`

// 将工具内容块序列化为模型可读文本。
const contentToText = (content: Array<TextContent | ImageContent>): string =>
  content.map(blockText).join("\n")

/**
 * LlmMessage → AI SDK ModelMessage。
 *
 * 字段名必须与 AI SDK ModelMessage schema 完全一致（zod 默认 strip 未知字段）：
 * - tool-call part 的参数字段为 `input`
 * - tool-result part 的 output 为 `{ type: "text", value }`
 */
export const toModelMessages = (messages: LlmMessage[]): ModelMessage[] =>
  messages.flatMap((message): ModelMessage[] => {
    switch (message.role) {
      case "user": {
        const content = Array.isArray(message.content)
          ? message.content.map((block) =>
              block.type === "image"
                ? { type: "image" as const, image: `data:${block.mimeType};base64,${block.data}` }
                : { type: "text" as const, text: block.text },
            )
          : message.content
        return [{ role: "user", content }] as ModelMessage[]
      }
      case "assistant": {
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
        return [{ role: "assistant", content: parts }] as ModelMessage[]
      }
      case "toolResult":
        // 工具错误已编码在内容文本中；isError 不映射到 AI SDK tool-result part。
        return [
          {
            role: "tool",
            content: [
              {
                type: "tool-result" as const,
                toolCallId: message.toolCallId,
                toolName: message.toolName,
                output: { type: "text" as const, value: contentToText(message.content) },
              },
            ],
          },
        ] as ModelMessage[]
    }
  })

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

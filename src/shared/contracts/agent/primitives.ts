// Agent 消息体系基础构件契约：内容块、停止原因与 token 用量。

import type { QuestionAnswer } from "./questions"

// 消息内容块：文本。
export interface TextContent {
  type: "text"
  text: string
  durationMs?: number
}

// 消息内容块：思考。
export interface ThinkingContent {
  type: "thinking"
  thinking: string
  // 思考签名（Anthropic thinking block signature，回传校验用）。
  signature?: string
  durationMs?: number
}

// 消息内容块：图片。
export interface ImageContent {
  type: "image"
  data: string
  mimeType: string
}

// 消息内容块：工具调用。
export interface ToolCall {
  type: "toolCall"
  id: string
  name: string
  arguments: Record<string, unknown>
  // question 工具的用户作答（执行完成时回填；随消息落库，供只读展示）。
  answers?: QuestionAnswer[]
}

// 模型停止原因。
export type StopReason = "pending" | "stop" | "length" | "toolUse" | "error" | "aborted"

// 模型调用 token 用量。
export interface Usage {
  input: number
  output: number
  // 缓存命中读取的输入 token（Anthropic cache_read_input_tokens）。
  cacheRead: number
  // 缓存创建写入的输入 token（Anthropic cache_creation_input_tokens；其他 provider 恒为 0）。
  cacheWrite: number
  totalTokens: number
}

// 压缩摘要生成调用的 token 用量（输入=发给压缩模型的上下文，输出=摘要输出）。
export interface CompactionUsage {
  input: number
  output: number
}

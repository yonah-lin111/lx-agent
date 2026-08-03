import type { AgentMessage } from "@shared/contracts/agent"

export type { AgentEvent, AgentMessage, ToolResultMessage } from "@shared/contracts/agent"

// 消息内容块渲染视图。
export type ChatBlock =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | {
      kind: "toolCall"
      toolCallId: string
      toolName: string
      args: Record<string, unknown>
      status: "running" | "done" | "error"
    }
  | { kind: "toolResult"; toolCallId: string; toolName: string; text: string; isError: boolean }

// 消息展示条目（由 AgentEvent 驱动生成）。
export interface ChatMessage {
  id: string
  role: AgentMessage["role"]
  blocks: ChatBlock[]
  isStreaming: boolean
  error?: string
}

// 预设提示词卡片。
export interface AgentPromptCard {
  id: string
  title: string
  description: string
  prompt: string
}

// 历史会话定义（消息存展示条目，恢复时转回 AgentMessage 发送给 main）。
export interface ChatSession {
  id: string
  title: string
  createdAt: number
  messages: ChatMessage[]
}

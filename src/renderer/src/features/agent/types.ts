import type { AgentDiff, AgentMessage } from "@shared/contracts/agent"

export type {
  AgentDiff,
  AgentDiffLine,
  AgentEvent,
  AgentMessage,
  DiffLinePart,
  ToolResultMessage,
} from "@shared/contracts/agent"

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
  | {
      kind: "toolResult"
      toolCallId: string
      toolName: string
      text: string
      isError: boolean
      diff?: AgentDiff
    }

// 消息展示条目（由 AgentEvent 驱动生成）。
export interface ChatMessage {
  id: string
  role: AgentMessage["role"]
  blocks: ChatBlock[]
  isStreaming: boolean
  // 原始消息时间戳（删除一轮对话时定位 DB entry 用）。
  timestamp?: number
  error?: string
}

// 预设提示词卡片。
export interface AgentPromptCard {
  id: string
  title: string
  description: string
  prompt: string
}

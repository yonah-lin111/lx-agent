import type { AgentDiff, AgentMessage, StopReason } from "@shared/contracts/agent"

export type {
  AgentDiff,
  AgentDiffLine,
  AgentEvent,
  AgentMessage,
  DiffLinePart,
  StopReason,
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
      // 工具执行中的实时进度文本（task 子代理流式回传；不落库）。
      progress?: string
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
  // 助手消息的停止原因（判断"继续生成"可用性）。
  stopReason?: StopReason
}

// 预设提示词卡片。
export interface AgentPromptCard {
  id: string
  title: string
  description: string
  prompt: string
}

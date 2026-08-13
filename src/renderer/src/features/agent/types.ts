import type {
  AgentDiff,
  AgentMessage,
  LspToolDetails,
  QuestionAnswer,
  QuestionRequest,
  StopReason,
  SubagentData,
} from "@shared/contracts/agent"

export type {
  AgentDiff,
  AgentDiffLine,
  AgentEvent,
  AgentMessage,
  DiffLinePart,
  LspToolDetails,
  QuestionAnswer,
  QuestionRequest,
  StopReason,
  SubagentData,
  SubagentStep,
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
      // 子代理面板数据（task 流式快照/落库重建；驱动弹窗与时间轴）。
      subagent?: SubagentData
      // 挂起的模型提问（question 工具；question_request 事件回填，作答后清除）。
      question?: QuestionRequest
      // question 工具的用户作答（随消息落库/事件回填，只读展示用）。
      answers?: QuestionAnswer[]
    }
  | {
      kind: "toolResult"
      toolCallId: string
      toolName: string
      text: string
      isError: boolean
      diff?: AgentDiff
      // 子代理面板数据（随 task 工具结果落库，恢复后重建弹窗）。
      subagent?: SubagentData
      // LSP 检索结果（随 lsp 工具结果落库，恢复后渲染块复用跳转）。
      lsp?: LspToolDetails
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

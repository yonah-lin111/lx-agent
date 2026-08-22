import type {
  AgentDiff,
  AgentMessage,
  CompactionUsage,
  LspToolDetails,
  QuestionAnswer,
  QuestionRequest,
  StopReason,
  SubagentData,
  Usage,
  UserMessageCommand,
} from "@shared/contracts/agent"

export type {
  AgentDiff,
  AgentDiffLine,
  AgentEvent,
  AgentMessage,
  AgentSendOptions,
  CompactionUsage,
  DiffLinePart,
  LspToolDetails,
  QuestionAnswer,
  QuestionRequest,
  StopReason,
  SubagentData,
  SubagentStep,
  ToolResultMessage,
  Usage,
  UserMessageCommand,
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
  files?: { name: string; path: string; type: "image" | "text" }[]
  // 原始消息时间戳（删除一轮对话时定位 DB entry 用）。
  timestamp?: number
  error?: string
  // 助手消息的停止原因（判断"继续生成"可用性）。
  stopReason?: StopReason
  // 是否为即时插话消息（steer 模式发送；列表展示微标签）。
  isSteer?: boolean
  // 指令来源元数据（Prompt 模板、Skill 或 Slash 命令）。
  command?: UserMessageCommand
  // 队列 drain 自动发送的 user 消息（流式中排队，run 结束后自动发送；列表据此跳过"用户发送→滚动到底"）。
  isQueuedDrain?: boolean
  // 上下文压缩 loading 占位（compaction_start 插入、同 compactionId 的 summary/failed 替换或移除）。
  isCompacting?: boolean
  // 单次压缩事件标识（只用于将 renderer 的 loading 占位与终态事件关联）。
  compactionId?: string
  // 压缩摘要是否手动触发（/compact）；手动摘要可被 /undo 撤销，自动不可。
  isManual?: boolean
  // 助手消息的 token 用量（本轮 QA 底部展示；user/toolResult 无此字段）。
  usage?: Usage
  // 压缩摘要消息的 token 用量（compactionSummary 专用：发给压缩模型的输入与摘要输出）。
  compactionUsage?: CompactionUsage
  // 压缩摘要本身的估计 token 数（compactionSummary 专用，压缩后上下文规模）。
  summaryTokens?: number
  // 助手消息的模型信息（气泡外模型名展示；user/toolResult 无此字段）。
  model?: string
  provider?: string
}

// 预设提示词卡片。
export interface AgentPromptCard {
  id: string
  title: string
  description: string
  prompt: string
}

// 执行步骤类型。
export type ExecutionStepKind =
  | "system"
  | "user"
  | "thinking"
  | "tool"
  | "subagent"
  | "compaction"
  | "assistant"
  | "error"

// 执行步骤状态。
export type ExecutionStepStatus = "running" | "done" | "error"

// 单个执行步骤条目（用于 AgentExecutionFlowList 展示完整执行日志与流程）。
export interface ExecutionStep {
  // 步骤全局唯一 ID。
  id: string
  // 所属轮次（从 0 开始；0 为系统级/初始化，1 及以上为用户交互轮次）。
  turnIndex: number
  // 步骤在当前会话的全局序号（从 1 开始）。
  stepIndex: number
  // 步骤类型。
  kind: ExecutionStepKind
  // 步骤标题/摘要（如工具名、思考概览、用户问题）。
  title: string
  // 步骤副标题/辅助说明。
  subtitle?: string
  // 步骤状态。
  status: ExecutionStepStatus
  // 产生时间戳。
  timestamp?: number
  // 单步 Token 用量。
  tokens?: {
    input?: number
    output?: number
    cacheRead?: number
    total?: number
  }
  // 系统提示词与注入配置内容。
  systemContent?: {
    sections: { name: string; text: string }[]
    contexts: { name: string; text: string }[]
    variables: Record<string, string | undefined>
    activeTools?: string[]
    rendered: string
  }
  // 用户输入内容。
  userContent?: {
    text: string
    files?: { name: string; path: string; type: "image" | "text" }[]
    command?: UserMessageCommand
    isSteer?: boolean
  }
  // 思考内容。
  thinkingContent?: {
    text: string
  }
  // 工具调用及返回内容。
  toolContent?: {
    toolName: string
    toolCallId?: string
    args: Record<string, unknown>
    result?: string
    isError?: boolean
    diff?: AgentDiff
    lsp?: LspToolDetails
  }
  // 子代理执行内容。
  subagentContent?: {
    name: string
    subagent?: SubagentData
  }
  // 压缩内容。
  compactionContent?: {
    isManual?: boolean
    compactionUsage?: CompactionUsage
    summaryTokens?: number
  }
  // 助手最终回复内容。
  assistantContent?: {
    text: string
    model?: string
    provider?: string
    stopReason?: StopReason
    usage?: Usage
  }
  // 异常/中断说明内容。
  errorContent?: {
    message?: string
    stopReason?: StopReason
    isAborted?: boolean
  }
}

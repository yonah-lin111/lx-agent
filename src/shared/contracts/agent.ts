import type { ModelSelection } from "@shared/settings"

// 消息内容块：文本。
export interface TextContent {
  type: "text"
  text: string
}

// 消息内容块：思考。
export interface ThinkingContent {
  type: "thinking"
  thinking: string
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
}

// 模型停止原因。
export type StopReason = "pending" | "stop" | "length" | "toolUse" | "error" | "aborted"

// 模型调用 token 用量。
export interface Usage {
  input: number
  output: number
  totalTokens: number
}

// 用户消息。
export interface UserMessage {
  role: "user"
  content: string | (TextContent | ImageContent)[]
  timestamp: number
}

// 助手消息。
export interface AssistantMessage {
  role: "assistant"
  content: (TextContent | ThinkingContent | ToolCall)[]
  provider: string
  model: string
  usage: Usage
  stopReason: StopReason
  errorMessage?: string
  timestamp: number
}

// 词级 diff 片段：文本 + 是否变更（变更片段渲染为逆色高亮）。
export interface DiffLinePart {
  text: string
  // 是否变更 token（渲染为逆色高亮）。
  changed: boolean
}

// diff 展示行。
export interface AgentDiffLine {
  type: "context" | "add" | "del"
  // 旧文件行号（context/del 行）。
  oldLine?: number
  // 新文件行号（context/add 行）。
  newLine?: number
  // 行内容。
  text: string
  // 单行替换的词级高亮片段（仅 add/del 行，纯渲染用）。
  parts?: DiffLinePart[]
}

// 结构化 diff 负载（edit/write 工具的展示副产品，随 ToolResultMessage 落库）。
export interface AgentDiff {
  // 被修改的文件路径（旧消息可能缺失，渲染端需容错）。
  fileName?: string
  lines: AgentDiffLine[]
  // 是否因变更行数超限截断（渲染端显示提示条）。
  truncated: boolean
  // 变更统计（全量，不受截断影响）。
  stats: {
    added: number
    removed: number
  }
}

// 工具结果消息。
export interface ToolResultMessage {
  role: "toolResult"
  toolCallId: string
  toolName: string
  content: (TextContent | ImageContent)[]
  isError: boolean
  timestamp: number
  // 工具执行的可视化 diff（edit/write 工具产物，供渲染与落库）。
  diff?: AgentDiff
}

// Agent 消息联合类型。
export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage

// 建议问题生成请求的对话上下文消息。
export interface SuggestedQuestionContextMessage {
  role: "user" | "assistant"
  content: string
}

// 助手消息流式增量事件。
export type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_start"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "thinking_start"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "toolcall_start"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
  | { type: "done"; reason: StopReason; message: AssistantMessage }
  | { type: "error"; reason: StopReason; error: AssistantMessage }

// Agent 运行生命周期事件（main → renderer 的唯一流式负载）。
export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | {
      type: "tool_execution_update"
      toolCallId: string
      toolName: string
      args: unknown
      partialResult: unknown
    }
  | {
      type: "tool_execution_end"
      toolCallId: string
      toolName: string
      result: unknown
      isError: boolean
    }
  | { type: "mcp_status_changed"; servers: McpServerStatusItem[] }
  | { type: "session_title"; sessionId: string; title: string | null }

// 会话归属上下文（发送消息时声明；决定会话建在哪个桶内）。
export interface AgentSendContext {
  projectItemId?: string // 项目 item 会话归属
  projectId?: string // 冗余：项目 id（聚合某项目全部 item 会话）
  page?: string // 非 item 会话的路由（'/' | '/project' | '/settings' …）
  cwd?: string // 工具执行目录（项目页 = project.path；独立页可省略，回退主目录）
}

// 会话能力快照（随会话冻结）。
export interface AgentCapabilitySnapshot {
  tools: string[]
  mcp: string[]
  skills: string[]
}

// MCP server 连接状态（全局状态 icon 展示）。
export interface McpServerStatusItem {
  name: string
  status: "connected" | "disabled" | "failed"
}

// 会话摘要（历史列表展示，不含消息体）。
export interface AgentSessionSummary {
  id: string
  title: string
  cwd: string
  // 所属项目（历史面板项目 tag 客户端筛选用；独立页会话为 null）。
  projectId: string | null
  createdAt: string
  updatedAt: string
}

// 恢复的会话内容。
export interface AgentRestoredSession {
  messages: AgentMessage[]
  activeCapabilities: AgentCapabilitySnapshot
}

// 发送对话请求的返回结果；ok 时携带落库会话 id（首条消息才真正入库）。
export type AgentSendResult = { ok: true; sessionId: string } | { ok: false; error: string }

// 渲染进程可调用的 Agent IPC 接口。
export interface AgentApi {
  agent: {
    send: (
      text: string,
      selection?: ModelSelection,
      context?: AgentSendContext,
    ) => Promise<AgentSendResult>
    abort: () => Promise<void>
    restore: (messages: AgentMessage[]) => Promise<void>
    listSessions: () => Promise<AgentSessionSummary[]>
    restoreSession: (sessionId: string) => Promise<AgentRestoredSession>
    renameSession: (sessionId: string, title: string) => Promise<void>
    deleteSession: (sessionId: string) => Promise<void>
    // 删除一轮对话：以该轮用户消息的 timestamp 定位（问题 + 回答 + 工具调用级联删除）。
    deleteMessageTurn: (sessionId: string, userMessageTimestamp: number) => Promise<void>
    // 获取全部 MCP server 的连接状态。
    getMcpStatus: () => Promise<McpServerStatusItem[]>
    // 为最后一条 AI 回答生成后续建议问题。
    suggestedQuestions: (
      messages: SuggestedQuestionContextMessage[],
      excludedQuestions?: string[],
    ) => Promise<string[]>
    onEvent: (handler: (event: AgentEvent) => void) => () => void
  }
}

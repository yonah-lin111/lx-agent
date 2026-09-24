// Agent 流式事件契约：助手消息增量与运行生命周期事件。

import type {
  AgentMessage,
  AssistantMessage,
  CollaborationModeSwitchMessage,
  CompactionSummaryMessage,
  ModelSwitchMessage,
} from "./messages"
import type { CollaborationMode, PermissionRequest } from "./permissions"
import type { StopReason, ToolCall } from "./primitives"
import type { QuestionRequest } from "./questions"
import type { JobId, JobSnapshot, McpServerStatusItem } from "./runtime"
import type { TodoList } from "./todos"
import type { ToolResultMessage } from "./tools"

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

// Agent 运行生命周期事件（main → renderer 的唯一流式负载，支持多会话/多 Tab 路由）。
export type AgentEvent =
  | { type: "agent_start"; sessionId?: string; tabId?: string }
  | { type: "agent_end"; sessionId?: string; tabId?: string; messages: AgentMessage[] }
  | { type: "turn_start"; sessionId?: string; tabId?: string }
  | {
      type: "turn_end"
      sessionId?: string
      tabId?: string
      message: AgentMessage
      toolResults: ToolResultMessage[]
    }
  | { type: "message_start"; sessionId?: string; tabId?: string; message: AgentMessage }
  | {
      type: "message_update"
      sessionId?: string
      tabId?: string
      message: AgentMessage
      assistantMessageEvent: AssistantMessageEvent
    }
  | { type: "message_end"; sessionId?: string; tabId?: string; message: AgentMessage }
  | {
      type: "tool_execution_start"
      sessionId?: string
      tabId?: string
      toolCallId: string
      toolName: string
      args: unknown
    }
  | {
      type: "tool_execution_update"
      sessionId?: string
      tabId?: string
      toolCallId: string
      toolName: string
      args: unknown
      partialResult: unknown
    }
  | {
      type: "tool_execution_end"
      sessionId?: string
      tabId?: string
      toolCallId: string
      toolName: string
      result: unknown
      isError: boolean
      durationMs?: number
    }
  | {
      type: "mcp_status_changed"
      sessionId?: string
      tabId?: string
      servers: McpServerStatusItem[]
    }
  | {
      type: "collaboration_mode_changed"
      sessionId?: string
      tabId?: string
      // 基础模式（用户选择；auto = 编排模式）。
      mode: CollaborationMode
      // 有效模式（auto 下模型切出的受约束态；非 auto 恒等于 mode）。
      effectiveMode: CollaborationMode
      // 模式切换历史条目（会话尾部连续切换时原地更新，renderer 直接保证不刷屏）。
      message?: CollaborationModeSwitchMessage
    }
  | { type: "session_title"; sessionId: string; tabId?: string; title: string | null }
  | { type: "permission_request"; sessionId?: string; tabId?: string; request: PermissionRequest }
  | { type: "question_request"; sessionId?: string; tabId?: string; request: QuestionRequest }
  // 上下文压缩完成：同一次压缩以 compactionId 关联 loading 占位与可见摘要（摘要不落 message entry）。
  | {
      type: "compaction_summary"
      sessionId?: string
      tabId?: string
      compactionId: string
      message: CompactionSummaryMessage
    }
  // 上下文压缩开始（摘要生成进行中，耗时数秒）：renderer 追加对应 loading 占位并禁止发送。
  | {
      type: "compaction_start"
      sessionId?: string
      tabId?: string
      compactionId: string
      manual: boolean
      model?: string
    }
  // 上下文压缩失败（摘要生成失败/超时）：renderer 仅移除对应 loading 占位并恢复发送。
  | {
      type: "compaction_failed"
      sessionId?: string
      tabId?: string
      compactionId: string
      manual: boolean
    }
  // 上下文容量快照：当前会话估计 token 与压缩窗口（agent_end / 压缩 / 删除 / 恢复后推送，驱动状态栏百分比）。
  | {
      type: "context_usage"
      sessionId?: string
      tabId?: string
      tokens: number
      contextWindow: number
    }
  // 任务清单更新：模型经 todowrite 整表替换（renderer 驱动状态栏 todo 指示；不落 message entry）。
  | { type: "todo_updated"; sessionId?: string; tabId?: string; todos: TodoList }
  // 排队消息计数与内容变化（入队/每条出队/清空时推送；renderer 订阅维护权威计数，messages 供 tooltip 展示）。
  | {
      type: "queue_changed"
      sessionId?: string
      tabId?: string
      length: number
      messages: string[]
    }
  // 模型切换/初始模型广播事件
  | { type: "model_switch"; sessionId?: string; tabId?: string; message: ModelSwitchMessage }
  // 后台长任务生命周期事件（JobRegistry 驱动，支持抽屉与状态指示器实时刷新）。
  | { type: "job_started"; sessionId?: string; tabId?: string; job: JobSnapshot }
  | { type: "job_output_chunk"; sessionId?: string; tabId?: string; jobId: JobId; chunk: string }
  | { type: "job_settled"; sessionId?: string; tabId?: string; job: JobSnapshot }

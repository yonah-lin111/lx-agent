import type {
  AgentMessage,
  AgentSendContext,
  CollaborationMode,
  TodoList,
} from "@shared/contracts/agent"
import type { Dispatch, RefObject, SetStateAction } from "react"
import type { useLxAgentToast } from "@/components/ui/LxToast"
import type { AgentInputFile } from "@/features/agent/components/AgentInput"
import type { ToolCallPatch } from "@/features/agent/hooks/agentChatStreamUtils"
import type { ChatMessage } from "@/features/agent/types"
import type { I18nContextType } from "@/i18n"

// 消息提示操作子集（派生自 useLxAgentToast，引用稳定）。
export type AgentChatToasts = Pick<
  ReturnType<typeof useLxAgentToast>,
  "success" | "error" | "warning"
>

// 当前会话上下文容量。
export interface AgentChatContextUsage {
  tokens: number
  contextWindow: number
}

/**
 * Agent 对话共享核心：全部状态、setter、refs 与外部依赖，由协调层维护并逐次渲染注入子 Hook。
 */
export interface AgentChatCore {
  // 当前 Tab id（多 Tab 事件路由与持久化隔离）。
  tabId?: string
  // 初始会话 id（首屏自动恢复）。
  initialSessionId?: string | null
  // 会话绑定完成回调。
  onSessionBound?: (sessionId: string) => void
  // 发送上下文（项目、工作区等）。
  context?: AgentSendContext
  // 消息提示操作。
  toasts: AgentChatToasts
  // 国际化翻译函数。
  t: I18nContextType["t"]
  // 当前会话 id。
  currentSessionId: string | null
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>
  currentSessionIdRef: RefObject<string | null>
  // 展示消息列表。
  messages: ChatMessage[]
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  messagesRef: RefObject<ChatMessage[]>
  // 输入框内容。
  inputText: string
  setInputText: Dispatch<SetStateAction<string>>
  // 输入框附件。
  selectedFiles: AgentInputFile[]
  setSelectedFiles: Dispatch<SetStateAction<AgentInputFile[]>>
  // 流式生成中。
  isStreaming: boolean
  setIsStreaming: Dispatch<SetStateAction<boolean>>
  // 排队消息计数与原文。
  queuedCount: number
  setQueuedCount: Dispatch<SetStateAction<number>>
  queuedMessages: string[]
  setQueuedMessages: Dispatch<SetStateAction<string[]>>
  // 历史会话恢复中（骨架屏）。
  isRestoring: boolean
  setIsRestoring: Dispatch<SetStateAction<boolean>>
  // 上下文压缩中；是否为手动触发。
  isCompacting: boolean
  setIsCompacting: Dispatch<SetStateAction<boolean>>
  isCompactingManual: boolean
  setIsCompactingManual: Dispatch<SetStateAction<boolean>>
  // 任务清单。
  todos: TodoList
  setTodos: Dispatch<SetStateAction<TodoList>>
  // 协作模式。
  collaborationMode: CollaborationMode
  setCollaborationMode: Dispatch<SetStateAction<CollaborationMode>>
  // 上下文容量快照。
  contextUsage: AgentChatContextUsage | null
  setContextUsage: Dispatch<SetStateAction<AgentChatContextUsage | null>>
  // 当前流式条目引用（message_update 定位）。
  streamingRef: RefObject<ChatMessage | null>
  // 队列 drain 标记（递减时下一条 user 消息为自动发送）。
  drainIncomingRef: RefObject<boolean>
  // 上一次队列长度（判定递减）。
  prevQueueLengthRef: RefObject<number>
  // 进行中的压缩事件集合（终态事件仅结束同 compactionId 的压缩）。
  activeCompactionIdsRef: RefObject<Set<string>>
}

/**
 * 流式按帧合并域对外能力。
 */
export interface AgentChatFrames {
  patchToolCallBlocks: (patches: Map<string, ToolCallPatch>) => void
  updateToolStatus: (toolCallId: string, status: "running" | "done" | "error") => void
  commitPendingStreamUpdates: () => void
  requestStreamFlush: () => void
  discardPendingStreamUpdates: () => void
  flushFrameRef: RefObject<number | null>
  pendingMessageUpdateRef: RefObject<AgentMessage | null>
  pendingToolUpdatesRef: RefObject<Map<string, unknown>>
}

import type { AgentSendContext, CollaborationMode, TodoList } from "@shared/contracts/agent"
import { useEffect, useMemo, useRef, useState } from "react"
import { useLxAgentToast } from "@/components/ui/LxToast"
import type { AgentInputFile } from "@/features/agent/components/AgentInput"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import type {
  AgentChatContextUsage,
  AgentChatCore,
} from "@/features/agent/hooks/useAgentChat.types"
import { useAgentChatCollaboration } from "@/features/agent/hooks/useAgentChatCollaboration"
import { useAgentChatEvents } from "@/features/agent/hooks/useAgentChatEvents"
import { useAgentChatFrames } from "@/features/agent/hooks/useAgentChatFrames"
import { useAgentChatRestore } from "@/features/agent/hooks/useAgentChatRestore"
import { useAgentChatSend } from "@/features/agent/hooks/useAgentChatSend"
import { useAgentChatTurns } from "@/features/agent/hooks/useAgentChatTurns"
import type { ChatMessage } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

/**
 * 管理 Agent 对话：订阅 main 进程事件流，驱动消息列表、流式更新与工具状态。
 * 历史会话的持久化与恢复均由 main 进程 DB 承载。支持多 Tab 实例隔离与精准事件路由。
 */
export const useAgentChat = (
  context?: AgentSendContext,
  tabId?: string,
  initialSessionId?: string | null,
  onSessionBound?: (sessionId: string) => void,
) => {
  const { success, error, warning } = useLxAgentToast()
  const { t } = useTranslation()
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId ?? null)
  const currentSessionIdRef = useRef<string | null>(currentSessionId)
  currentSessionIdRef.current = currentSessionId
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<AgentInputFile[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  // 同步当前 Tab 的流式运行状态与对话轮数至 agentTabStore，供顶部 Tab 栏展示。
  useEffect(() => {
    if (tabId) {
      agentTabStore.setTabStreaming(tabId, isStreaming)
    }
    return () => {
      if (tabId) {
        agentTabStore.setTabStreaming(tabId, false)
      }
    }
  }, [tabId, isStreaming])

  const userTurns = useMemo(() => messages.filter((m) => m.role === "user").length, [messages])
  useEffect(() => {
    if (tabId) {
      agentTabStore.setTabTurnCount(tabId, userTurns)
    }
  }, [tabId, userTurns])

  // 排队消息计数（流式输出期间发送的消息；订阅 queue_changed 维护权威值）。
  const [queuedCount, setQueuedCount] = useState(0)
  // 排队消息原文（queue_changed 携带；输入区排队提示条 tooltip 展示）。
  const [queuedMessages, setQueuedMessages] = useState<string[]>([])
  // 历史会话恢复是否进行中（驱动消息列表骨架屏）。
  const [isRestoring, setIsRestoring] = useState(false)
  // 上下文压缩进行中（compaction_start/failed/summary 事件驱动；期间禁止发送消息）。
  const [isCompacting, setIsCompacting] = useState(false)
  // 上下文压缩是否为手动触发（/compact），驱动 UI 文案区分。
  const [isCompactingManual, setIsCompactingManual] = useState(false)
  // 任务清单（状态栏 todo 指示数据源：订阅 todo_updated / 恢复时提取；空数组 = 指示不渲染）。
  const [todos, setTodos] = useState<TodoList>([])
  // 当前协作模式（订阅 collaboration_mode_changed 事件同步；默认为 build）。
  const [collaborationMode, setCollaborationMode] = useState<CollaborationMode>("build")
  // 当前会话上下文容量（订阅 context_usage：估计 token / 压缩窗口，驱动状态栏百分比）。
  const [contextUsage, setContextUsage] = useState<AgentChatContextUsage | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  // 当前流式条目引用（message_update 定位）。
  const streamingRef = useRef<ChatMessage | null>(null)
  // 队列计数递减（一条消息出队）→ 下一条 user 消息即队列 drain 的自动发送（抑制滚动）。
  const drainIncomingRef = useRef(false)
  const prevQueueLengthRef = useRef(0)
  // 进行中的压缩事件集合：终态事件仅结束同 compactionId 的压缩，避免陈旧事件错误解锁输入。
  const activeCompactionIdsRef = useRef(new Set<string>())

  // 共享核心：子 Hook 在回调执行时读取最新状态与 refs。
  const core: AgentChatCore = {
    tabId,
    initialSessionId,
    onSessionBound,
    context,
    toasts: { success, error, warning },
    t,
    currentSessionId,
    setCurrentSessionId,
    currentSessionIdRef,
    messages,
    setMessages,
    messagesRef,
    inputText,
    setInputText,
    selectedFiles,
    setSelectedFiles,
    isStreaming,
    setIsStreaming,
    queuedCount,
    setQueuedCount,
    queuedMessages,
    setQueuedMessages,
    isRestoring,
    setIsRestoring,
    isCompacting,
    setIsCompacting,
    isCompactingManual,
    setIsCompactingManual,
    todos,
    setTodos,
    collaborationMode,
    setCollaborationMode,
    contextUsage,
    setContextUsage,
    streamingRef,
    drainIncomingRef,
    prevQueueLengthRef,
    activeCompactionIdsRef,
  }

  const frames = useAgentChatFrames({ core })
  useAgentChatEvents({ core, frames })
  const { stopStreaming, createNewChat, undoLastTurn, compactChat, deleteTurn } = useAgentChatTurns(
    {
      core,
      frames,
    },
  )
  const { restoreChat } = useAgentChatRestore({ core, stopStreaming })
  const { sendMessage, continueChat, canContinue, editMessage } = useAgentChatSend({ core })
  const {
    toggleCollaborationMode,
    acceptAndExecutePlan,
    acceptAndExecuteReviewFixes,
    refreshContextUsage,
    switchModel,
    isOnlyOneTurnLeft,
  } = useAgentChatCollaboration({ core, sendMessage })

  return {
    messages,
    todos,
    collaborationMode,
    toggleCollaborationMode,
    queuedCount,
    queuedMessages,
    contextUsage,
    inputText,
    setInputText,
    selectedFiles,
    setSelectedFiles,
    isStreaming,
    isCompacting,
    isCompactingManual,
    isRestoring,
    sendMessage,
    continueChat,
    canContinue,
    stopStreaming,
    createNewChat,
    undoLastTurn,
    isOnlyOneTurnLeft,
    compactChat,
    deleteTurn,
    restoreChat,
    editMessage,
    refreshContextUsage,
    switchModel,
    acceptAndExecutePlan,
    acceptAndExecuteReviewFixes,
    currentSessionId,
  }
}

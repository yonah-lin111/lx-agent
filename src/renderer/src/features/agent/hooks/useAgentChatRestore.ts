import { useCallback, useEffect, useRef } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import {
  createChatMessageId,
  mergeSubagentSnapshots,
} from "@/features/agent/hooks/agentChatStreamUtils"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import type { AgentChatCore } from "@/features/agent/hooks/useAgentChat.types"
import { toChatMessage } from "@/features/agent/utils"

/**
 * 会话恢复域：从 main 进程 DB 读取历史会话并加载到上下文与展示。
 */
export const useAgentChatRestore = ({
  core,
  stopStreaming,
}: {
  core: Pick<
    AgentChatCore,
    | "tabId"
    | "initialSessionId"
    | "onSessionBound"
    | "activeCompactionIdsRef"
    | "setMessages"
    | "setTodos"
    | "setInputText"
    | "setIsRestoring"
    | "setCurrentSessionId"
    | "setIsCompacting"
    | "setIsCompactingManual"
  >
  stopStreaming: () => void
}) => {
  const { tabId, initialSessionId, onSessionBound } = core
  const {
    activeCompactionIdsRef,
    setMessages,
    setTodos,
    setInputText,
    setIsRestoring,
    setCurrentSessionId,
    setIsCompacting,
    setIsCompactingManual,
  } = core

  // 恢复指定历史会话：从 main 进程 DB 读取并加载到上下文与展示。恢复期间展示骨架屏。
  const restoreChat = useCallback(
    (sessionId: string) => {
      stopStreaming()
      activeCompactionIdsRef.current.clear()
      setIsCompacting(false)
      setIsCompactingManual(false)
      setIsRestoring(true)
      setCurrentSessionId(sessionId)
      if (tabId) {
        agentTabStore.setTabSessionId(tabId, sessionId)
      }
      onSessionBound?.(sessionId)
      void agentApi
        .restoreSession(sessionId, tabId)
        .then((restored) => {
          const chatMessages = restored.messages.map((message) =>
            toChatMessage(message, false, createChatMessageId()),
          )
          setMessages(mergeSubagentSnapshots(chatMessages))
          setTodos(restored.todos ?? [])
          setInputText("")
        })
        .catch(() => {
          // 会话已不存在等错误：保持当前展示，不做额外处理。
        })
        .finally(() => {
          setIsRestoring(false)
        })
    },
    [stopStreaming, tabId, onSessionBound],
  )

  // 页面加载/刷新时，如果指定了 initialSessionId 且尚未恢复消息，自动执行 restoreChat 恢复历史
  const initialRestoredRef = useRef(false)
  const restoreChatRef = useRef(restoreChat)
  restoreChatRef.current = restoreChat

  useEffect(() => {
    if (!initialRestoredRef.current) {
      initialRestoredRef.current = true
      if (initialSessionId) {
        restoreChatRef.current(initialSessionId)
      }
    }
  }, [initialSessionId])

  return { restoreChat }
}

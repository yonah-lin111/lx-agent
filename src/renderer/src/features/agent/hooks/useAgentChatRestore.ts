import { useCallback, useEffect, useRef } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import {
  createChatMessageId,
  mergeSubagentSnapshots,
} from "@/features/agent/hooks/agentChatStreamUtils"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import type { AgentChatCore } from "@/features/agent/hooks/useAgentChat.types"
import { toChatMessage } from "@/features/agent/utils"
import { synthesizeDesignUpdate } from "@/features/agent/utils/designSynthesizer"

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
            toChatMessage(message, false, createChatMessageId(), sessionId),
          )
          setMessages(mergeSubagentSnapshots(chatMessages))
          setTodos(restored.todos ?? [])
          setInputText("")

          // 全量水合历史会话中的前端设计原型到 frontDesignStore。
          // 历史消息里的 parent_id 可能来自上一次运行的临时 id（已漂移），此时回落到同会话版本链头，
          // 避免同一设计的版本被拆成多个独立根节点。
          let lineageHeadId: string | null = null
          for (const msg of chatMessages) {
            for (const block of msg.blocks) {
              if (block.kind !== "frontDesign") continue

              const declaredParentId = block.design.parentId ?? null
              const parentDesign =
                (declaredParentId ? frontDesignStore.getDesign(declaredParentId) : null) ??
                (lineageHeadId ? frontDesignStore.getDesign(lineageHeadId) : null)

              if (block.design.isUpdate && parentDesign && block.design.target) {
                const synth = synthesizeDesignUpdate(
                  parentDesign.html,
                  block.design.target,
                  block.design.html,
                  block.design.action,
                )
                if (synth.ok && synth.synthesizedHtml) {
                  frontDesignStore.registerDesign({
                    id: block.design.id,
                    parentId: parentDesign.id,
                    title: block.design.title,
                    html: synth.synthesizedHtml,
                    isStreaming: false,
                    sessionId,
                    updatedAt: msg.timestamp,
                    mode: block.design.mode,
                    designDir: block.design.designDir,
                  })
                  lineageHeadId = block.design.id
                  continue
                }
              }

              frontDesignStore.registerDesign({
                id: block.design.id,
                parentId: parentDesign ? parentDesign.id : block.design.parentId,
                title: block.design.title,
                html: block.design.html,
                isStreaming: false,
                autoActivate: true,
                sessionId,
                updatedAt: msg.timestamp,
                mode: block.design.mode,
                designDir: block.design.designDir,
              })
              lineageHeadId = block.design.id
            }
          }
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

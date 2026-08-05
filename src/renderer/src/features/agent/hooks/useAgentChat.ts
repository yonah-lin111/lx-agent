import type { AgentEvent, AgentSendContext } from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { useCallback, useEffect, useRef, useState } from "react"
import { agentApi } from "../api/agentApi"
import type { ChatMessage } from "../types"
import { toAgentMessages, toChatMessage } from "../utils"
import { sessionListStore, toSessionFilter } from "./sessionListStore"

// 展示条目 id 自增。
let messageSequence = 0

/**
 * 管理 Agent 对话：订阅 main 进程事件流，驱动消息列表、流式更新与工具状态。
 * 历史会话的持久化与恢复均由 main 进程 DB 承载。
 */
export const useAgentChat = (context?: AgentSendContext) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  // 当前流式条目引用（message_update 定位）。
  const streamingRef = useRef<ChatMessage | null>(null)

  // 按 toolCallId 更新消息内工具块状态。
  const updateToolStatus = useCallback(
    (toolCallId: string, status: "running" | "done" | "error") => {
      setMessages((prev) =>
        prev.map((message) =>
          message.blocks.some(
            (block) => block.kind === "toolCall" && block.toolCallId === toolCallId,
          )
            ? {
                ...message,
                blocks: message.blocks.map((block) =>
                  block.kind === "toolCall" && block.toolCallId === toolCallId
                    ? { ...block, status }
                    : block,
                ),
              }
            : message,
        ),
      )
    },
    [],
  )

  // 分发 main 进程推送的 AgentEvent。
  const dispatchEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "agent_start":
          setIsStreaming(true)
          break

        case "agent_end":
          setIsStreaming(false)
          streamingRef.current = null
          break

        case "message_start": {
          const message = event.message
          const streaming = message.role === "assistant" && message.stopReason === "pending"
          const item = toChatMessage(message, streaming, `m${++messageSequence}`)
          if (streaming) {
            streamingRef.current = item
          }
          setMessages((prev) => [...prev, item])
          break
        }

        case "message_update": {
          const streaming = streamingRef.current
          if (!streaming) return
          const updated = toChatMessage(event.message, true, streaming.id)
          updated.isStreaming = true
          streamingRef.current = updated
          setMessages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
          break
        }

        case "message_end": {
          const streaming = streamingRef.current
          if (!streaming) return
          const final = toChatMessage(event.message, false, streaming.id)
          streamingRef.current = null
          setMessages((prev) => prev.map((item) => (item.id === final.id ? final : item)))
          break
        }

        case "tool_execution_start":
          updateToolStatus(event.toolCallId, "running")
          break

        case "tool_execution_end":
          updateToolStatus(event.toolCallId, event.isError ? "error" : "done")
          break

        default:
          break
      }
    },
    [updateToolStatus],
  )

  // 挂载时订阅事件流；卸载时退订。
  useEffect(() => {
    const unsubscribe = agentApi.onEvent(dispatchEvent)
    return unsubscribe
  }, [dispatchEvent])

  // 停止流式生成：中止 main 侧 run。
  const stopStreaming = useCallback(() => {
    void agentApi.abort()
    setIsStreaming(false)
    streamingRef.current = null
  }, [])

  // 新建/重置对话：脱离当前会话并清空 main 侧上下文。
  const createNewChat = useCallback(() => {
    stopStreaming()
    setMessages([])
    setInputText("")
    sessionListStore.setCurrentSessionId(null)
    void agentApi.restore([])
  }, [stopStreaming])

  // 删除一轮对话：移除该轮（问题 + 回答 + 工具调用）并同步 main 侧上下文与 DB。
  // 未命中 DB 用户消息 timestamp（幽灵消息）时仅做本地移除。
  const removeTurn = useCallback(
    (userIndex: number): void => {
      const list = messagesRef.current
      const userTimestamp = list[userIndex]?.timestamp
      let nextUserIndex = list.length
      for (let index = userIndex + 1; index < list.length; index++) {
        if (list[index].role === "user") {
          nextUserIndex = index
          break
        }
      }
      const nextMessages = [...list.slice(0, userIndex), ...list.slice(nextUserIndex)]
      setMessages(nextMessages)
      void agentApi.restore(toAgentMessages(nextMessages))
      const sessionId = sessionListStore.getCurrentSessionId()
      if (sessionId && typeof userTimestamp === "number") {
        // 落库成功后再刷新列表，避免读到删除前的旧会话。
        void agentApi
          .deleteMessageTurn(sessionId, userTimestamp)
          .then(() => {
            const filter = toSessionFilter(context)
            if (filter) void sessionListStore.refresh(filter)
          })
          .catch(() => {
            // 写库失败为尽力而为：本地已移除，DB 仅多留一轮。
          })
      }
      if (nextMessages.length === 0) {
        sessionListStore.setCurrentSessionId(null)
      }
    },
    [context],
  )

  // 撤销上一轮对话：删除最近一轮（含问题/回答/工具调用）并同步 main 侧与 DB。
  const undoLastTurn = useCallback(() => {
    if (isStreaming) return
    const lastUserIndex = messagesRef.current.findLastIndex((message) => message.role === "user")
    if (lastUserIndex < 0) return
    setInputText("")
    removeTurn(lastUserIndex)
  }, [isStreaming, removeTurn])

  // 删除指定 AI 消息所在的一轮对话。
  const deleteTurn = useCallback(
    (aiMessageId: string) => {
      if (isStreaming) return
      const list = messagesRef.current
      const aiIndex = list.findIndex((message) => message.id === aiMessageId)
      if (aiIndex < 0) return
      const userIndex = list.findLastIndex(
        (message, index) => index < aiIndex && message.role === "user",
      )
      if (userIndex < 0) return
      removeTurn(userIndex)
    },
    [isStreaming, removeTurn],
  )

  // 恢复指定历史会话：从 main 进程 DB 读取并加载到上下文与展示。
  const restoreChat = useCallback(
    (sessionId: string) => {
      stopStreaming()
      void agentApi
        .restoreSession(sessionId)
        .then((restored) => {
          setMessages(
            restored.messages.map((message) =>
              toChatMessage(message, false, `m${++messageSequence}`),
            ),
          )
          setInputText("")
          sessionListStore.setCurrentSessionId(sessionId)
        })
        .catch(() => {
          // 会话已不存在等错误：保持当前展示，不做额外处理。
        })
    },
    [stopStreaming],
  )

  // 发送消息：main 进程驱动 Agent 运行，消息由事件流回推渲染。
  const sendMessage = useCallback(
    (contentToSend?: string, selection?: ModelSelection) => {
      const text = (contentToSend ?? inputText).trim()
      if (!text || isStreaming) return
      setInputText("")
      void agentApi.send(text, selection, context).then((result) => {
        if (result.ok) {
          sessionListStore.setCurrentSessionId(result.sessionId)
          const filter = toSessionFilter(context)
          if (filter) void sessionListStore.refresh(filter)
        }
      })
    },
    [inputText, isStreaming, context],
  )

  // 编辑已发送的消息内容（仅影响显示，不改变 main 侧上下文）。
  const editMessage = useCallback((id: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === id
          ? {
              ...message,
              blocks: message.blocks.map((block) =>
                block.kind === "text" ? { ...block, text: newContent } : block,
              ),
            }
          : message,
      ),
    )
  }, [])

  return {
    messages,
    inputText,
    setInputText,
    isStreaming,
    sendMessage,
    stopStreaming,
    createNewChat,
    undoLastTurn,
    deleteTurn,
    restoreChat,
    editMessage,
  }
}

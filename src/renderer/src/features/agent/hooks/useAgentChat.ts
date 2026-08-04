import type { AgentEvent } from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { agentApi } from "../api/agentApi"
import type { ChatMessage, ChatSession } from "../types"
import { toAgentMessages, toChatMessage } from "../utils"
import { chatHistoryStore } from "./chatHistoryStore"

// 展示条目 id 自增。
let messageSequence = 0

/**
 * 管理 Agent 对话：订阅 main 进程事件流，驱动消息列表、流式更新与工具状态。
 */
export const useAgentChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  // 当前流式条目引用（message_update 定位）。
  const streamingRef = useRef<ChatMessage | null>(null)

  // 订阅模块级历史会话列表。
  const chatSessions = useSyncExternalStore<ChatSession[]>(
    chatHistoryStore.subscribe,
    chatHistoryStore.getSessions,
  )

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

  // 新建/重置对话：先把当前对话存入历史，再清空 main 侧上下文。
  const createNewChat = useCallback(() => {
    stopStreaming()
    chatHistoryStore.saveSession(messagesRef.current)
    chatHistoryStore.setCurrentSessionId(null)
    setMessages([])
    setInputText("")
    void agentApi.restore([])
  }, [stopStreaming])

  // 恢复指定历史会话：先保存当前对话，再加载目标会话到 main 侧上下文。
  const restoreChat = useCallback(
    (sessionId: string) => {
      const session = chatHistoryStore.getSession(sessionId)
      if (!session) return
      stopStreaming()
      chatHistoryStore.saveSession(messagesRef.current)
      chatHistoryStore.touch(sessionId)
      chatHistoryStore.setCurrentSessionId(sessionId)
      setMessages(session.messages)
      setInputText("")
      void agentApi.restore(toAgentMessages(session.messages))
    },
    [stopStreaming],
  )

  // 发送消息：main 进程驱动 Agent 运行，消息由事件流回推渲染。
  const sendMessage = useCallback(
    (contentToSend?: string, selection?: ModelSelection) => {
      const text = (contentToSend ?? inputText).trim()
      if (!text || isStreaming) return
      setInputText("")
      void agentApi.send(text, selection)
    },
    [inputText, isStreaming],
  )

  // 编辑已发送的消息内容（仅影响显示与历史，不改变 main 侧上下文）。
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
    chatSessions,
    sendMessage,
    stopStreaming,
    createNewChat,
    restoreChat,
    editMessage,
  }
}

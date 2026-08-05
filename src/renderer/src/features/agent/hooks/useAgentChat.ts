import type { AgentEvent, AgentSendContext } from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { useCallback, useEffect, useRef, useState } from "react"
import { agentApi } from "../api/agentApi"
import type { ChatMessage } from "../types"
import { toAgentMessages, toChatMessage } from "../utils"
import { sessionListStore } from "./sessionListStore"

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

  // 撤销上一轮对话：删除最近一条用户消息及其后续 Agent 消息，并同步 main 侧上下文。
  const undoLastTurn = useCallback(() => {
    if (isStreaming) return

    const nextMessages = messagesRef.current.slice()
    const lastUserIndex = nextMessages.findLastIndex((message) => message.role === "user")
    if (lastUserIndex < 0) return

    nextMessages.splice(lastUserIndex)
    setMessages(nextMessages)
    setInputText("")
    void agentApi.restore(toAgentMessages(nextMessages))
  }, [isStreaming])

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
    restoreChat,
    editMessage,
  }
}

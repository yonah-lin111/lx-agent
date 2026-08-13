import type { AgentEvent, AgentSendContext, SubagentData, TodoList } from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { agentApi } from "../api/agentApi"
import type { ChatMessage } from "../types"
import {
  extractSubagentData,
  extractToolProgressText,
  toAgentMessages,
  toChatMessage,
} from "../utils"
import { sessionListStore } from "./sessionListStore"

// 展示条目 id 自增。
let messageSequence = 0

// 恢复会话时把 task 工具结果携带的子代理快照回填到对应 toolCall 块（弹窗展示）。
const mergeSubagentSnapshots = (chatMessages: ChatMessage[]): ChatMessage[] => {
  const subagentByToolCallId = new Map<string, SubagentData>()
  for (const message of chatMessages) {
    for (const block of message.blocks) {
      if (block.kind === "toolResult" && block.subagent) {
        subagentByToolCallId.set(block.toolCallId, block.subagent)
      }
    }
  }
  if (subagentByToolCallId.size === 0) return chatMessages
  return chatMessages.map((message) => ({
    ...message,
    blocks: message.blocks.map((block) => {
      if (block.kind === "toolCall") {
        const subagent = subagentByToolCallId.get(block.toolCallId)
        if (subagent) return { ...block, subagent }
      }
      return block
    }),
  }))
}

/**
 * 管理 Agent 对话：订阅 main 进程事件流，驱动消息列表、流式更新与工具状态。
 * 历史会话的持久化与恢复均由 main 进程 DB 承载。
 */
export const useAgentChat = (context?: AgentSendContext) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  // 历史会话恢复是否进行中（驱动消息列表骨架屏）。
  const [isRestoring, setIsRestoring] = useState(false)
  // 任务清单（TodoDock 数据源：订阅 todo_updated / 恢复时提取；空数组 = dock 不渲染）。
  const [todos, setTodos] = useState<TodoList>([])
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

        case "tool_execution_update": {
          // task 子代理流式回传：更新对应 toolCall 块的实时进度文本与面板快照。
          const progress = extractToolProgressText(event.partialResult)
          const subagent = extractSubagentData(event.partialResult)
          if (progress === undefined && subagent === undefined) break
          setMessages((prev) =>
            prev.map((message) => ({
              ...message,
              blocks: message.blocks.map((block) =>
                block.kind === "toolCall" && block.toolCallId === event.toolCallId
                  ? {
                      ...block,
                      ...(progress !== undefined ? { progress } : {}),
                      ...(subagent !== undefined ? { subagent } : {}),
                    }
                  : block,
              ),
            })),
          )
          break
        }

        case "tool_execution_end": {
          // 最终快照（含聚合 usage）随结果回传，覆盖流式期间的中间快照。
          const subagent = extractSubagentData(event.result)
          setMessages((prev) =>
            prev.map((message) => ({
              ...message,
              blocks: message.blocks.map((block) =>
                block.kind === "toolCall" && block.toolCallId === event.toolCallId
                  ? {
                      ...block,
                      status: event.isError ? "error" : "done",
                      // question 作答完成：清除挂起请求，块退回只读清单。
                      ...(event.toolName === "question" ? { question: undefined } : {}),
                      ...(subagent !== undefined ? { subagent } : {}),
                    }
                  : block,
              ),
            })),
          )
          break
        }

        case "session_title":
          if (event.title === null) {
            // 标题生成中：新建会话尚未落库（currentSessionId 为空），先同步标记当前会话，
            // 让右侧栏标题位立即显示 pulse 占位；幂等（同值早退），不干扰后续 send 返回设置。
            if (!sessionListStore.getCurrentSessionId()) {
              sessionListStore.setCurrentSessionId(event.sessionId)
            }
            sessionListStore.setSessionTitlePending(event.sessionId)
          } else {
            sessionListStore.updateSessionTitle(event.sessionId, event.title)
          }
          break

        case "compaction_summary":
          // 上下文压缩完成：追加可见摘要块（非交互，标注"此处已压缩"）。
          setMessages((prev) => [
            ...prev,
            toChatMessage(event.message, false, `m${++messageSequence}`),
          ])
          break

        case "todo_updated":
          // 任务清单整表替换（模型经 todowrite 更新；驱动 TodoDock）。
          setTodos(event.todos)
          break

        case "question_request":
          // 模型提问挂起：把请求回填到对应 question 工具调用块，驱动内联提问表单。
          setMessages((prev) =>
            prev.map((message) => ({
              ...message,
              blocks: message.blocks.map((block) =>
                block.kind === "toolCall" && block.toolCallId === event.request.toolCallId
                  ? { ...block, question: event.request }
                  : block,
              ),
            })),
          )
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

  // 新建/重置对话：脱离当前会话并清空 main 侧上下文。即时完成，不展示骨架屏。
  const createNewChat = useCallback(() => {
    stopStreaming()
    setIsRestoring(false)
    setMessages([])
    setInputText("")
    setTodos([])
    sessionListStore.setCurrentSessionId(null)
    void agentApi.restore([])
  }, [stopStreaming])

  // 删除一轮对话：移除该轮（问题 + 回答 + 工具调用）并同步 main 侧上下文与 DB。
  // 未命中 DB 用户消息 timestamp（幽灵消息）时仅做本地移除。
  const removeTurn = useCallback((userIndex: number): void => {
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
          void sessionListStore.refresh()
        })
        .catch(() => {
          // 写库失败为尽力而为：本地已移除，DB 仅多留一轮。
        })
    }
    if (nextMessages.length === 0) {
      sessionListStore.setCurrentSessionId(null)
    }
  }, [])

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

  // 恢复指定历史会话：从 main 进程 DB 读取并加载到上下文与展示。恢复期间展示骨架屏。
  const restoreChat = useCallback(
    (sessionId: string) => {
      stopStreaming()
      setIsRestoring(true)
      void agentApi
        .restoreSession(sessionId)
        .then((restored) => {
          const chatMessages = restored.messages.map((message) =>
            toChatMessage(message, false, `m${++messageSequence}`),
          )
          setMessages(mergeSubagentSnapshots(chatMessages))
          setTodos(restored.todos ?? [])
          setInputText("")
          sessionListStore.setCurrentSessionId(sessionId)
        })
        .catch(() => {
          // 会话已不存在等错误：保持当前展示，不做额外处理。
        })
        .finally(() => {
          setIsRestoring(false)
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
          void sessionListStore.refresh()
        }
      })
    },
    [inputText, isStreaming, context],
  )

  // "继续生成"可用性：最后一条助手消息被截断/中止且当前未在流式。
  const canContinue = useMemo(
    () =>
      !isStreaming &&
      messages.at(-1)?.role === "assistant" &&
      (messages.at(-1)?.stopReason === "length" || messages.at(-1)?.stopReason === "aborted"),
    [messages, isStreaming],
  )

  // 继续生成：续写被截断/中止的上一轮输出（续写指令由 main 注入为可见 user 气泡）。
  const continueChat = useCallback(() => {
    if (!canContinue) return
    void agentApi.continue().then((result) => {
      if (result.ok) {
        sessionListStore.setCurrentSessionId(result.sessionId)
        void sessionListStore.refresh()
      }
    })
  }, [canContinue])

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
    todos,
    inputText,
    setInputText,
    isStreaming,
    isRestoring,
    sendMessage,
    continueChat,
    canContinue,
    stopStreaming,
    createNewChat,
    undoLastTurn,
    deleteTurn,
    restoreChat,
    editMessage,
  }
}

import { useCallback, useRef, useState, useSyncExternalStore } from "react"
import { MOCK_RESPONSES } from "../constants"
import type { AgentMessage, ChatSession } from "../types"
import { chatHistoryStore } from "./chatHistoryStore"

/**
 * 管理 Agent 对话消息、Mock 打字机流式回复及交互状态。
 */
export const useAgentChat = () => {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const timerRef = useRef<number | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // 订阅模块级历史会话列表。
  const chatSessions = useSyncExternalStore<ChatSession[]>(
    chatHistoryStore.subscribe,
    chatHistoryStore.getSessions,
  )

  // 停止打字机流式生成。
  const stopStreaming = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsStreaming(false)
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg)),
    )
  }, [])

  // 新建/重置对话：先把当前对话存入历史。
  const createNewChat = useCallback(() => {
    stopStreaming()
    chatHistoryStore.saveSession(messagesRef.current)
    chatHistoryStore.setCurrentSessionId(null)
    setMessages([])
    setInputText("")
  }, [stopStreaming])

  // 恢复指定历史会话：先保存当前对话，再加载目标会话。
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
    },
    [stopStreaming],
  )

  // 发送消息并触发 Mock 打字机回复。
  const sendMessage = useCallback(
    (contentToSend?: string) => {
      const text = (contentToSend ?? inputText).trim()
      if (!text || isStreaming) return

      const userMsg: AgentMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        createdAt: Date.now(),
      }

      const assistantMsgId = `assistant-${Date.now()}`
      const assistantMsg: AgentMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        isStreaming: true,
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setInputText("")
      setIsStreaming(true)

      // 随机选一条 mock 回复。
      const mockReply =
        MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)] ?? MOCK_RESPONSES[0]
      let currentIndex = 0

      // 打字机效果，每 25ms 打印 2-4 个字符。
      timerRef.current = window.setInterval(() => {
        currentIndex += Math.floor(Math.random() * 3) + 2
        const currentContent = mockReply.slice(0, currentIndex)

        if (currentIndex >= mockReply.length) {
          if (timerRef.current !== null) {
            window.clearInterval(timerRef.current)
            timerRef.current = null
          }
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: mockReply, isStreaming: false } : msg,
            ),
          )
          setIsStreaming(false)
        } else {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: currentContent } : msg,
            ),
          )
        }
      }, 25)
    },
    [inputText, isStreaming],
  )

  // 编辑已发送的消息内容。
  const editMessage = useCallback((id: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, content: newContent } : msg)),
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

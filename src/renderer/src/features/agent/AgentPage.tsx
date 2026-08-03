import type React from "react"
import { useEffect, useRef } from "react"
import { AgentInput } from "./components/AgentInput"
import { AgentMessageList } from "./components/AgentMessageList"
import { chatHistoryStore } from "./hooks/chatHistoryStore"
import { useAgentChat } from "./hooks/useAgentChat"

export interface AgentPageProps {
  onNewChatRef?: (fn: () => void) => void
  onRestoreChatRef?: (fn: (sessionId: string) => void) => void
}

/**
 * Agent 独立页面与对话集成组件。
 */
export const AgentPage = ({
  onNewChatRef,
  onRestoreChatRef,
}: AgentPageProps): React.JSX.Element => {
  const {
    messages,
    inputText,
    setInputText,
    isStreaming,
    sendMessage,
    stopStreaming,
    createNewChat,
    restoreChat,
    editMessage,
  } = useAgentChat()

  if (onNewChatRef) {
    onNewChatRef(createNewChat)
  }
  if (onRestoreChatRef) {
    onRestoreChatRef(restoreChat)
  }

  // 卸载（折叠/新建重挂载）前把当前对话存入历史。
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  useEffect(() => {
    return () => {
      chatHistoryStore.saveSession(messagesRef.current)
      chatHistoryStore.setCurrentSessionId(null)
    }
  }, [])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-transparent">
      <AgentMessageList
        messages={messages}
        onSelectPrompt={(prompt) => sendMessage(prompt)}
        onEditMessage={editMessage}
      />
      <AgentInput
        inputText={inputText}
        isStreaming={isStreaming}
        onInputChange={setInputText}
        onSend={() => sendMessage()}
        onStop={stopStreaming}
      />
    </div>
  )
}

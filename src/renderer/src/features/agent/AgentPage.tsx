import type React from "react"
import { AgentInput } from "./components/AgentInput"
import { AgentMessageList } from "./components/AgentMessageList"
import { useAgentChat } from "./hooks/useAgentChat"

export interface AgentPageProps {
  onNewChatRef?: (fn: () => void) => void
}

/**
 * Agent 独立页面与对话集成组件。
 */
export const AgentPage = ({ onNewChatRef }: AgentPageProps): React.JSX.Element => {
  const {
    messages,
    inputText,
    setInputText,
    isStreaming,
    sendMessage,
    stopStreaming,
    createNewChat,
    editMessage,
  } = useAgentChat()

  if (onNewChatRef) {
    onNewChatRef(createNewChat)
  }

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

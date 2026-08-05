import type { AgentSendContext } from "@shared/contracts/agent"
import type React from "react"
import { AgentInput } from "./components/AgentInput"
import { AgentMessageList } from "./components/AgentMessageList"
import { useAgentChat } from "./hooks/useAgentChat"
import { useAgentModelSelect } from "./hooks/useAgentModelSelect"

export interface AgentPageProps {
  onNewChatRef?: (fn: () => void) => void
  onRestoreChatRef?: (fn: (sessionId: string) => void) => void
  context?: AgentSendContext
  currentProjectId?: string
  currentProjectPath?: string
}

/**
 * Agent 独立页面与对话集成组件。
 */
export const AgentPage = ({
  onNewChatRef,
  onRestoreChatRef,
  context,
  currentProjectId,
  currentProjectPath,
}: AgentPageProps): React.JSX.Element => {
  const {
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
  } = useAgentChat(context)

  const { selectedModel, selectedSelection, hasModelOptions, selectOptions, handleModelChange } =
    useAgentModelSelect()

  if (onNewChatRef) {
    onNewChatRef(createNewChat)
  }
  if (onRestoreChatRef) {
    onRestoreChatRef(restoreChat)
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-transparent">
      <AgentMessageList
        messages={messages}
        onSelectPrompt={(prompt) => sendMessage(prompt)}
        onEditMessage={editMessage}
        onDeleteMessage={deleteTurn}
      />
      <AgentInput
        inputText={inputText}
        isStreaming={isStreaming}
        onInputChange={setInputText}
        onSend={() => sendMessage(undefined, selectedSelection)}
        onStop={stopStreaming}
        onClear={createNewChat}
        onUndo={undoLastTurn}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        modelOptions={selectOptions}
        hasModelOptions={hasModelOptions}
        projectId={currentProjectId}
        projectPath={currentProjectPath}
      />
    </div>
  )
}

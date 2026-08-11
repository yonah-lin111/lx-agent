import type { AgentSendContext, PermissionRequest } from "@shared/contracts/agent"
import type React from "react"
import { useCallback, useEffect, useState } from "react"
import { agentApi } from "./api/agentApi"
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
    isRestoring,
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

  // 挂起的权限请求：订阅事件流，驱动 AgentInput 命令面板（替代原弹窗）。
  const [pendingRequest, setPendingRequest] = useState<PermissionRequest | null>(null)

  useEffect(() => {
    const unsubscribe = agentApi.onEvent((event) => {
      if (event.type === "permission_request") {
        setPendingRequest(event.request)
      } else if (event.type === "agent_end") {
        setPendingRequest(null)
      }
    })
    return unsubscribe
  }, [])

  // 权限决策：回传 main；允许全部由 main 侧记录为会话级放行。
  const respondPermission = useCallback(
    (decision: "allow" | "deny", rememberForSession?: boolean, allowAll?: boolean): void => {
      const current = pendingRequest
      if (!current) return
      setPendingRequest(null)
      void agentApi.permissionRespond({
        requestId: current.requestId,
        decision,
        rememberForSession,
        allowAll,
      })
    },
    [pendingRequest],
  )

  if (onNewChatRef) {
    onNewChatRef(createNewChat)
  }
  if (onRestoreChatRef) {
    onRestoreChatRef(restoreChat)
  }

  return (
    <div
      className={`flex h-full w-full min-w-0 flex-col overflow-hidden bg-transparent ${
        pendingRequest ? "permission-pending" : ""
      }`}
    >
      <AgentMessageList
        messages={messages}
        isStreaming={isStreaming}
        isRestoring={isRestoring}
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
        pendingRequest={pendingRequest}
        onPermissionRespond={respondPermission}
      />
    </div>
  )
}

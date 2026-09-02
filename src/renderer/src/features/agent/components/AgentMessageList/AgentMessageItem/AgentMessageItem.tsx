import type React from "react"
import { AgentCompactionSummary, AgentUndoSummary } from "@/features/agent/components/blocks"
import { getModelDisplayName, useModelSettings } from "@/features/agent/hooks/modelsStore"
import { AgentAssistantMessage } from "./AgentAssistantMessage"
import { AgentUserMessage } from "./AgentUserMessage"
import { useMessageItemGroups } from "./hooks/useMessageItemGroups"
import type { AgentMessageItemProps } from "./types"

// AgentMessageItem 消息条目主分发组件。
export const AgentMessageItem = ({
  message,
  continuationMessages = [],
  isLoading,
  isEditing,
  isLastAssistant = false,
  suggestedQuestionContext,
  onSendSuggestedQuestion,
  onEchoToInput,
  onStartEdit,
  onCancelEdit,
  onEdit,
  onDelete,
  onFork,
  onOpenSubagent,
  readOnly = false,
  showScrollToBottom = false,
  canContinue = false,
  onContinue,
  onAcceptPlan,
  hasSubsequentUserMessage = false,
}: AgentMessageItemProps): React.JSX.Element => {
  const isUser = message.role === "user"
  const settings = useModelSettings()

  // 上下文压缩摘要块：非交互（不可编辑/删除），诚实地标注"此处已压缩"；压缩中展示 loading 占位。
  if (message.role === "compactionSummary") {
    const summary = message.blocks.find((block) => block.kind === "text")?.text ?? ""
    return (
      <AgentCompactionSummary
        summary={summary}
        isLoading={message.isCompacting}
        isManual={message.isManual}
        modelName={getModelDisplayName(message.model, undefined, settings)}
        usage={message.compactionUsage}
        summaryTokens={message.summaryTokens}
      />
    )
  }

  // 撤销摘要块：展示被撤销/删除轮次的问题、工具调用与代码变更 Diff（支持连续多次撤销堆叠）。
  if (message.role === "undoSummary") {
    return (
      <AgentUndoSummary payload={message.undoPayload} continuationMessages={continuationMessages} />
    )
  }

  // 用户消息分支。
  if (isUser) {
    return (
      <AgentUserMessage
        message={message}
        isEditing={isEditing}
        readOnly={readOnly}
        onStartEdit={onStartEdit}
        onCancelEdit={onCancelEdit}
        onEdit={onEdit}
        onFork={onFork}
      />
    )
  }

  const groupsResult = useMessageItemGroups(message, continuationMessages)

  // 助手消息分支。
  return (
    <AgentAssistantMessage
      message={message}
      groupsResult={groupsResult}
      isLoading={isLoading}
      isLastAssistant={isLastAssistant}
      suggestedQuestionContext={suggestedQuestionContext}
      onSendSuggestedQuestion={onSendSuggestedQuestion}
      onEchoToInput={onEchoToInput}
      onDelete={onDelete}
      onOpenSubagent={onOpenSubagent}
      readOnly={readOnly}
      showScrollToBottom={showScrollToBottom}
      canContinue={canContinue}
      onContinue={onContinue}
      onAcceptPlan={onAcceptPlan}
      hasSubsequentUserMessage={hasSubsequentUserMessage}
    />
  )
}

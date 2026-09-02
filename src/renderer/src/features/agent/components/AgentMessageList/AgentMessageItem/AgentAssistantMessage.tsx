import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react"
import type React from "react"
import { useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTooltip } from "@/components/ui/LxTooltip"
import {
  AgentExecutionGroup,
  AgentMcpCallBlock,
  AgentQuestionBlock,
  AgentSkillCallBlock,
  AgentSubagentBlock,
  AgentThinkingBlock,
  AgentTodoCallBlock,
  AgentToolCallBlock,
  AgentVisualBlock,
  AgentWebSearchBlock,
  ProposedPlanCard,
  type ExecutionItemMeta,
} from "@/features/agent/components/blocks"
import { SuggestedQuestions } from "@/features/agent/components/SuggestedQuestions"
import { TOOL_GROUP_SEPARATORS } from "@/features/agent/constants"
import { getModelDisplayName, useModelSettings } from "@/features/agent/hooks/modelsStore"
import { useSuggestedQuestions } from "@/features/agent/hooks/useSuggestedQuestions"
import type { ChatBlock, ChatMessage, LspToolDetails, ProposedPlanData } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { EMPTY_SUGGESTED_QUESTION_CONTEXT } from "./constants"
import type { MessageItemGroupsResult } from "./hooks/useMessageItemGroups"
import type { ToolCallBlock } from "./types"
import { formatTokensShort, isMcpToolCall, isSkillToolCall, isWebSearchToolCall } from "./utils"

// 助手消息组件 Props 接口。
export interface AgentAssistantMessageProps {
  message: ChatMessage
  groupsResult: MessageItemGroupsResult
  isLoading?: boolean
  isLastAssistant?: boolean
  suggestedQuestionContext?: SuggestedQuestionContextMessage[]
  onSendSuggestedQuestion?: (question: string) => void
  onEchoToInput?: (question: string) => void
  onDelete?: (messageId: string) => void
  onOpenSubagent?: (toolCall: ToolCallBlock) => void
  readOnly?: boolean
  showScrollToBottom?: boolean
  canContinue?: boolean
  onContinue?: () => void
  onAcceptPlan?: (plan: ProposedPlanData) => void
  hasSubsequentUserMessage?: boolean
}

// 助手消息气泡与执行组渲染组件。
export const AgentAssistantMessage = ({
  message,
  groupsResult,
  isLoading,
  isLastAssistant = false,
  suggestedQuestionContext,
  onSendSuggestedQuestion,
  onEchoToInput,
  onDelete,
  onOpenSubagent,
  readOnly = false,
  showScrollToBottom = false,
  canContinue = false,
  onContinue,
  onAcceptPlan,
  hasSubsequentUserMessage = false,
}: AgentAssistantMessageProps): React.JSX.Element => {
  const { t } = useTranslation()
  const previewRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  const assistantBubbleClass = readOnly ? "bg-[#363e4c]" : "bg-[#303030]"

  const {
    displayBlocks,
    qaUsage,
    toolResultByToolCallId,
    diffByToolCallId,
    lspDetailsByToolCallId,
    mergeableToolCallGroupById,
    mcpCallGroupById,
    webSearchCallGroupById,
    skillCallGroupById,
    executionGroups,
    assistantError,
    isStreamingNow,
    hasOutput,
    hasActionableContent,
    isAborted,
  } = groupsResult

  const settings = useModelSettings()
  const modelDisplayName = getModelDisplayName(message.model, message.provider, settings)

  const canSuggestSuggestedQuestions = Boolean(
    message.role !== "compactionSummary" &&
      message.role !== "user" &&
      isLastAssistant &&
      !isStreamingNow &&
      !isLoading &&
      !assistantError &&
      hasOutput &&
      suggestedQuestionContext &&
      suggestedQuestionContext.length > 0,
  )

  const {
    questions: suggestedQuestions,
    isLoading: isLoadingSuggestedQuestions,
    clear: clearSuggestedQuestions,
  } = useSuggestedQuestions({
    enabled: canSuggestSuggestedQuestions,
    isStreaming: isStreamingNow,
    isLastAssistant,
    context: suggestedQuestionContext ?? EMPTY_SUGGESTED_QUESTION_CONTEXT,
  })

  const handleSendSuggestedQuestion = (question: string): void => {
    clearSuggestedQuestions()
    onSendSuggestedQuestion?.(question)
  }

  const handleEchoSuggestedQuestion = (question: string): void => {
    onEchoToInput?.(question)
  }

  const copyMessageContent = async (): Promise<void> => {
    try {
      const text = displayBlocks
        .map(({ block }) => {
          if (block.kind === "text" || block.kind === "thinking") return block.text
          if (block.kind === "toolResult") return block.text
          return ""
        })
        .filter(Boolean)
        .join("\n\n")
      await navigator.clipboard.writeText(text || assistantError || "")
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="group flex min-w-0 w-full flex-col gap-1 px-0">
      {!readOnly && message.model && (
        <LxTooltip
          placement="top"
          content={message.provider ? `${message.provider} / ${message.model}` : message.model}
        >
          <span className="agent-message-model flex w-fit select-text items-center text-[11px] leading-none text-white/40">
            {modelDisplayName}
          </span>
        </LxTooltip>
      )}
      <div
        data-assistant-bubble="true"
        className={`relative min-w-0 w-full rounded-[18px] rounded-bl-[4px] ${assistantBubbleClass} px-3 py-2 text-[13px] text-white/90`}
      >
        <div className="flex min-w-0 max-w-full flex-col gap-1.5">
          {executionGroups.map((group, groupIndex) => {
            if (group.kind === "text") {
              if (!group.block.text) return null
              return (
                <LxMarkdownPreview
                  key={groupIndex}
                  html={markdownRenderer.render(group.block.text)}
                  previewMode="preview"
                  previewRef={previewRef}
                  className="px-0"
                  contentClassName="py-1"
                  sanitizeCopy
                />
              )
            }

            if (group.kind === "proposedPlan") {
              return (
                <ProposedPlanCard
                  key={groupIndex}
                  plan={group.block.plan}
                  isStreaming={group.isStreaming}
                  onAccept={onAcceptPlan}
                  readOnly={readOnly}
                  hasSubsequentUserMessage={hasSubsequentUserMessage}
                />
              )
            }

            if (group.kind === "writing") {
              return (
                <AgentToolCallBlock
                  key={groupIndex}
                  toolCall={group.block}
                  toolResult={toolResultByToolCallId.get(group.block.toolCallId)}
                  diff={diffByToolCallId.get(group.block.toolCallId)}
                  defaultExpanded={isStreamingNow}
                />
              )
            }

            if (group.kind === "subagent") {
              return (
                <AgentSubagentBlock
                  key={groupIndex}
                  toolCall={group.block}
                  onOpen={onOpenSubagent}
                />
              )
            }

            if (group.kind === "todo") {
              return <AgentTodoCallBlock key={groupIndex} toolCall={group.block} />
            }

            if (group.kind === "question") {
              return <AgentQuestionBlock key={groupIndex} toolCall={group.block} />
            }

            if (group.kind === "visual") {
              return <AgentVisualBlock key={groupIndex} toolCall={group.block} />
            }

            const executionItems = group.blocks.flatMap<ExecutionItemMeta>(
              ({ block, isStreaming }, blockIndex) => {
                if (block.kind === "thinking") {
                  return [
                    {
                      type: "thinking",
                      dotColor: "bg-rose-300",
                      node: (
                        <AgentThinkingBlock
                          key={`thinking-${blockIndex}`}
                          content={block.text}
                          isGenerating={
                            isStreaming &&
                            groupIndex === executionGroups.length - 1 &&
                            blockIndex === group.blocks.length - 1
                          }
                        />
                      ),
                    },
                  ]
                }

                if (isSkillToolCall(block.toolName)) {
                  const skillGroup = skillCallGroupById.get(block.toolCallId)
                  if (!skillGroup || block.toolCallId !== skillGroup[0]?.toolCallId) return []
                  return [
                    {
                      type: "skill",
                      dotColor: "bg-violet-300",
                      node: <AgentSkillCallBlock key={block.toolCallId} toolCalls={skillGroup} />,
                    },
                  ]
                }

                if (isWebSearchToolCall(block.toolName)) {
                  const searchGroup = webSearchCallGroupById.get(block.toolCallId)
                  if (!searchGroup || block.toolCallId !== searchGroup[0]?.toolCallId) return []
                  return [
                    {
                      type: "webSearch",
                      dotColor: "bg-emerald-300",
                      node: <AgentWebSearchBlock key={block.toolCallId} toolCalls={searchGroup} />,
                    },
                  ]
                }

                if (isMcpToolCall(block.toolName)) {
                  const mcpGroup = mcpCallGroupById.get(block.toolCallId)
                  if (!mcpGroup || block.toolCallId !== mcpGroup[0]?.toolCallId) return []
                  return [
                    {
                      type: "mcp",
                      dotColor: "bg-cyan-300",
                      node: <AgentMcpCallBlock key={block.toolCallId} toolCalls={mcpGroup} />,
                    },
                  ]
                }

                if (block.toolName in TOOL_GROUP_SEPARATORS) {
                  const toolGroup = mergeableToolCallGroupById.get(block.toolCallId)
                  if (!toolGroup || block.toolCallId !== toolGroup[0]?.toolCallId) return []
                  const toolResults = toolGroup
                    .map((call) => toolResultByToolCallId.get(call.toolCallId))
                    .filter(
                      (entry): entry is Extract<ChatBlock, { kind: "toolResult" }> =>
                        entry !== undefined,
                    )
                  if (toolGroup[0]?.toolName === "lsp") {
                    const lspDetails = toolGroup
                      .map((call) => lspDetailsByToolCallId.get(call.toolCallId))
                      .filter((entry): entry is LspToolDetails => entry !== undefined)
                    return [
                      {
                        type: "tool",
                        dotColor: "bg-cyan-300",
                        node: (
                          <AgentToolCallBlock
                            key={block.toolCallId}
                            toolCalls={toolGroup}
                            toolResults={toolResults}
                            lspDetails={lspDetails}
                          />
                        ),
                      },
                    ]
                  }
                  return [
                    {
                      type: "tool",
                      dotColor: "bg-amber-300",
                      node: (
                        <AgentToolCallBlock
                          key={block.toolCallId}
                          toolCalls={toolGroup}
                          toolResults={toolResults}
                          toolResult={toolResultByToolCallId.get(block.toolCallId)}
                        />
                      ),
                    },
                  ]
                }

                return [
                  {
                    type: "tool",
                    dotColor: "bg-amber-300",
                    node: (
                      <AgentToolCallBlock
                        key={block.toolCallId}
                        toolCall={block}
                        toolResult={toolResultByToolCallId.get(block.toolCallId)}
                      />
                    ),
                  },
                ]
              },
            )
            return <AgentExecutionGroup key={groupIndex} items={executionItems} />
          })}
        </div>
        {assistantError && (
          <div className="agent-message-error-container mt-2 flex flex-col gap-1.5">
            <div className="border-t border-white/10" />
            <div className="agent-message-error text-[13px] text-red-400 italic whitespace-pre-wrap break-words">
              {assistantError}
            </div>
          </div>
        )}
        {isAborted && !assistantError && (
          <div className="agent-message-aborted-container mt-2 flex flex-col gap-1.5">
            <div className="border-t border-white/10" />
            <div className="agent-message-aborted text-[13px] text-amber-400 italic">
              Generation cancelled
            </div>
          </div>
        )}
        {(isStreamingNow || isLoading) && !assistantError && !showScrollToBottom && (
          <div
            className="flex items-center py-1"
            role="status"
            aria-label={t("agent.aiGenerating")}
          >
            <div className="lx-liquid-loader">
              <span className="lx-liquid-blob" />
            </div>
          </div>
        )}
      </div>
      {isLastAssistant && canContinue && onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="agent-message-continue-btn mt-1 flex w-fit items-center gap-1 rounded-[6px] border border-white/10 px-2 py-1 text-xs text-white/65 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("agent.continueGenerating")}
        </button>
      )}
      {isLastAssistant && (
        <SuggestedQuestions
          questions={suggestedQuestions}
          isLoading={isLoadingSuggestedQuestions}
          onSelect={handleSendSuggestedQuestion}
          onEcho={handleEchoSuggestedQuestion}
        />
      )}
      {!isStreamingNow && !isLoading && (hasActionableContent || assistantError) && (
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <LxIconButton
              size="small"
              aria-label={t("agent.copyMessage")}
              title={{
                content: copied ? t("common.copied") : t("agent.copyMessage"),
                placement: "top",
              }}
              onClick={copyMessageContent}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </LxIconButton>
            {!readOnly && onDelete && (
              <LxTooltip
                hover={{
                  content: t("agent.deleteMessage"),
                  placement: "top",
                }}
                click={{
                  content: t("agent.deleteQaConfirm"),
                  placement: "top",
                  onConfirm: () => onDelete(message.id),
                }}
              >
                <LxIconButton size="small" aria-label={t("agent.deleteMessage")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </LxIconButton>
              </LxTooltip>
            )}
          </div>
          {qaUsage && (
            <LxTooltip
              placement="top"
              multiline
              content={
                <div className="flex flex-col gap-0.5">
                  <span>Input: {qaUsage.input.toLocaleString()}</span>
                  <span>Output: {qaUsage.output.toLocaleString()}</span>
                  <span>Cache read: {qaUsage.cacheRead.toLocaleString()}</span>
                </div>
              }
            >
              <span className="agent-message-usage flex items-center gap-1 text-[10px] leading-none text-white/35 select-text tabular-nums whitespace-nowrap">
                <span className="agent-message-usage-item">
                  IN {formatTokensShort(qaUsage.input)}
                </span>
                <span aria-hidden="true" className="agent-message-usage-separator">
                  ·
                </span>
                <span className="agent-message-usage-item">
                  OUT {formatTokensShort(qaUsage.output)}
                </span>
                <span aria-hidden="true" className="agent-message-usage-separator">
                  ·
                </span>
                <span className="agent-message-usage-item">
                  CACHE {formatTokensShort(qaUsage.cacheRead)}
                </span>
              </span>
            </LxTooltip>
          )}
        </div>
      )}
    </div>
  )
}

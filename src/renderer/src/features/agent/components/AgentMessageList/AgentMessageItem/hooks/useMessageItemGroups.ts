import { useMemo } from "react"
import { TOOL_GROUP_SEPARATORS } from "@/features/agent/constants"
import type { AgentDiff, ChatBlock, ChatMessage, LspToolDetails } from "@/features/agent/types"
import {
  buildFileChangeSummary,
  type FileChangeSummary,
  isFileChangeTool,
} from "@/features/agent/utils/fileChanges"
import type { DisplayGroup, ExecutionGroup, QaUsage, ToolCallBlock } from "../types"
import {
  calculateQaUsage,
  getMcpServerName,
  isMcpToolCall,
  isQuestionToolCall,
  isSkillToolCall,
  isSubagentToolCall,
  isTodoToolCall,
  isWebSearchToolCall,
  isWireframeToolCall,
  isWriteToolCall,
} from "../utils"

// 消息项分组解析结果接口。
export interface MessageItemGroupsResult {
  displayBlocks: { block: ChatBlock; isStreaming: boolean }[]
  qaUsage: QaUsage | null
  toolResultByToolCallId: Map<string, Extract<ChatBlock, { kind: "toolResult" }>>
  diffByToolCallId: Map<string, AgentDiff[]>
  lspDetailsByToolCallId: Map<string, LspToolDetails>
  mergeableToolCallGroupById: Map<string, ToolCallBlock[]>
  mcpCallGroupById: Map<string, ToolCallBlock[]>
  webSearchCallGroupById: Map<string, ToolCallBlock[]>
  skillCallGroupById: Map<string, ToolCallBlock[]>
  executionGroups: DisplayGroup[]
  // 本条消息（含续写）的文件修改统计（edit/write/apply_patch diff 聚合）。
  messageFileChanges: FileChangeSummary | null
  assistantError: string | undefined
  isStreamingNow: boolean
  hasOutput: boolean
  hasActionableContent: boolean
  isAborted: boolean
}

// 提取与解析消息块及工具调用分组。
export const useMessageItemGroups = (
  message: ChatMessage,
  continuationMessages: ChatMessage[] = [],
): MessageItemGroupsResult => {
  const isUser = message.role === "user"

  const displayBlocks = useMemo(
    () =>
      [message, ...continuationMessages].flatMap((currentMessage) =>
        currentMessage.blocks.map((block) => ({ block, isStreaming: currentMessage.isStreaming })),
      ),
    [continuationMessages, message],
  )

  const qaUsage = useMemo(
    () => calculateQaUsage(message, continuationMessages),
    [message, continuationMessages],
  )

  const toolResultByToolCallId = useMemo(
    () =>
      new Map(
        displayBlocks
          .filter(
            (
              item,
            ): item is {
              block: Extract<ChatBlock, { kind: "toolResult" }>
              isStreaming: boolean
            } => item.block.kind === "toolResult",
          )
          .map((item) => [item.block.toolCallId, item.block]),
      ),
    [displayBlocks],
  )

  const diffByToolCallId = useMemo(
    () =>
      new Map(
        displayBlocks
          .filter(
            (
              item,
            ): item is {
              block: Extract<ChatBlock, { kind: "toolResult" }>
              isStreaming: boolean
            } =>
              item.block.kind === "toolResult" &&
              (item.block.diff !== undefined || item.block.diffs !== undefined),
          )
          .map((item) => {
            const diffs = item.block.diffs?.length
              ? item.block.diffs
              : item.block.diff
                ? [item.block.diff]
                : []
            return [item.block.toolCallId, diffs] as const
          }),
      ),
    [displayBlocks],
  )

  // toolCall 参数表（diff 缺失文件名的历史消息回退解析路径）。
  const toolCallArgsByToolCallId = useMemo(
    () =>
      new Map(
        displayBlocks
          .filter(
            (
              item,
            ): item is {
              block: Extract<ChatBlock, { kind: "toolCall" }>
              isStreaming: boolean
            } => item.block.kind === "toolCall",
          )
          .map((item) => [item.block.toolCallId, item.block.args] as const),
      ),
    [displayBlocks],
  )

  const messageFileChanges = useMemo(() => {
    const entries: { diff: AgentDiff; fallbackPath?: string }[] = []
    for (const { block } of displayBlocks) {
      if (block.kind !== "toolResult" || !isFileChangeTool(block.toolName)) continue
      const diffs = block.diffs?.length ? block.diffs : block.diff ? [block.diff] : []
      if (diffs.length === 0) continue
      const args = toolCallArgsByToolCallId.get(block.toolCallId)
      const fallbackPath =
        typeof args?.filePath === "string"
          ? args.filePath
          : typeof args?.path === "string"
            ? args.path
            : undefined
      for (const diff of diffs) {
        entries.push({ diff, fallbackPath })
      }
    }
    return buildFileChangeSummary(entries)
  }, [displayBlocks, toolCallArgsByToolCallId])

  const lspDetailsByToolCallId = useMemo(
    () =>
      new Map(
        displayBlocks
          .filter(
            (
              item,
            ): item is {
              block: Extract<ChatBlock, { kind: "toolResult" }>
              isStreaming: boolean
            } => item.block.kind === "toolResult" && item.block.lsp !== undefined,
          )
          .map((item) => [item.block.toolCallId, item.block.lsp as LspToolDetails]),
      ),
    [displayBlocks],
  )

  const mergeableToolCallGroups = useMemo(() => {
    const groups: ToolCallBlock[][] = []
    const mergeableToolCallIds = new Set<string>()

    for (const { block } of displayBlocks) {
      if (block.kind === "toolCall" && block.toolName in TOOL_GROUP_SEPARATORS) {
        mergeableToolCallIds.add(block.toolCallId)
        const lastGroup = groups.at(-1)
        if (lastGroup && lastGroup[0]?.toolName === block.toolName) {
          lastGroup.push(block)
        } else {
          groups.push([block])
        }
        continue
      }

      if (block.kind === "toolResult" && mergeableToolCallIds.has(block.toolCallId)) continue
      if (
        block.kind === "toolCall" ||
        block.kind === "thinking" ||
        (block.kind === "text" && block.text.trim() !== "")
      ) {
        groups.push([])
      }
    }

    return groups.filter((group) => group.length > 0)
  }, [displayBlocks])

  const mergeableToolCallGroupById = useMemo(
    () =>
      new Map(
        mergeableToolCallGroups.flatMap((group) =>
          group.map((block) => [block.toolCallId, group] as const),
        ),
      ),
    [mergeableToolCallGroups],
  )

  const mcpCallGroups = useMemo(() => {
    const groups: ToolCallBlock[][] = []
    for (const { block } of displayBlocks) {
      if (block.kind === "toolResult" && isMcpToolCall(block.toolName)) continue
      if (block.kind !== "toolCall" || !isMcpToolCall(block.toolName)) {
        groups.push([])
        continue
      }
      const lastGroup = groups.at(-1)
      if (
        lastGroup?.[0] &&
        getMcpServerName(lastGroup[0].toolName) === getMcpServerName(block.toolName)
      ) {
        lastGroup.push(block)
      } else {
        groups.push([block])
      }
    }

    return groups.filter((group) => group.length > 0)
  }, [displayBlocks])

  const mcpCallGroupById = useMemo(
    () =>
      new Map(
        mcpCallGroups.flatMap((group) => group.map((block) => [block.toolCallId, group] as const)),
      ),
    [mcpCallGroups],
  )

  const webSearchCallGroups = useMemo(() => {
    const groups: ToolCallBlock[][] = []
    for (const { block } of displayBlocks) {
      if (block.kind === "toolResult" && isWebSearchToolCall(block.toolName)) continue
      if (block.kind !== "toolCall" || !isWebSearchToolCall(block.toolName)) {
        groups.push([])
        continue
      }
      const lastGroup = groups.at(-1)
      if (lastGroup?.[0] && lastGroup[0].toolName === block.toolName) {
        lastGroup.push(block)
      } else {
        groups.push([block])
      }
    }

    return groups.filter((group) => group.length > 0)
  }, [displayBlocks])

  const webSearchCallGroupById = useMemo(
    () =>
      new Map(
        webSearchCallGroups.flatMap((group) =>
          group.map((block) => [block.toolCallId, group] as const),
        ),
      ),
    [webSearchCallGroups],
  )

  const skillCallGroups = useMemo(() => {
    const groups: ToolCallBlock[][] = []
    for (const { block } of displayBlocks) {
      if (block.kind === "toolResult" && isSkillToolCall(block.toolName)) continue
      if (block.kind !== "toolCall" || !isSkillToolCall(block.toolName)) {
        groups.push([])
        continue
      }
      const lastGroup = groups.at(-1)
      if (lastGroup?.[0] && lastGroup[0].toolName === block.toolName) {
        lastGroup.push(block)
      } else {
        groups.push([block])
      }
    }

    return groups.filter((group) => group.length > 0)
  }, [displayBlocks])

  const skillCallGroupById = useMemo(
    () =>
      new Map(
        skillCallGroups.flatMap((group) =>
          group.map((block) => [block.toolCallId, group] as const),
        ),
      ),
    [skillCallGroups],
  )

  const executionGroups = useMemo(() => {
    const groups: DisplayGroup[] = []
    let currentExecution: ExecutionGroup | null = null

    for (const item of displayBlocks) {
      if (item.block.kind === "text") {
        if (item.block.text.trim() !== "") {
          currentExecution = null
          groups.push({ kind: "text", block: item.block, isStreaming: item.isStreaming })
        }
        continue
      }
      if (item.block.kind === "proposedPlan") {
        currentExecution = null
        groups.push({ kind: "proposedPlan", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (item.block.kind === "reviewFindings") {
        currentExecution = null
        groups.push({ kind: "reviewFindings", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (item.block.kind === "grillQuestion") {
        currentExecution = null
        groups.push({ kind: "grillQuestion", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (item.block.kind === "thinking") {
        if (!currentExecution) {
          currentExecution = { kind: "execution", blocks: [] }
          groups.push(currentExecution)
        }
        currentExecution.blocks.push({ block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (item.block.kind === "toolResult") continue
      if (item.block.kind !== "toolCall") continue

      const toolName = item.block.toolName
      if (isWriteToolCall(toolName)) {
        currentExecution = null
        groups.push({ kind: "writing", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (isSubagentToolCall(toolName)) {
        currentExecution = null
        groups.push({ kind: "subagent", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (isTodoToolCall(toolName)) {
        currentExecution = null
        groups.push({ kind: "todo", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (isWireframeToolCall(toolName)) {
        currentExecution = null
        groups.push({ kind: "wireframe", block: item.block, isStreaming: item.isStreaming })
        continue
      }
      if (isQuestionToolCall(toolName)) {
        currentExecution = null
        groups.push({ kind: "question", block: item.block, isStreaming: item.isStreaming })
        continue
      }

      if (!currentExecution) {
        currentExecution = { kind: "execution", blocks: [] }
        groups.push(currentExecution)
      }
      currentExecution.blocks.push({
        block: item.block,
        isStreaming: item.isStreaming,
      })
    }

    return groups
  }, [displayBlocks])

  const assistantError = !isUser
    ? [message, ...continuationMessages].find((currentMessage) => currentMessage.error)?.error
    : undefined

  const isStreamingNow =
    message.isStreaming || continuationMessages.some((currentMessage) => currentMessage.isStreaming)

  const hasOutput = displayBlocks.some(
    ({ block }) =>
      (block.kind === "text" && block.text.trim() !== "") ||
      (block.kind === "proposedPlan" && block.plan.content.trim() !== "") ||
      (block.kind === "grillQuestion" && block.grill.question.trim() !== "") ||
      (block.kind === "reviewFindings" &&
        (block.findings.summary.trim() !== "" || block.findings.findings.length > 0)),
  )

  const hasActionableContent =
    hasOutput ||
    displayBlocks.some(
      ({ block }) =>
        block.kind === "toolCall" ||
        block.kind === "thinking" ||
        block.kind === "proposedPlan" ||
        block.kind === "reviewFindings" ||
        block.kind === "grillQuestion",
    )

  const isAborted =
    !isUser &&
    [message, ...continuationMessages].some(
      (currentMessage) => currentMessage.stopReason === "aborted",
    )

  return {
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
    messageFileChanges,
    assistantError,
    isStreamingNow,
    hasOutput,
    hasActionableContent,
    isAborted,
  }
}

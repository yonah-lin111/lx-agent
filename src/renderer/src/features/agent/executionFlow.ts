import type { ChatBlock, ChatMessage, ExecutionStep, ExecutionStepStatus } from "./types"

/**
 * 截断文本为单行预览。
 */
export const formatPreview = (text: string, maxLength = 80): string => {
  const normalized = text.trim().replace(/\s+/g, " ")
  if (!normalized) return ""
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}

/**
 * 从会话消息列表中提取扁平化执行步骤链（Execution Steps Ledger）。
 */
export const buildExecutionSteps = (messages: readonly ChatMessage[]): ExecutionStep[] => {
  const steps: ExecutionStep[] = []
  if (!messages || messages.length === 0) {
    return steps
  }

  // 1. 收集所有工具结果块，建立 toolCallId 索引表。
  const toolResultsByCallId = new Map<string, Extract<ChatBlock, { kind: "toolResult" }>>()
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.kind === "toolResult") {
        toolResultsByCallId.set(block.toolCallId, block)
      }
    }
  }

  const handledToolCallIds = new Set<string>()
  let currentTurn = 0
  let stepIndex = 0

  for (const message of messages) {
    // 处理用户轮次开始
    if (message.role === "user") {
      currentTurn++
      stepIndex++

      const textBlocks = message.blocks.filter(
        (b): b is Extract<ChatBlock, { kind: "text" }> => b.kind === "text",
      )
      const userText = textBlocks.map((b) => b.text).join("\n")

      steps.push({
        id: `step-${stepIndex}-user`,
        turnIndex: currentTurn,
        stepIndex,
        kind: "user",
        title: formatPreview(userText || "(empty prompt)", 90),
        status: "done",
        timestamp: message.timestamp,
        userContent: {
          text: userText,
          files: message.files,
          command: message.command,
        },
      })
      continue
    }

    // 处理上下文压缩摘要
    if (message.role === "compactionSummary") {
      stepIndex++
      const turn = currentTurn > 0 ? currentTurn : 1
      steps.push({
        id: `step-${stepIndex}-compaction`,
        turnIndex: turn,
        stepIndex,
        kind: "compaction",
        title: "上下文压缩",
        subtitle: message.summaryTokens ? `压缩后约 ${message.summaryTokens} tokens` : undefined,
        status: "done",
        timestamp: message.timestamp,
        tokens: message.compactionUsage
          ? {
              input: message.compactionUsage.input,
              output: message.compactionUsage.output,
              total: message.compactionUsage.input + message.compactionUsage.output,
            }
          : undefined,
        compactionContent: {
          isManual: message.isManual,
          compactionUsage: message.compactionUsage,
          summaryTokens: message.summaryTokens,
        },
      })
      continue
    }

    // 处理助手消息或工具消息
    const turn = currentTurn > 0 ? currentTurn : 1

    for (let blockIdx = 0; blockIdx < message.blocks.length; blockIdx++) {
      const block = message.blocks[blockIdx]

      // 思考过程
      if (block.kind === "thinking") {
        if (!block.text.trim()) continue
        stepIndex++
        steps.push({
          id: `step-${stepIndex}-thinking`,
          turnIndex: turn,
          stepIndex,
          kind: "thinking",
          title: "思考过程",
          subtitle: formatPreview(block.text, 80),
          status: "done",
          timestamp: message.timestamp,
          thinkingContent: {
            text: block.text,
          },
        })
        continue
      }

      // 工具调用
      if (block.kind === "toolCall") {
        handledToolCallIds.add(block.toolCallId)
        stepIndex++
        const pairedResult = toolResultsByCallId.get(block.toolCallId)
        const isSubagent =
          block.toolName === "task" ||
          block.subagent !== undefined ||
          pairedResult?.subagent !== undefined

        let status: ExecutionStepStatus = "done"
        if (pairedResult?.isError || block.status === "error") {
          status = "error"
        } else if (block.status === "running" && !pairedResult) {
          status = "running"
        }

        if (isSubagent) {
          const subagentData = block.subagent ?? pairedResult?.subagent
          const subagentName = subagentData?.name || block.toolName
          steps.push({
            id: `step-${stepIndex}-subagent-${block.toolCallId}`,
            turnIndex: turn,
            stepIndex,
            kind: "subagent",
            title: `Subagent: ${subagentName}`,
            subtitle: subagentData?.description
              ? formatPreview(subagentData.description, 60)
              : undefined,
            status,
            timestamp: message.timestamp,
            tokens: subagentData?.usage
              ? {
                  input: subagentData.usage.input,
                  output: subagentData.usage.output,
                  total: subagentData.usage.totalTokens,
                }
              : undefined,
            subagentContent: {
              name: subagentName,
              subagent: subagentData,
            },
            toolContent: {
              toolName: block.toolName,
              args: block.args,
              result: pairedResult?.text,
              isError: pairedResult?.isError,
              diff: pairedResult?.diff,
              lsp: pairedResult?.lsp,
            },
          })
        } else {
          steps.push({
            id: `step-${stepIndex}-tool-${block.toolCallId}`,
            turnIndex: turn,
            stepIndex,
            kind: "tool",
            title: `Tool: ${block.toolName}`,
            subtitle: formatPreview(JSON.stringify(block.args), 60),
            status,
            timestamp: message.timestamp,
            toolContent: {
              toolName: block.toolName,
              args: block.args,
              result: pairedResult?.text,
              isError: pairedResult?.isError,
              diff: pairedResult?.diff,
              lsp: pairedResult?.lsp,
            },
          })
        }
        continue
      }

      // 文本回复
      if (block.kind === "text") {
        if (!block.text.trim()) continue
        stepIndex++
        steps.push({
          id: `step-${stepIndex}-assistant`,
          turnIndex: turn,
          stepIndex,
          kind: "assistant",
          title: "助手回复",
          subtitle: formatPreview(block.text, 80),
          status: message.isStreaming ? "running" : "done",
          timestamp: message.timestamp,
          tokens: message.usage
            ? {
                input: message.usage.input,
                output: message.usage.output,
                total: message.usage.totalTokens,
              }
            : undefined,
          assistantContent: {
            text: block.text,
            model: message.model,
            provider: message.provider,
            stopReason: message.stopReason,
            usage: message.usage,
          },
        })
        continue
      }

      // 未配对的孤立 toolResult
      if (block.kind === "toolResult") {
        if (handledToolCallIds.has(block.toolCallId)) continue
        handledToolCallIds.add(block.toolCallId)
        stepIndex++
        steps.push({
          id: `step-${stepIndex}-orphan-result-${block.toolCallId}`,
          turnIndex: turn,
          stepIndex,
          kind: "tool",
          title: `Tool Result: ${block.toolName}`,
          subtitle: formatPreview(block.text, 60),
          status: block.isError ? "error" : "done",
          timestamp: message.timestamp,
          toolContent: {
            toolName: block.toolName,
            args: {},
            result: block.text,
            isError: block.isError,
            diff: block.diff,
            lsp: block.lsp,
          },
        })
      }
    }
  }

  return steps
}

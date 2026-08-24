import type { PromptAssembly } from "@shared/contracts/agent"
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
export const buildExecutionSteps = (
  messages: readonly ChatMessage[],
  promptAssembly?: PromptAssembly | null,
): ExecutionStep[] => {
  const steps: ExecutionStep[] = []

  // 0. 若存在系统提示词装配，注入步骤 0 (System & Injections)
  if (
    promptAssembly &&
    (promptAssembly.sections.length > 0 ||
      promptAssembly.contexts.length > 0 ||
      promptAssembly.rendered.trim().length > 0)
  ) {
    steps.push({
      id: "step-0-system-prompt",
      turnIndex: 0,
      stepIndex: 0,
      kind: "system",
      title: "System & Injections",
      subtitle: `${promptAssembly.sections.length} sections, ${promptAssembly.contexts.length} contexts`,
      status: "done",
      systemContent: {
        sections: promptAssembly.sections,
        contexts: promptAssembly.contexts,
        variables: promptAssembly.variables,
        activeTools: promptAssembly.activeTools,
        rendered: promptAssembly.rendered,
      },
    })
  }

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
          isSteer: message.isSteer,
        },
      })
      continue
    }

    // 处理上下文压缩摘要
    if (message.role === "compactionSummary") {
      stepIndex++
      const turn = currentTurn > 0 ? currentTurn : 1
      const summaryText =
        message.blocks.find((b): b is Extract<ChatBlock, { kind: "text" }> => b.kind === "text")
          ?.text ?? ""
      const isCompactingNow = Boolean(message.isCompacting)
      steps.push({
        id: `step-${stepIndex}-compaction`,
        turnIndex: turn,
        stepIndex,
        kind: "compaction",
        title: isCompactingNow
          ? message.isManual
            ? "Compressing context manually..."
            : "Compressing context automatically..."
          : "Context Compaction",
        subtitle: message.summaryTokens ? `${message.summaryTokens} tokens` : undefined,
        status: isCompactingNow ? "running" : "done",
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
        assistantContent: summaryText ? { text: summaryText } : undefined,
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
          title: formatPreview(block.text, 90),
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
            title: subagentName,
            subtitle: subagentData?.description
              ? formatPreview(subagentData.description, 60)
              : undefined,
            status,
            timestamp: message.timestamp,
            durationMs: pairedResult?.durationMs,
            tokens: subagentData?.usage
              ? {
                  input: subagentData.usage.input,
                  output: subagentData.usage.output,
                  cacheRead: subagentData.usage.cacheRead,
                  total: subagentData.usage.totalTokens,
                }
              : undefined,
            subagentContent: {
              name: subagentName,
              subagent: subagentData,
            },
            toolContent: {
              toolName: block.toolName,
              toolCallId: block.toolCallId,
              args: block.args,
              result: pairedResult?.text,
              isError: pairedResult?.isError,
              durationMs: pairedResult?.durationMs,
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
            title: block.toolName,
            subtitle: formatPreview(JSON.stringify(block.args), 60),
            status,
            timestamp: message.timestamp,
            durationMs: pairedResult?.durationMs,
            toolContent: {
              toolName: block.toolName,
              toolCallId: block.toolCallId,
              args: block.args,
              result: pairedResult?.text,
              isError: pairedResult?.isError,
              durationMs: pairedResult?.durationMs,
              diff: pairedResult?.diff,
              lsp: pairedResult?.lsp,
              question: block.question,
              answers: block.answers,
            },
          })
        }
        continue
      }

      // 文本回复
      if (block.kind === "text") {
        if (!block.text.trim() && !message.isStreaming) continue
        stepIndex++
        steps.push({
          id: `step-${stepIndex}-assistant`,
          turnIndex: turn,
          stepIndex,
          kind: "assistant",
          title: message.isStreaming ? "..." : formatPreview(block.text, 90),
          status: message.isStreaming ? "running" : "done",
          timestamp: message.timestamp,
          durationMs: message.durationMs,
          model: message.model,
          tokens: message.usage
            ? {
                input: message.usage.input,
                output: message.usage.output,
                cacheRead: message.usage.cacheRead,
                total: message.usage.totalTokens,
              }
            : undefined,
          assistantContent: message.isStreaming
            ? undefined
            : {
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
          title: block.toolName,
          subtitle: formatPreview(block.text, 60),
          status: block.isError ? "error" : "done",
          timestamp: message.timestamp,
          durationMs: block.durationMs,
          toolContent: {
            toolName: block.toolName,
            toolCallId: block.toolCallId,
            args: {},
            result: block.text,
            isError: block.isError,
            durationMs: block.durationMs,
            diff: block.diff,
            lsp: block.lsp,
          },
        })
      }
    }

    // 处理助手消息异常停止或用户中止说明项
    const errorMessage = message.error
    const isAborted = message.stopReason === "aborted"
    const isErrorStop = message.stopReason === "error" || Boolean(errorMessage)

    if (message.role === "assistant" && (isErrorStop || isAborted)) {
      stepIndex++
      if (isAborted && !errorMessage) {
        steps.push({
          id: `step-${stepIndex}-aborted`,
          turnIndex: turn,
          stepIndex,
          kind: "error",
          title: "Generation cancelled",
          status: "error",
          timestamp: message.timestamp,
          errorContent: {
            message: "Generation was cancelled by user.",
            stopReason: "aborted",
            isAborted: true,
          },
        })
      } else {
        const errorText = errorMessage || "Agent execution failed"
        steps.push({
          id: `step-${stepIndex}-error`,
          turnIndex: turn,
          stepIndex,
          kind: "error",
          title: formatPreview(errorText, 90),
          status: "error",
          timestamp: message.timestamp,
          errorContent: {
            message: errorText,
            stopReason: message.stopReason,
            isAborted: false,
          },
        })
      }
    }
  }

  return steps
}

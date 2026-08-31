import type { PromptAssembly } from "@shared/contracts/agent"
import { getModelDisplayName } from "./hooks/modelsStore"
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

  // 1. 收集所有工具结果块，建立 toolCallId 索引表（携带所属消息的时间戳）。
  const toolResultsByCallId = new Map<
    string,
    { block: Extract<ChatBlock, { kind: "toolResult" }>; timestamp?: number }
  >()
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.kind === "toolResult") {
        toolResultsByCallId.set(block.toolCallId, { block, timestamp: message.timestamp })
      }
    }
  }

  const handledToolCallIds = new Set<string>()
  let currentTurn = 0
  let stepIndex = steps.length > 0 ? 0 : -1
  let lastTurnForParallelBatch = -1
  let turnParallelBatchCount = 0

  for (const message of messages) {
    // 处理上下文压缩摘要（独立步骤，不计入对话轮次）
    if (message.role === "compactionSummary") {
      stepIndex++
      const summaryText =
        message.blocks.find((b): b is Extract<ChatBlock, { kind: "text" }> => b.kind === "text")
          ?.text ?? ""
      const isCompactingNow = Boolean(message.isCompacting)
      steps.push({
        id: `step-${stepIndex}-compaction`,
        turnIndex: 0,
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
        startedAt: message.timestamp,
        completedAt: message.timestamp,
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

    // 处理撤销/删除摘要（独立步骤，不计入对话轮次）
    if (message.role === "undoSummary") {
      stepIndex++
      const payload = message.undoPayload
      const title = "Turn Undone / Reverted"
      const subtitle = payload
        ? `${payload.toolCallCount ?? 0} tools, ${payload.fileChangeCount ?? 0} files`
        : undefined
      steps.push({
        id: `step-${stepIndex}-undo`,
        turnIndex: 0,
        stepIndex,
        kind: "undo",
        title,
        subtitle,
        status: "done",
        timestamp: message.timestamp,
        startedAt: message.timestamp,
        completedAt: message.timestamp,
        undoContent: {
          userPrompt: payload?.userPrompt,
          files: payload?.files,
          assistantSnippet: payload?.assistantSnippet,
          modelName: payload?.modelName,
          turnDurationMs: payload?.turnDurationMs,
          diffs: payload?.diffs,
          toolCalls: payload?.toolCalls,
          toolCallCount: payload?.toolCallCount,
          fileChangeCount: payload?.fileChangeCount,
          undoneAt: payload?.undoneAt,
        },
      })
      continue
    }

    // 处理模型切换 / 初始模型注入（独立步骤，不计入对话轮次）
    if (message.role === "modelSwitch") {
      stepIndex++
      const isInitial = message.isInitial === true
      const rawModel = message.model || "Unknown Model"
      const modelDisplayName = getModelDisplayName(message.model, message.provider) || rawModel
      steps.push({
        id: `step-${stepIndex}-model-switch`,
        turnIndex: 0,
        stepIndex,
        kind: "modelSwitch",
        title: isInitial
          ? `Initial Model: ${modelDisplayName}`
          : `Model Switched: ${modelDisplayName}`,
        subtitle: message.provider
          ? `Provider: ${message.provider}${message.family ? ` (${message.family})` : ""}`
          : undefined,
        status: "done",
        timestamp: message.timestamp,
        startedAt: message.timestamp,
        completedAt: message.timestamp,
        model: message.model,
        modelSwitchContent: {
          provider: message.provider,
          model: message.model,
          family: message.family,
          instructions: message.instructions,
          isInitial: message.isInitial,
        },
      })
      continue
    }

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
        status: "running",
        timestamp: message.timestamp,
        startedAt: message.timestamp,
        completedAt: message.timestamp,
        userContent: {
          text: userText,
          files: message.files,
          command: message.command,
          isSteer: message.isSteer,
        },
      })
      continue
    }

    // 处理助手消息或工具消息
    const turn = currentTurn > 0 ? currentTurn : 1
    let currentBlockStartedAt = message.firstChunkTimestamp ?? message.timestamp
    const hasTextBlock = message.blocks.some((b) => b.kind === "text" && Boolean(b.text.trim()))
    const toolCallBlocksCount = message.blocks.filter((b) => b.kind === "toolCall").length
    let toolCallIndexInMessage = 0

    if (turn !== lastTurnForParallelBatch) {
      lastTurnForParallelBatch = turn
      turnParallelBatchCount = 0
    }

    const currentBatchIndexInTurn = toolCallBlocksCount > 1 ? turnParallelBatchCount++ : undefined

    for (let blockIdx = 0; blockIdx < message.blocks.length; blockIdx++) {
      const block = message.blocks[blockIdx]

      // 思考过程
      if (block.kind === "thinking") {
        if (!block.text.trim()) continue
        stepIndex++
        const thinkingDuration = block.durationMs ?? message.durationMs
        const isRunning =
          message.isStreaming &&
          blockIdx === message.blocks.length - 1 &&
          block.durationMs === undefined
        const start = currentBlockStartedAt ?? message.timestamp
        const completed =
          start !== undefined && thinkingDuration !== undefined
            ? start + thinkingDuration
            : undefined
        if (completed !== undefined) {
          currentBlockStartedAt = completed
        }
        steps.push({
          id: `step-${stepIndex}-thinking`,
          turnIndex: turn,
          stepIndex,
          kind: "thinking",
          title:
            message.isStreaming && block.durationMs === undefined
              ? "..."
              : formatPreview(block.text, 90) || "...",
          status: isRunning ? "running" : "done",
          timestamp: start ?? message.timestamp,
          startedAt: start,
          completedAt: completed,
          durationMs: thinkingDuration,
          tokens:
            !hasTextBlock && toolCallBlocksCount === 0 && message.usage
              ? {
                  input: message.usage.input,
                  output: message.usage.output,
                  cacheRead: message.usage.cacheRead,
                  total: message.usage.totalTokens,
                }
              : undefined,
          thinkingContent: {
            text: block.text,
          },
        })
        continue
      }

      // 工具调用
      if (block.kind === "toolCall") {
        toolCallIndexInMessage++
        handledToolCallIds.add(block.toolCallId)
        stepIndex++
        const paired = toolResultsByCallId.get(block.toolCallId)
        const pairedResult = paired?.block
        const pairedTimestamp = paired?.timestamp
        const isSubagent =
          block.toolName === "task" ||
          block.subagent !== undefined ||
          pairedResult?.subagent !== undefined

        let status: ExecutionStepStatus = "done"
        if (pairedResult?.isError || block.status === "error") {
          status = "error"
        } else if (pairedResult) {
          status = "done"
        } else if (block.status === "done") {
          status = "done"
        } else if (
          message.error ||
          message.stopReason === "error" ||
          message.stopReason === "aborted"
        ) {
          status = "error"
        } else {
          status = "running"
        }

        const toolDuration = pairedResult?.durationMs
        const toolCompletedAt = pairedTimestamp
        const toolStartedAt =
          toolCompletedAt !== undefined && toolDuration !== undefined
            ? toolCompletedAt - toolDuration
            : (currentBlockStartedAt ?? message.timestamp)
        if (toolCompletedAt !== undefined) {
          currentBlockStartedAt = toolCompletedAt
        }

        const parallelMeta =
          toolCallBlocksCount > 1
            ? {
                index: toolCallIndexInMessage,
                total: toolCallBlocksCount,
                batchId: message.id,
                batchIndex: currentBatchIndexInTurn ?? 0,
              }
            : undefined

        const toolTokens =
          !hasTextBlock && message.usage
            ? toolCallBlocksCount > 1
              ? {
                  input: Math.round(message.usage.input / toolCallBlocksCount),
                  output: Math.round(message.usage.output / toolCallBlocksCount),
                  cacheRead:
                    message.usage.cacheRead !== undefined
                      ? Math.round(message.usage.cacheRead / toolCallBlocksCount)
                      : undefined,
                  total: Math.round(message.usage.totalTokens / toolCallBlocksCount),
                }
              : {
                  input: message.usage.input,
                  output: message.usage.output,
                  cacheRead: message.usage.cacheRead,
                  total: message.usage.totalTokens,
                }
            : undefined

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
            timestamp: toolStartedAt ?? message.timestamp,
            startedAt: toolStartedAt,
            completedAt: toolCompletedAt,
            durationMs: toolDuration,
            parallel: parallelMeta,
            tokens: subagentData?.usage
              ? {
                  input: subagentData.usage.input,
                  output: subagentData.usage.output,
                  cacheRead: subagentData.usage.cacheRead,
                  total: subagentData.usage.totalTokens,
                }
              : toolTokens,
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
              durationMs: toolDuration,
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
            timestamp: toolStartedAt ?? message.timestamp,
            startedAt: toolStartedAt,
            completedAt: toolCompletedAt,
            durationMs: toolDuration,
            parallel: parallelMeta,
            tokens: toolTokens,
            toolContent: {
              toolName: block.toolName,
              toolCallId: block.toolCallId,
              args: block.args,
              result: pairedResult?.text,
              isError: pairedResult?.isError,
              durationMs: toolDuration,
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
        if (!block.text.trim()) continue
        stepIndex++
        const textDuration = block.durationMs ?? message.durationMs
        const isRunning =
          message.isStreaming &&
          blockIdx === message.blocks.length - 1 &&
          block.durationMs === undefined
        const start = currentBlockStartedAt ?? message.timestamp
        const completed =
          start !== undefined && textDuration !== undefined ? start + textDuration : undefined
        if (completed !== undefined) {
          currentBlockStartedAt = completed
        }
        steps.push({
          id: `step-${stepIndex}-assistant`,
          turnIndex: turn,
          stepIndex,
          kind: "assistant",
          title:
            message.isStreaming && block.durationMs === undefined
              ? "..."
              : formatPreview(block.text, 90) || "...",
          status: isRunning ? "running" : "done",
          timestamp: start ?? message.timestamp,
          startedAt: start,
          completedAt: completed,
          durationMs: textDuration,
          model: message.model,
          tokens: message.usage
            ? {
                input: message.usage.input,
                output: message.usage.output,
                cacheRead: message.usage.cacheRead,
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
        const orphanStartedAt =
          message.timestamp !== undefined && block.durationMs !== undefined
            ? message.timestamp - block.durationMs
            : message.timestamp
        steps.push({
          id: `step-${stepIndex}-orphan-result-${block.toolCallId}`,
          turnIndex: turn,
          stepIndex,
          kind: "tool",
          title: block.toolName,
          subtitle: formatPreview(block.text, 60),
          status: block.isError ? "error" : "done",
          timestamp: message.timestamp,
          startedAt: orphanStartedAt,
          completedAt: message.timestamp,
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
          startedAt: message.timestamp,
          completedAt: message.timestamp,
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
          startedAt: message.timestamp,
          completedAt: message.timestamp,
          errorContent: {
            message: errorText,
            stopReason: message.stopReason,
            isAborted: false,
          },
        })
      }
    }
  }

  // 2. 第二阶段：单次线性扫描，计算流水线步进跨度（stepSpanMs）与 Agent 响应开销（agentOverheadMs）
  // 规则：item i-1 到 item i 之间的间隔时间（模型推理、生成、工具准备开销）归属于 item i。
  let lastCompletedAt: number | undefined

  for (let i = 0; i < steps.length; i++) {
    const current = steps[i]
    if (current.kind === "system") {
      lastCompletedAt = current.completedAt ?? current.timestamp
      continue
    }

    const currentCompleted =
      current.completedAt ??
      (current.startedAt !== undefined && current.durationMs !== undefined
        ? current.startedAt + current.durationMs
        : (current.startedAt ?? current.timestamp))

    if (current.kind === "user") {
      const next = steps[i + 1]
      const userStart = current.startedAt ?? current.timestamp
      const nextStart = next?.startedAt ?? next?.timestamp

      if (next) {
        current.status = "done"
        if (userStart !== undefined && nextStart !== undefined && nextStart >= userStart) {
          const responseTime = nextStart - userStart
          current.durationMs = responseTime
          current.stepSpanMs = responseTime
          current.agentOverheadMs = undefined
          current.completedAt = nextStart
          lastCompletedAt = nextStart
        } else {
          current.durationMs = undefined
          current.stepSpanMs = 0
          current.agentOverheadMs = undefined
          current.completedAt = current.startedAt ?? current.timestamp
          if (current.completedAt !== undefined) {
            lastCompletedAt = current.completedAt
          }
        }
      } else {
        current.status = "running"
        current.durationMs = undefined
        current.stepSpanMs = 0
        current.agentOverheadMs = undefined
        if (current.startedAt !== undefined) {
          lastCompletedAt = current.startedAt
        }
      }
      continue
    }

    if (
      lastCompletedAt !== undefined &&
      currentCompleted !== undefined &&
      currentCompleted >= lastCompletedAt
    ) {
      const span = currentCompleted - lastCompletedAt
      current.stepSpanMs = span
      if (current.durationMs !== undefined) {
        current.agentOverheadMs = Math.max(0, span - current.durationMs)
      } else {
        current.durationMs = span
        current.agentOverheadMs = 0
      }
    } else if (current.durationMs !== undefined) {
      current.stepSpanMs = current.durationMs
      current.agentOverheadMs = 0
    }

    if (currentCompleted !== undefined) {
      lastCompletedAt = currentCompleted
    }
  }

  return steps
}

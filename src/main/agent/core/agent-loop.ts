/**
 * Agent 低层循环。
 * 全程以 AgentMessage 工作，仅在 LLM 调用边界转换为 LlmMessage。
 */

import type {
  AgentDiff,
  AgentMessage,
  AssistantMessage,
  LspToolDetails,
  QuestionAnswer,
  SubagentData,
  ToolCall,
  ToolResultMessage,
} from "@shared/contracts/agent"
import { getDefaultStreamFn } from "./stream-fn"
import type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentTool,
  AgentToolCall,
  AgentToolResult,
  StreamFn,
} from "./types"
import { findTool, validateToolArguments } from "./validate"

// Agent 事件接收器。
export type AgentEventSink = (event: AgentEvent) => Promise<void> | void

// 运行一个带新 prompt 的 agent 循环：prompt 加入上下文并为其发出事件。
export async function runAgentLoop(
  prompts: AgentMessage[],
  context: AgentContext,
  config: AgentLoopConfig,
  emit: AgentEventSink,
  signal: AbortSignal | undefined,
  streamFn: StreamFn,
): Promise<AgentMessage[]> {
  const newMessages: AgentMessage[] = [...prompts]
  const currentContext: AgentContext = {
    ...context,
    messages: [...context.messages, ...prompts],
  }

  await emit({ type: "agent_start" })
  await emit({ type: "turn_start" })
  for (const prompt of prompts) {
    await emit({ type: "message_start", message: prompt })
    await emit({ type: "message_end", message: prompt })
  }

  await runLoop(currentContext, newMessages, config, signal, emit, streamFn ?? getDefaultStreamFn())
  return newMessages
}

// 从当前上下文继续 agent 循环（不添加新消息），用于工具结果后继续。
export async function runAgentLoopContinue(
  context: AgentContext,
  config: AgentLoopConfig,
  emit: AgentEventSink,
  signal: AbortSignal | undefined,
  streamFn: StreamFn,
): Promise<AgentMessage[]> {
  if (context.messages.length === 0) {
    throw new Error("Cannot continue: no messages in context")
  }

  if (context.messages[context.messages.length - 1]!.role === "assistant") {
    throw new Error("Cannot continue from message role: assistant")
  }

  const newMessages: AgentMessage[] = []
  const currentContext: AgentContext = { ...context }

  await emit({ type: "agent_start" })
  await emit({ type: "turn_start" })

  await runLoop(currentContext, newMessages, config, signal, emit, streamFn ?? getDefaultStreamFn())
  return newMessages
}

// 主循环逻辑：外循环处理 follow-up 消息，内循环处理工具调用与 steer 消息。
async function runLoop(
  initialContext: AgentContext,
  newMessages: AgentMessage[],
  initialConfig: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
  streamFunction: StreamFn,
): Promise<void> {
  let currentContext = initialContext
  let config = initialConfig
  let firstTurn = true
  let pendingMessages: AgentMessage[] = (await config.getSteeringMessages?.()) || []

  while (true) {
    let hasMoreToolCalls = true

    while (hasMoreToolCalls || pendingMessages.length > 0) {
      if (!firstTurn) {
        await emit({ type: "turn_start" })
      } else {
        firstTurn = false
      }

      // 注入待处理消息（steer/队列消息）。
      if (pendingMessages.length > 0) {
        for (const message of pendingMessages) {
          await emit({ type: "message_start", message })
          await emit({ type: "message_end", message })
          currentContext.messages.push(message)
          newMessages.push(message)
        }
        pendingMessages = []
      }

      const message = await streamAssistantResponse(
        currentContext,
        config,
        signal,
        emit,
        streamFunction,
      )
      newMessages.push(message)

      if (message.stopReason === "error" || message.stopReason === "aborted") {
        await emit({ type: "turn_end", message, toolResults: [] })
        await emit({ type: "agent_end", messages: newMessages })
        return
      }

      const toolCalls = message.content.filter((c) => c.type === "toolCall")

      const toolResults: ToolResultMessage[] = []
      hasMoreToolCalls = false
      if (toolCalls.length > 0) {
        // "length" 停止说明输出被 token 上限截断，所有工具调用参数可能不完整，全部按错误处理。
        const executedToolBatch =
          message.stopReason === "length"
            ? await failToolCallsFromTruncatedMessage(toolCalls, emit)
            : await executeToolCalls(currentContext, message, config, signal, emit)
        toolResults.push(...executedToolBatch.messages)
        hasMoreToolCalls = !executedToolBatch.terminate

        for (const result of toolResults) {
          currentContext.messages.push(result)
          newMessages.push(result)
        }
      }

      await emit({ type: "turn_end", message, toolResults })

      const nextTurnContext = {
        message,
        toolResults,
        context: currentContext,
        newMessages,
      }
      const nextTurnSnapshot = await config.prepareNextTurn?.(nextTurnContext)
      if (nextTurnSnapshot) {
        currentContext = nextTurnSnapshot.context ?? currentContext
        config = {
          ...config,
          model: nextTurnSnapshot.model ?? config.model,
          reasoning:
            nextTurnSnapshot.thinkingLevel === undefined
              ? config.reasoning
              : nextTurnSnapshot.thinkingLevel === "off"
                ? undefined
                : nextTurnSnapshot.thinkingLevel,
        }
      }

      if (
        await config.shouldStopAfterTurn?.({
          message,
          toolResults,
          context: currentContext,
          newMessages,
        })
      ) {
        await emit({ type: "agent_end", messages: newMessages })
        return
      }

      pendingMessages = (await config.getSteeringMessages?.()) || []
    }

    // Agent 将停止：检查 follow-up 消息。
    const followUpMessages = (await config.getFollowUpMessages?.()) || []
    if (followUpMessages.length > 0) {
      pendingMessages = followUpMessages
      continue
    }

    break
  }

  await emit({ type: "agent_end", messages: newMessages })
}

// 流式请求一条助手回复（AgentMessage[] → LlmMessage[] 转换发生在 LLM 调用边界）。
async function streamAssistantResponse(
  context: AgentContext,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
  streamFunction: StreamFn,
): Promise<AssistantMessage> {
  let messages = context.messages
  if (config.transformContext) {
    messages = await config.transformContext(messages, signal)
  }

  const llmMessages = await config.convertToLlm(messages)

  const resolvedApiKey =
    (config.getApiKey ? await config.getApiKey(config.model.provider) : undefined) || config.apiKey

  const response = await streamFunction(
    config.model,
    { systemPrompt: context.systemPrompt, messages: llmMessages, tools: context.tools },
    {
      ...config,
      apiKey: resolvedApiKey,
      signal,
    },
  )

  let partialMessage: AssistantMessage | null = null
  let addedPartial = false

  for await (const event of response) {
    switch (event.type) {
      case "start": {
        const partial = event.partial
        partialMessage = partial
        context.messages.push(partial)
        addedPartial = true
        await emit({ type: "message_start", message: { ...partial } })
        break
      }

      case "text_start":
      case "text_delta":
      case "text_end":
      case "thinking_start":
      case "thinking_delta":
      case "thinking_end":
      case "toolcall_start":
      case "toolcall_delta":
      case "toolcall_end":
        if (partialMessage) {
          const partial = event.partial
          partialMessage = partial
          context.messages[context.messages.length - 1] = partial
          await emit({
            type: "message_update",
            assistantMessageEvent: event,
            message: { ...partial },
          })
        }
        break

      case "done":
      case "error": {
        const finalMessage = await response.result()
        if (addedPartial) {
          context.messages[context.messages.length - 1] = finalMessage
        } else {
          context.messages.push(finalMessage)
        }
        if (!addedPartial) {
          await emit({ type: "message_start", message: { ...finalMessage } })
        }
        await emit({ type: "message_end", message: finalMessage })
        return finalMessage
      }
    }
  }

  const finalMessage = await response.result()
  if (addedPartial) {
    context.messages[context.messages.length - 1] = finalMessage
  } else {
    context.messages.push(finalMessage)
    await emit({ type: "message_start", message: { ...finalMessage } })
  }
  await emit({ type: "message_end", message: finalMessage })
  return finalMessage
}

type ExecutedToolCallBatch = {
  messages: ToolResultMessage[]
  terminate: boolean
}

// 输出被截断时全部工具调用按错误处理。
async function failToolCallsFromTruncatedMessage(
  toolCalls: AgentToolCall[],
  emit: AgentEventSink,
): Promise<ExecutedToolCallBatch> {
  const messages: ToolResultMessage[] = []
  for (const toolCall of toolCalls) {
    await emit({
      type: "tool_execution_start",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    })
    const finalized: FinalizedToolCallOutcome = {
      toolCall,
      result: createErrorToolResult(
        `Tool call "${toolCall.name}" was not executed: the response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.`,
      ),
      isError: true,
    }
    await emitToolExecutionEnd(finalized, emit)
    const toolResultMessage = createToolResultMessage(finalized)
    await emitToolResultMessage(toolResultMessage, emit)
    messages.push(toolResultMessage)
  }
  return { messages, terminate: false }
}

// 执行一条助手消息中的工具调用。
async function executeToolCalls(
  currentContext: AgentContext,
  assistantMessage: AssistantMessage,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ExecutedToolCallBatch> {
  const toolCalls = assistantMessage.content.filter((c) => c.type === "toolCall")
  const hasSequentialToolCall = toolCalls.some(
    (tc) => findTool(currentContext.tools, tc.name)?.executionMode === "sequential",
  )
  if (config.toolExecution === "sequential" || hasSequentialToolCall) {
    return executeToolCallsSequential(
      currentContext,
      assistantMessage,
      toolCalls,
      config,
      signal,
      emit,
    )
  }
  return executeToolCallsParallel(currentContext, assistantMessage, toolCalls, config, signal, emit)
}

type FinalizedToolCallOutcome = {
  toolCall: AgentToolCall
  result: AgentToolResult<any>
  isError: boolean
}

type FinalizedToolCallEntry = FinalizedToolCallOutcome | (() => Promise<FinalizedToolCallOutcome>)

// 顺序执行工具调用。
async function executeToolCallsSequential(
  currentContext: AgentContext,
  assistantMessage: AssistantMessage,
  toolCalls: AgentToolCall[],
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ExecutedToolCallBatch> {
  const finalizedCalls: FinalizedToolCallOutcome[] = []
  const messages: ToolResultMessage[] = []

  for (const toolCall of toolCalls) {
    await emit({
      type: "tool_execution_start",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    })

    const preparation = await prepareToolCall(
      currentContext,
      assistantMessage,
      toolCall,
      config,
      signal,
    )
    let finalized: FinalizedToolCallOutcome
    if (preparation.kind === "immediate") {
      finalized = {
        toolCall,
        result: preparation.result,
        isError: preparation.isError,
      }
    } else {
      const executed = await executePreparedToolCall(preparation, signal, emit)
      finalized = await finalizeExecutedToolCall(
        currentContext,
        assistantMessage,
        preparation,
        executed,
        config,
        signal,
      )
    }

    await emitToolExecutionEnd(finalized, emit)
    const toolResultMessage = createToolResultMessage(finalized)
    await emitToolResultMessage(toolResultMessage, emit)
    finalizedCalls.push(finalized)
    messages.push(toolResultMessage)

    if (signal?.aborted) {
      break
    }
  }

  return {
    messages,
    terminate: shouldTerminateToolBatch(finalizedCalls),
  }
}

// 并行执行工具调用（预检串行，执行并发）。
async function executeToolCallsParallel(
  currentContext: AgentContext,
  assistantMessage: AssistantMessage,
  toolCalls: AgentToolCall[],
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ExecutedToolCallBatch> {
  const finalizedCalls: FinalizedToolCallEntry[] = []

  for (const toolCall of toolCalls) {
    await emit({
      type: "tool_execution_start",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    })

    const preparation = await prepareToolCall(
      currentContext,
      assistantMessage,
      toolCall,
      config,
      signal,
    )
    if (preparation.kind === "immediate") {
      const finalized = {
        toolCall,
        result: preparation.result,
        isError: preparation.isError,
      } satisfies FinalizedToolCallOutcome
      await emitToolExecutionEnd(finalized, emit)
      finalizedCalls.push(finalized)
      if (signal?.aborted) {
        break
      }
      continue
    }

    finalizedCalls.push(async () => {
      const executed = await executePreparedToolCall(preparation, signal, emit)
      const finalized = await finalizeExecutedToolCall(
        currentContext,
        assistantMessage,
        preparation,
        executed,
        config,
        signal,
      )
      attachQuestionAnswers(assistantMessage, finalized)
      await emitToolExecutionEnd(finalized, emit)
      return finalized
    })
    if (signal?.aborted) {
      break
    }
  }

  const orderedFinalizedCalls = await Promise.all(
    finalizedCalls.map((entry) => (typeof entry === "function" ? entry() : Promise.resolve(entry))),
  )
  const messages: ToolResultMessage[] = []
  for (const finalized of orderedFinalizedCalls) {
    const toolResultMessage = createToolResultMessage(finalized)
    await emitToolResultMessage(toolResultMessage, emit)
    messages.push(toolResultMessage)
  }

  return {
    messages,
    terminate: shouldTerminateToolBatch(orderedFinalizedCalls),
  }
}

type PreparedToolCall = {
  kind: "prepared"
  toolCall: AgentToolCall
  tool: AgentTool<any>
  args: unknown
}

type ImmediateToolCallOutcome = {
  kind: "immediate"
  result: AgentToolResult<any>
  isError: boolean
}

type ExecutedToolCallOutcome = {
  result: AgentToolResult<any>
  isError: boolean
}

// 整批工具调用是否应提前终止。
function shouldTerminateToolBatch(finalizedCalls: FinalizedToolCallOutcome[]): boolean {
  return (
    finalizedCalls.length > 0 &&
    finalizedCalls.every((finalized) => finalized.result.terminate === true)
  )
}

// 准备工具调用：查找工具、参数兼容、校验、beforeToolCall。
async function prepareToolCall(
  currentContext: AgentContext,
  assistantMessage: AssistantMessage,
  toolCall: AgentToolCall,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
): Promise<PreparedToolCall | ImmediateToolCallOutcome> {
  const tool = findTool(currentContext.tools, toolCall.name)
  if (!tool) {
    return {
      kind: "immediate",
      result: createErrorToolResult(`Tool ${toolCall.name} not found`),
      isError: true,
    }
  }

  try {
    const preparedArguments = tool.prepareArguments
      ? tool.prepareArguments(toolCall.arguments)
      : toolCall.arguments
    const preparedToolCall: AgentToolCall =
      preparedArguments === toolCall.arguments
        ? toolCall
        : { ...toolCall, arguments: preparedArguments as Record<string, unknown> }
    const validatedArgs = validateToolArguments(tool, preparedToolCall)
    if (config.beforeToolCall) {
      const beforeResult = await config.beforeToolCall(
        {
          assistantMessage,
          toolCall,
          args: validatedArgs,
          context: currentContext,
        },
        signal,
      )
      if (signal?.aborted) {
        return {
          kind: "immediate",
          result: createErrorToolResult("Operation aborted"),
          isError: true,
        }
      }
      if (beforeResult?.block) {
        return {
          kind: "immediate",
          result: createErrorToolResult(beforeResult.reason || "Tool execution was blocked"),
          isError: true,
        }
      }
    }
    if (signal?.aborted) {
      return {
        kind: "immediate",
        result: createErrorToolResult("Operation aborted"),
        isError: true,
      }
    }
    return {
      kind: "prepared",
      toolCall,
      tool,
      args: validatedArgs,
    }
  } catch (error) {
    return {
      kind: "immediate",
      result: createErrorToolResult(error instanceof Error ? error.message : String(error)),
      isError: true,
    }
  }
}

// 执行准备好的工具调用：捕获异常为错误结果。
async function executePreparedToolCall(
  prepared: PreparedToolCall,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ExecutedToolCallOutcome> {
  const updateEvents: Promise<void>[] = []
  let acceptingUpdates = true

  try {
    const result = await prepared.tool.execute(
      prepared.toolCall.id,
      prepared.args as never,
      signal,
      (partialResult) => {
        if (!acceptingUpdates) return
        updateEvents.push(
          Promise.resolve(
            emit({
              type: "tool_execution_update",
              toolCallId: prepared.toolCall.id,
              toolName: prepared.toolCall.name,
              args: prepared.toolCall.arguments,
              partialResult,
            }),
          ),
        )
      },
    )
    acceptingUpdates = false
    await Promise.all(updateEvents)
    return { result, isError: false }
  } catch (error) {
    acceptingUpdates = false
    await Promise.all(updateEvents)
    return {
      result: createErrorToolResult(error instanceof Error ? error.message : String(error)),
      isError: true,
    }
  } finally {
    acceptingUpdates = false
  }
}

// 工具执行后收尾：afterToolCall 覆盖。
async function finalizeExecutedToolCall(
  currentContext: AgentContext,
  assistantMessage: AssistantMessage,
  prepared: PreparedToolCall,
  executed: ExecutedToolCallOutcome,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
): Promise<FinalizedToolCallOutcome> {
  let result = executed.result
  let isError = executed.isError

  if (config.afterToolCall) {
    try {
      const afterResult = await config.afterToolCall(
        {
          assistantMessage,
          toolCall: prepared.toolCall,
          args: prepared.args,
          result,
          isError,
          context: currentContext,
        },
        signal,
      )
      if (afterResult) {
        result = {
          ...result,
          content: afterResult.content ?? result.content,
          details: afterResult.details ?? result.details,
          terminate: afterResult.terminate ?? result.terminate,
        }
        isError = afterResult.isError ?? isError
      }
    } catch (error) {
      result = createErrorToolResult(error instanceof Error ? error.message : String(error))
      isError = true
    }
  }

  return {
    toolCall: prepared.toolCall,
    result,
    isError,
  }
}

// 构造错误工具结果。
function createErrorToolResult(message: string): AgentToolResult<any> {
  return {
    content: [{ type: "text", text: message }],
    details: {},
  }
}

// 发出 tool_execution_end 事件。
async function emitToolExecutionEnd(
  finalized: FinalizedToolCallOutcome,
  emit: AgentEventSink,
): Promise<void> {
  await emit({
    type: "tool_execution_end",
    toolCallId: finalized.toolCall.id,
    toolName: finalized.toolCall.name,
    result: finalized.result,
    isError: finalized.isError,
  })
}

// 将 question 工具的用户作答回填到 assistant message 的 toolCall block（随消息落库持久化）。
const attachQuestionAnswers = (
  assistantMessage: AssistantMessage,
  finalized: FinalizedToolCallOutcome,
): void => {
  const details = finalized.result.details as { answers?: QuestionAnswer[] } | undefined
  const answers = details?.answers
  if (!answers || answers.length === 0) return
  const block = assistantMessage.content.find(
    (entry): entry is ToolCall => entry.type === "toolCall" && entry.id === finalized.toolCall.id,
  )
  if (block) block.answers = answers
}

// 由工具执行结果构造 ToolResultMessage。
function createToolResultMessage(finalized: FinalizedToolCallOutcome): ToolResultMessage {
  const details = finalized.result.details as
    | { diff?: AgentDiff; subagent?: SubagentData; lsp?: LspToolDetails }
    | undefined
  const diff = details?.diff
  const subagent = details?.subagent
  const lsp = details?.lsp
  return {
    role: "toolResult",
    toolCallId: finalized.toolCall.id,
    toolName: finalized.toolCall.name,
    content: finalized.result.content ?? [],
    isError: finalized.isError,
    timestamp: Date.now(),
    ...(diff ? { diff } : {}),
    ...(subagent ? { subagent } : {}),
    ...(lsp ? { lsp } : {}),
  }
}

// 发出工具结果消息的 message_start/message_end 事件。
async function emitToolResultMessage(
  toolResultMessage: ToolResultMessage,
  emit: AgentEventSink,
): Promise<void> {
  await emit({ type: "message_start", message: toolResultMessage })
  await emit({ type: "message_end", message: toolResultMessage })
}

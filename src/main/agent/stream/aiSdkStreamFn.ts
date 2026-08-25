import type {
  AssistantMessage,
  StopReason,
  TextContent,
  ThinkingContent,
  ToolCall,
  Usage,
} from "@shared/contracts/agent"
import { stepCountIs, streamText } from "ai"
import { createAssistantMessageEventStream } from "@/agent/core/event-stream"
import type { Model, StreamFn } from "@/agent/core/types"
import { DEFAULT_STREAM_IDLE_TIMEOUT_MS, IdleWatchdog } from "@/agent/stream/idleWatchdog"
import { resolveLanguageModel } from "@/agent/stream/modelFactory"
import { toAiTools, toModelMessages } from "@/agent/stream/toModelMessages"

// AI SDK finishReason → 本地 StopReason 映射。
const mapStopReason = (reason: string): StopReason => {
  switch (reason) {
    case "stop":
      return "stop"
    case "length":
      return "length"
    case "tool-calls":
      return "toolUse"
    case "error":
    case "content-filter":
      return "error"
    default:
      return "stop"
  }
}

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, totalTokens: 0 }

// 构造空助手消息。
const createEmptyAssistant = (model: Model): AssistantMessage => ({
  role: "assistant",
  content: [],
  provider: model.provider,
  model: model.id,
  usage: EMPTY_USAGE,
  stopReason: "pending",
  timestamp: Date.now(),
})

/**
 * AI SDK → StreamFn 适配器。
 *
 * 每次调用执行单步生成（stopWhen: stepCountIs(1)），工具调用以 toolcall_end 事件交付，
 * 由 agent-loop 执行工具后回灌上下文。集成 IdleWatchdog 防止流式假死。
 */
export const createAiSdkStreamFn = (defaultOptions?: { idleTimeoutMs?: number }): StreamFn => {
  return async (model, context, options) => {
    const stream = createAssistantMessageEventStream()
    const requestStartTime = Date.now()

    void (async () => {
      const blocks: AssistantMessage["content"] = []
      let partial = createEmptyAssistant(model)
      const getContentIndex = (block: (typeof blocks)[number]) => blocks.indexOf(block)

      let activeBlockStartTime = Date.now()
      let activeBlockType: "thinking" | "text" | null = null

      const finalizeActiveBlockDuration = () => {
        if (!activeBlockType) return
        const now = Date.now()
        const duration = Math.max(0, now - activeBlockStartTime)
        const lastBlock = blocks[blocks.length - 1]
        if (lastBlock && (lastBlock.type === "thinking" || lastBlock.type === "text")) {
          lastBlock.durationMs = (lastBlock.durationMs ?? 0) + duration
        }
        activeBlockStartTime = now
        activeBlockType = null
      }

      const ensureTextBlock = (): TextContent => {
        const existing = blocks[blocks.length - 1]
        if (existing && existing.type === "text") return existing
        finalizeActiveBlockDuration()
        activeBlockType = "text"
        activeBlockStartTime = Date.now()
        const block: TextContent = { type: "text", text: "" }
        blocks.push(block)
        return block
      }

      const ensureThinkingBlock = (): ThinkingContent => {
        const existing = blocks[blocks.length - 1]
        if (existing && existing.type === "thinking") return existing
        finalizeActiveBlockDuration()
        activeBlockType = "thinking"
        activeBlockStartTime = Date.now()
        const block: ThinkingContent = { type: "thinking", thinking: "" }
        blocks.push(block)
        return block
      }

      const ensureToolCallBlock = (
        toolCallId: string,
        name: string,
        args: Record<string, unknown>,
      ): ToolCall => {
        finalizeActiveBlockDuration()
        const existing = blocks.find(
          (block) => block.type === "toolCall" && block.id === toolCallId,
        )
        if (existing && existing.type === "toolCall") return existing
        const block: ToolCall = { type: "toolCall", id: toolCallId, name, arguments: args }
        blocks.push(block)
        return block
      }

      const emitUpdate = (event: Parameters<typeof stream.push>[0]): void => {
        partial = { ...partial, content: [...blocks] }
        stream.push(event)
      }

      const idleTimeoutMs =
        options?.idleTimeoutMs ?? defaultOptions?.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
      const watchdog = new IdleWatchdog({
        timeoutMs: idleTimeoutMs,
        errorMessage: `Stream idle timeout after ${idleTimeoutMs}ms`,
      })

      const combinedSignal = options?.signal
        ? AbortSignal.any([options.signal, watchdog.signal])
        : watchdog.signal

      try {
        const languageModel = resolveLanguageModel(model)
        const result = streamText({
          model: languageModel,
          system: context.systemPrompt || undefined,
          messages: toModelMessages(context.messages),
          tools: toAiTools(context.tools),
          stopWhen: stepCountIs(1),
          abortSignal: combinedSignal,
        })

        stream.push({ type: "start", partial })

        for await (const part of result.fullStream) {
          watchdog.feed()
          switch (part.type) {
            case "text-start": {
              const block = ensureTextBlock()
              emitUpdate({
                type: "text_start",
                contentIndex: getContentIndex(block),
                content: block.text,
                partial,
              })
              break
            }
            case "text-delta": {
              const block = ensureTextBlock()
              block.text += part.text
              emitUpdate({
                type: "text_delta",
                contentIndex: getContentIndex(block),
                delta: part.text,
                partial,
              })
              break
            }
            case "reasoning-start": {
              const block = ensureThinkingBlock()
              emitUpdate({
                type: "thinking_start",
                contentIndex: getContentIndex(block),
                content: block.thinking,
                partial,
              })
              break
            }
            case "reasoning-delta": {
              const block = ensureThinkingBlock()
              block.thinking += part.text
              emitUpdate({
                type: "thinking_delta",
                contentIndex: getContentIndex(block),
                delta: part.text,
                partial,
              })
              break
            }
            case "reasoning-end":
            case "text-end": {
              finalizeActiveBlockDuration()
              break
            }
            case "tool-call": {
              const block = ensureToolCallBlock(
                part.toolCallId,
                part.toolName,
                part.input as Record<string, unknown>,
              )
              emitUpdate({
                type: "toolcall_end",
                contentIndex: getContentIndex(block),
                toolCall: block,
                partial,
              })
              break
            }
            case "finish": {
              finalizeActiveBlockDuration()
              const usage: Usage = {
                input: part.totalUsage.inputTokens ?? 0,
                output: part.totalUsage.outputTokens ?? 0,
                // 缓存命中读取的输入 token（非 Anthropic provider 未填充时回落 0）。
                cacheRead: part.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
                totalTokens: part.totalUsage.totalTokens ?? 0,
              }
              const finalMessage: AssistantMessage = {
                ...partial,
                content: blocks,
                usage,
                stopReason: mapStopReason(part.finishReason),
                timestamp: Date.now(),
                durationMs: Math.max(0, Date.now() - requestStartTime),
              }
              stream.push({ type: "done", reason: finalMessage.stopReason, message: finalMessage })
              stream.end()
              return
            }
            case "error":
              throw part.error
            case "abort":
              throw new Error("Request was aborted")
            default:
              break
          }
        }

        // 流提前结束（无 finish 事件）。
        finalizeActiveBlockDuration()
        const isWatchdogTimeout = watchdog.aborted
        const isUserAbort = options?.signal?.aborted
        const finalMessage: AssistantMessage = {
          ...partial,
          content: blocks,
          stopReason: isUserAbort ? "aborted" : "error",
          errorMessage: isUserAbort
            ? "Request was aborted"
            : isWatchdogTimeout
              ? `Stream idle timeout after ${idleTimeoutMs}ms`
              : "Stream ended without finish",
          timestamp: Date.now(),
          durationMs: Math.max(0, Date.now() - requestStartTime),
        }
        stream.push({ type: "error", reason: finalMessage.stopReason, error: finalMessage })
        stream.end()
      } catch (error) {
        const isWatchdogTimeout = watchdog.aborted
        const isUserAbort = options?.signal?.aborted
        let errorMessage = error instanceof Error ? error.message : String(error)
        if (isWatchdogTimeout && !errorMessage.includes("idle timeout")) {
          errorMessage = `Stream idle timeout after ${idleTimeoutMs}ms`
        }
        const finalMessage: AssistantMessage = {
          ...partial,
          content: blocks,
          stopReason: isUserAbort ? "aborted" : "error",
          errorMessage: isUserAbort ? "Request was aborted" : errorMessage,
          timestamp: Date.now(),
          durationMs: Math.max(0, Date.now() - requestStartTime),
        }
        stream.push({ type: "error", reason: finalMessage.stopReason, error: finalMessage })
        stream.end()
      } finally {
        watchdog.dispose()
      }
    })()

    return stream
  }
}

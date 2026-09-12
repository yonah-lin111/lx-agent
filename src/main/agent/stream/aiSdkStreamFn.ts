import type {
  AssistantMessage,
  StopReason,
  TextContent,
  ThinkingContent,
  ToolCall,
  Usage,
} from "@shared/contracts/agent"
import type { UsagePurpose } from "@shared/contracts/usage"
import { stepCountIs, streamText } from "ai"
import { createAssistantMessageEventStream } from "@/agent/core/event-stream"
import type { Model, StreamFn } from "@/agent/core/types"
import { DEFAULT_STREAM_IDLE_TIMEOUT_MS, IdleWatchdog } from "@/agent/stream/idleWatchdog"
import { resolveLanguageModel } from "@/agent/stream/modelFactory"
import { buildOpencodeGoRequestHeaders } from "@/agent/stream/opencodeGoHeaders"
import { toAiTools, toModelMessages } from "@/agent/stream/toModelMessages"
import { recordModelCall, toUsage } from "@/agent/usageRecorder"
import { getModelProviderSettings } from "@/services/settingsService"

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

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }

// 构造空助手消息。
const createEmptyAssistant = (model: Model): AssistantMessage => ({
  role: "assistant",
  content: [],
  provider: model.provider,
  model: model.id,
  variant: model.variant,
  usage: EMPTY_USAGE,
  stopReason: "pending",
  timestamp: Date.now(),
})

// 创建 streamFn 的默认选项：空闲超时与使用日志归属。
export interface CreateAiSdkStreamFnOptions {
  idleTimeoutMs?: number
  purpose?: UsagePurpose
  getSessionId?: () => string | null
}

/**
 * AI SDK → StreamFn 适配器。
 *
 * 每次调用执行单步生成（stopWhen: stepCountIs(1)），工具调用以 toolcall_end 事件交付，
 * 由 agent-loop 执行工具后回灌上下文。集成 IdleWatchdog 防止流式假死。
 * 每次调用即一次模型请求，finish / error / abort 路径均写入 usage 日志。
 */
export const createAiSdkStreamFn = (defaultOptions?: CreateAiSdkStreamFnOptions): StreamFn => {
  const purpose: UsagePurpose = defaultOptions?.purpose ?? "chat"
  const getSessionId = defaultOptions?.getSessionId

  return async (model, context, options) => {
    const stream = createAssistantMessageEventStream()
    const requestStartTime = Date.now()

    void (async () => {
      const blocks: AssistantMessage["content"] = []
      let partial = createEmptyAssistant(model)
      const getContentIndex = (block: (typeof blocks)[number]) => blocks.indexOf(block)

      let activeBlockStartTime = Date.now()
      let lastChunkTime = Date.now()
      let activeBlockType: "thinking" | "text" | null = null

      const finalizeActiveBlockDuration = () => {
        if (!activeBlockType) return
        const duration = Math.max(0, lastChunkTime - activeBlockStartTime)
        const lastBlock = blocks[blocks.length - 1]
        if (lastBlock && (lastBlock.type === "thinking" || lastBlock.type === "text")) {
          lastBlock.durationMs = (lastBlock.durationMs ?? 0) + duration
        }
        activeBlockStartTime = Date.now()
        lastChunkTime = activeBlockStartTime
        activeBlockType = null
      }

      const ensureTextBlock = (): TextContent => {
        const existing = blocks[blocks.length - 1]
        if (existing && existing.type === "text") return existing
        finalizeActiveBlockDuration()
        activeBlockType = "text"
        activeBlockStartTime = Date.now()
        lastChunkTime = activeBlockStartTime
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
        lastChunkTime = activeBlockStartTime
        const block: ThinkingContent = { type: "thinking", thinking: "" }
        blocks.push(block)
        return block
      }

      const pruneEmptyTrailingTextBlock = () => {
        const last = blocks[blocks.length - 1]
        if (last && last.type === "text" && !last.text.trim()) {
          blocks.pop()
        }
      }

      const ensureToolCallBlock = (
        toolCallId: string,
        name: string,
        args: Record<string, unknown>,
      ): ToolCall => {
        finalizeActiveBlockDuration()
        pruneEmptyTrailingTextBlock()
        const existing = blocks.find(
          (block) => block.type === "toolCall" && block.id === toolCallId,
        )
        if (existing && existing.type === "toolCall") {
          if (name) existing.name = name
          if (args && Object.keys(args).length > 0) existing.arguments = args
          return existing
        }
        const block: ToolCall = { type: "toolCall", id: toolCallId, name, arguments: args }
        blocks.push(block)
        return block
      }

      let firstChunkTimestamp: number | undefined
      const markFirstChunk = () => {
        if (firstChunkTimestamp === undefined) {
          firstChunkTimestamp = Date.now()
        }
      }

      const emitUpdate = (event: Parameters<typeof stream.push>[0]): void => {
        markFirstChunk()
        partial = { ...partial, firstChunkTimestamp, content: [...blocks] }
        stream.push(event)
      }

      const configuredTimeout = getModelProviderSettings().streamIdleTimeoutMs
      const idleTimeoutMs =
        options?.idleTimeoutMs ??
        defaultOptions?.idleTimeoutMs ??
        configuredTimeout ??
        DEFAULT_STREAM_IDLE_TIMEOUT_MS
      const watchdog = new IdleWatchdog({
        timeoutMs: idleTimeoutMs,
        errorMessage: `Stream idle timeout after ${idleTimeoutMs}ms`,
      })

      const combinedSignal = options?.signal
        ? AbortSignal.any([options.signal, watchdog.signal])
        : watchdog.signal

      try {
        const languageModel = resolveLanguageModel(model)

        // 解析 variant 参数并构建 providerOptions / extraBody
        const providerSettings = getModelProviderSettings()
        const providerConfig = providerSettings.providers[model.provider]
        const modelConfig = providerConfig?.models[model.id]
        const requestHeaders = buildOpencodeGoRequestHeaders(
          providerConfig,
          getSessionId?.() ?? null,
        )
        const effectiveVariantKey = options?.variant ?? model.variant ?? modelConfig?.variant
        const variantConfig =
          effectiveVariantKey && modelConfig?.variants
            ? modelConfig.variants[effectiveVariantKey]
            : undefined

        const providerOptions: Record<string, any> = {}
        if (variantConfig) {
          if (providerConfig?.type === "anthropic") {
            providerOptions["anthropic"] = {
              ...(typeof variantConfig.thinkingBudget === "number"
                ? {
                    thinking: {
                      type: "enabled",
                      budgetTokens: variantConfig.thinkingBudget,
                    },
                  }
                : {}),
              ...variantConfig,
            }
          } else if (providerConfig?.type === "openai") {
            providerOptions["openai"] = {
              ...(typeof variantConfig.reasoningEffort === "string"
                ? { reasoningEffort: variantConfig.reasoningEffort }
                : {}),
              ...variantConfig,
            }
          } else if (providerConfig?.type === "google") {
            providerOptions["google"] = {
              ...(typeof variantConfig.thinkingBudget === "number"
                ? {
                    thinkingConfig: {
                      thinkingBudget: variantConfig.thinkingBudget,
                    },
                  }
                : {}),
              ...variantConfig,
            }
          } else {
            // openai-compatible:
            // @ai-sdk/openai-compatible checks providerOptions[providerOptionsName] (which is provider.id or camelCase(provider.id))
            // as well as 'openaiCompatible'. Pass to all candidates to ensure exact match.
            providerOptions["openai-compatible"] = { ...variantConfig }
            providerOptions["openaiCompatible"] = { ...variantConfig }
            if (providerConfig?.id) {
              providerOptions[providerConfig.id] = { ...variantConfig }
              providerOptions[`${providerConfig.id}.chat`] = { ...variantConfig }
            }
          }
        }

        const result = streamText({
          model: languageModel,
          system: context.systemPrompt || undefined,
          messages: toModelMessages(context.messages),
          tools: toAiTools(context.tools),
          stopWhen: stepCountIs(1),
          abortSignal: combinedSignal,
          ...(requestHeaders ? { headers: requestHeaders } : {}),
          ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
        })

        stream.push({ type: "start", partial })

        for await (const part of result.fullStream) {
          watchdog.feed()
          switch (part.type) {
            case "text-start": {
              const block = ensureTextBlock()
              lastChunkTime = Date.now()
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
              lastChunkTime = Date.now()
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
              lastChunkTime = Date.now()
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
              lastChunkTime = Date.now()
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
            case "tool-input-start": {
              const block = ensureToolCallBlock(part.id, part.toolName, {})
              emitUpdate({
                type: "toolcall_start",
                contentIndex: getContentIndex(block),
                toolCall: block,
                partial,
              })
              break
            }
            case "tool-input-delta": {
              finalizeActiveBlockDuration()
              emitUpdate({
                type: "toolcall_delta",
                contentIndex: Math.max(0, blocks.length - 1),
                delta: part.delta,
                partial,
              })
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
              pruneEmptyTrailingTextBlock()
              // stepCountIs(1)：本次调用即单个请求，totalUsage 就是该请求用量。
              const usage: Usage = toUsage(part.totalUsage)
              const finalMessage: AssistantMessage = {
                ...partial,
                content: blocks,
                usage,
                stopReason: mapStopReason(part.finishReason),
                timestamp: requestStartTime,
                firstChunkTimestamp,
                durationMs: Math.max(0, Date.now() - requestStartTime),
              }
              recordModelCall({
                sessionId: getSessionId?.() ?? null,
                purpose,
                provider: model.provider,
                model: model.id,
                tokens: usage,
                durationMs: finalMessage.durationMs,
                status: "success",
              })
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
        pruneEmptyTrailingTextBlock()
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
          timestamp: requestStartTime,
          firstChunkTimestamp,
          durationMs: Math.max(0, Date.now() - requestStartTime),
        }
        recordModelCall({
          sessionId: getSessionId?.() ?? null,
          purpose,
          provider: model.provider,
          model: model.id,
          tokens: EMPTY_USAGE,
          durationMs: finalMessage.durationMs,
          status: isUserAbort ? "aborted" : "error",
          errorMessage: finalMessage.errorMessage ?? null,
        })
        stream.push({ type: "error", reason: finalMessage.stopReason, error: finalMessage })
        stream.end()
      } catch (error) {
        const isWatchdogTimeout = watchdog.aborted
        const isUserAbort = options?.signal?.aborted
        let errorMessage = error instanceof Error ? error.message : String(error)
        if (isWatchdogTimeout && !errorMessage.includes("idle timeout")) {
          errorMessage = `Stream idle timeout after ${idleTimeoutMs}ms`
        }
        finalizeActiveBlockDuration()
        pruneEmptyTrailingTextBlock()
        const finalMessage: AssistantMessage = {
          ...partial,
          content: blocks,
          stopReason: isUserAbort ? "aborted" : "error",
          errorMessage: isUserAbort ? "Request was aborted" : errorMessage,
          timestamp: requestStartTime,
          firstChunkTimestamp,
          durationMs: Math.max(0, Date.now() - requestStartTime),
        }
        recordModelCall({
          sessionId: getSessionId?.() ?? null,
          purpose,
          provider: model.provider,
          model: model.id,
          tokens: EMPTY_USAGE,
          durationMs: finalMessage.durationMs,
          status: isUserAbort ? "aborted" : "error",
          errorMessage: finalMessage.errorMessage ?? null,
        })
        stream.push({ type: "error", reason: finalMessage.stopReason, error: finalMessage })
        stream.end()
      } finally {
        watchdog.dispose()
      }
    })()

    return stream
  }
}

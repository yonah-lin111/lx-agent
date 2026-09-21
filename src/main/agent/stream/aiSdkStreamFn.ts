import type {
  AssistantMessage,
  StopReason,
  TextContent,
  ThinkingContent,
  ToolCall,
  Usage,
} from "@shared/contracts/agent"
import type { UsagePurpose } from "@shared/contracts/usage"
import { OPENCODE_GO_PROVIDER_ID } from "@shared/opencodeGo"
import { resolveModelTransport } from "@shared/settings"
import { stepCountIs, streamText } from "ai"
import { createAssistantMessageEventStream } from "@/agent/core/event-stream"
import type { Model, StreamFn } from "@/agent/core/types"
import { DEFAULT_STREAM_IDLE_TIMEOUT_MS, IdleWatchdog } from "@/agent/stream/idleWatchdog"
import { resolveLanguageModel } from "@/agent/stream/modelFactory"
import { toAiTools, toModelMessages } from "@/agent/stream/toModelMessages"
import { applyTokenSaver } from "@/agent/tokenSaver/applyTokenSaver"
import { recordModelCall, toUsage } from "@/agent/usageRecorder"
import { getModelProviderSettings, getTokenSaverSettings } from "@/services/settingsService"

// Token Saver 生效的请求类型：仅真实会话请求（主对话 / 子代理），标题/建议问题/压缩摘要跳过。
const TOKEN_SAVER_PURPOSES: ReadonlySet<UsagePurpose> = new Set(["chat", "subagent"])

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

// 读取 Anthropic thinking 签名（@ai-sdk/anthropic 在 signature_delta 中以 reasoning-delta 事件携带）。
const readAnthropicSignature = (providerMetadata: unknown): string | undefined => {
  const signature = (providerMetadata as { anthropic?: { signature?: unknown } } | undefined)
    ?.anthropic?.signature
  return typeof signature === "string" && signature.length > 0 ? signature : undefined
}

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

      // 空思考块不上库：无文本且无签名；带签名的空块必须保留（Anthropic 续轮校验签名）。
      const pruneEmptyThinkingBlocks = (
        content: AssistantMessage["content"],
      ): AssistantMessage["content"] =>
        content.filter(
          (block) => block.type !== "thinking" || block.thinking.trim() !== "" || block.signature,
        )

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
        const effectiveVariantKey = options?.variant ?? model.variant ?? modelConfig?.variant
        const variantConfig =
          effectiveVariantKey && modelConfig?.variants
            ? modelConfig.variants[effectiveVariantKey]
            : undefined

        const providerOptions: Record<string, any> = {}
        if (variantConfig) {
          // 按模型实际传输协议选参（模型级 transport 覆盖优先，缺省继承 provider.type）。
          const effectiveTransport = providerConfig
            ? resolveModelTransport(providerConfig, model.id)
            : "openai-compatible"
          if (effectiveTransport === "anthropic") {
            // 依次支持：lx 自有 thinkingBudget（数字预算）、opencode 式 thinking 对象
            //（如 minimax-m3 的 disabled/adaptive）、opencode 式 effort 裸键（非 Claude 系自适应档位）。
            const thinkingOption =
              typeof variantConfig.thinkingBudget === "number"
                ? {
                    thinking: {
                      type: "enabled",
                      budgetTokens: variantConfig.thinkingBudget,
                    },
                  }
                : typeof variantConfig.thinking === "object" &&
                    variantConfig.thinking !== null &&
                    !Array.isArray(variantConfig.thinking)
                  ? { thinking: variantConfig.thinking }
                  : {}
            providerOptions["anthropic"] = {
              ...thinkingOption,
              ...(typeof variantConfig.effort === "string" ? { effort: variantConfig.effort } : {}),
              ...variantConfig,
            }
          } else if (effectiveTransport === "openai" || effectiveTransport === "openai-responses") {
            providerOptions["openai"] = {
              ...(typeof variantConfig.reasoningEffort === "string"
                ? { reasoningEffort: variantConfig.reasoningEffort }
                : {}),
              // opencode responses 系三件套：档位 + 摘要 + 加密推理透传。
              ...(typeof variantConfig.reasoningSummary === "string"
                ? { reasoningSummary: variantConfig.reasoningSummary }
                : {}),
              ...(Array.isArray(variantConfig.include) ? { include: variantConfig.include } : {}),
              // @ai-sdk/openai 按模型 ID 前缀判定推理模型（o1/o3/gpt-5 系），第三方 ID
              //（如 muse-spark）会被误判，导致 reasoning 整块不上线、思考流永不到达；
              // 用户已选档位即强制启用，仅 responses 通路需要（chat 通路 reasoning_effort 本就直传）。
              ...(effectiveTransport === "openai-responses" ? { forceReasoning: true } : {}),
              ...variantConfig,
            }
          } else if (effectiveTransport === "google") {
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

        // Token Saver 只在出站副本上做压缩与风格注入，DB 与 UI 保持原始内容。
        const dispatchRequest = TOKEN_SAVER_PURPOSES.has(purpose)
          ? applyTokenSaver(
              { systemPrompt: context.systemPrompt, messages: context.messages },
              getTokenSaverSettings(),
            )
          : { systemPrompt: context.systemPrompt, messages: context.messages }

        // 生效记录挂到助手消息上随 turn 落库（执行流程底部标注用）。
        if (dispatchRequest.run) {
          partial = { ...partial, tokenSaver: dispatchRequest.run }
        }

        const result = streamText({
          model: languageModel,
          system: dispatchRequest.systemPrompt || undefined,
          messages: toModelMessages(dispatchRequest.messages),
          tools: toAiTools(context.tools),
          stopWhen: stepCountIs(1),
          abortSignal: combinedSignal,
          ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
          // OpenCode Go 要求每请求携带稳定会话 id（x-opencode-session）用于路由与 prompt caching，
          // 缺失会被服务端拒绝；仅对 Go 发送，避免向第三方泄露会话标识。
          ...(providerConfig?.id === OPENCODE_GO_PROVIDER_ID
            ? {
                headers: {
                  "x-opencode-session": options?.sessionId ?? getSessionId?.() ?? "draft-session",
                },
              }
            : {}),
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
              const signature = readAnthropicSignature(part.providerMetadata)
              if (signature) block.signature = signature
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
              // 签名以空文本 delta 单独到达；也可能与文本同帧，delta 阶段即写入。
              const signature = readAnthropicSignature(part.providerMetadata)
              if (signature) block.signature = signature
              lastChunkTime = Date.now()
              emitUpdate({
                type: "thinking_delta",
                contentIndex: getContentIndex(block),
                delta: part.text,
                partial,
              })
              break
            }
            case "reasoning-end": {
              const signature = readAnthropicSignature(part.providerMetadata)
              const block = blocks[blocks.length - 1]
              if (signature && block?.type === "thinking") block.signature = signature
              finalizeActiveBlockDuration()
              break
            }
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
                content: pruneEmptyThinkingBlocks(blocks),
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
          content: pruneEmptyThinkingBlocks(blocks),
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
          content: pruneEmptyThinkingBlocks(blocks),
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

import type { BtwAskRequest, BtwAskResult, BtwContextMessage } from "@shared/contracts/agent"
import { streamText } from "ai"
import { getModelProviderSettings } from "@/services/settingsService"
import { trimConversationContext } from "./contextBudget"
import type { Model } from "./core/types"
import { resolveLanguageModel, resolveModelSelection } from "./stream/modelFactory"
import { recordModelCall, toUsage } from "./usageRecorder"

// btw 请求超时（毫秒）：兜底避免无响应 provider 挂住渲染端请求。
const BTW_TIMEOUT_MS = 60_000
// 侧问线历史保留条数上限（侧问通常短小，超出部分丢弃最早的问答）。
const MAX_HISTORY_MESSAGES = 20
// 上下文基础预算；优先按模型 context limit 放大（最多 4 倍）。
const BASE_CONTEXT_CHARS = 8000

// btw 系统提示词（英语）：只依据给定上下文回答，通俗易懂、简洁，不调用工具。
const BTW_SYSTEM_PROMPT =
  "You are answering a quick side question about an ongoing coding session. " +
  "Use only the conversation context and side-question history provided below. " +
  "Do not call tools and do not assume access to files or the shell. " +
  "Answer in plain, easy-to-understand language, keep it concise, and say clearly when the provided context is not enough."

/**
 * 组装 btw 请求消息：主会话上下文按预算裁剪，侧问线历史保留最近若干条，最后追加本次问题。
 */
export const buildBtwMessages = (
  request: BtwAskRequest,
  contextBudgetChars: number,
): BtwContextMessage[] => {
  const context = trimConversationContext(request.context, contextBudgetChars)
  const history = request.history.slice(-MAX_HISTORY_MESSAGES).filter((m) => m.content.trim())
  return [...context, ...history, { role: "user", content: request.question.trim() }]
}

/**
 * 执行 btw 侧问：一次性无工具模型调用，不进入主会话与数据库。
 * 失败（无模型/无 key/超时/异常）统一返回错误文案，不抛异常穿透 IPC。
 */
export const askBtwQuestion = async (request: BtwAskRequest): Promise<BtwAskResult> => {
  const startedAt = Date.now()
  let loggedModel: Model | null = null
  try {
    const question = request.question.trim()
    if (!question) return { ok: false, error: "btw question is empty" }

    const settings = getModelProviderSettings()
    const selection = request.selection ?? settings.defaultModel
    const provider = settings.providers[selection.provider]
    if (!provider || !provider.models[selection.model]) {
      return { ok: false, error: "btw is unavailable: model provider is not configured" }
    }

    const resolved = resolveModelSelection(selection)
    if ("error" in resolved) return { ok: false, error: resolved.error }
    loggedModel = resolved.model
    const languageModel = resolveLanguageModel(resolved.model)

    const contextLimit = provider.models[selection.model].limit?.context
    const budget = Math.max(BASE_CONTEXT_CHARS, (contextLimit ?? BASE_CONTEXT_CHARS) * 4)
    const messages = buildBtwMessages({ ...request, question }, budget)

    const result = streamText({
      model: languageModel,
      abortSignal: AbortSignal.timeout(BTW_TIMEOUT_MS),
      messages: [{ role: "system", content: BTW_SYSTEM_PROMPT }, ...messages],
    })
    const answer = (await result.text).trim()
    recordModelCall({
      sessionId: null,
      purpose: "btw",
      provider: resolved.model.provider,
      model: resolved.model.id,
      tokens: toUsage(await result.usage),
      durationMs: Date.now() - startedAt,
      status: "success",
    })
    if (!answer) return { ok: false, error: "btw returned an empty answer" }
    return { ok: true, answer }
  } catch (error) {
    recordModelCall({
      sessionId: null,
      purpose: "btw",
      provider: loggedModel?.provider ?? "unknown",
      model: loggedModel?.id ?? "unknown",
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      durationMs: Date.now() - startedAt,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: message.includes("timed out")
        ? "btw request timed out, please try again"
        : `btw request failed: ${message}`,
    }
  }
}

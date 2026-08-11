import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"
import { streamText } from "ai"
import { getModelProviderSettings } from "@/services/settingsService"
import { resolveLanguageModel, resolveModelSelection } from "./stream/modelFactory"

// 建议问题生成超时（秒）：兜底避免无响应 provider 挂住渲染端请求。
const SUGGEST_TIMEOUT_MS = 15_000
// 上下文保留条数上限（最近的 N 条消息）。
const MAX_CONTEXT_MESSAGES = 12
// 单条消息内容截断上限。
const MAX_MESSAGE_CHARS = 8000
// 上下文基础预算；优先按模型 context limit 放大（最多 3 倍）。
const BASE_CONTEXT_CHARS = 4000

/**
 * 解析模型返回的推荐问题，仅保留 2-4 条非空、去重后的文本。
 */
export const parseSuggestedQuestions = (content: string): string[] => {
  const normalizeQuestions = (values: unknown[]): string[] => {
    const questions = Array.from(
      new Set(
        values
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ).slice(0, 4)
    return questions.length >= 2 ? questions : []
  }

  const json =
    content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content.match(/\[[\s\S]*\]/)?.[0]
  if (json) {
    try {
      const parsed = JSON.parse(json) as unknown
      if (Array.isArray(parsed)) return normalizeQuestions(parsed)
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as { questions?: unknown }).questions)
      ) {
        return normalizeQuestions((parsed as { questions: unknown[] }).questions)
      }
    } catch {
      // JSON 不完整时继续尝试解析常见的编号列表。
    }
  }

  const listQuestions = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.、])\s*/, "").trim())
    .filter((line) => line.endsWith("？") || line.endsWith("?"))

  return normalizeQuestions(listQuestions)
}

/**
 * 按上下文预算保留最近对话，避免建议请求挤占主对话可用上下文。
 */
export const trimSuggestedQuestionContext = (
  messages: SuggestedQuestionContextMessage[],
  maxChars: number,
): SuggestedQuestionContextMessage[] => {
  const selected: SuggestedQuestionContextMessage[] = []
  let usedChars = 0

  for (const message of messages.slice(-MAX_CONTEXT_MESSAGES).reverse()) {
    const availableChars = maxChars - usedChars
    if (availableChars <= 0) break
    const content = message.content.slice(-Math.min(MAX_MESSAGE_CHARS, availableChars))
    if (!content) continue
    selected.unshift({ ...message, content })
    usedChars += content.length
  }

  return selected
}

/**
 * 用配置的 suggestedQuestions 模型为对话生成后续建议问题。
 * 纯生成、无工具、不进 Agent 事件流；功能未开启 / 无模型 / 无 key / 失败均静默返回空数组。
 */
export const generateSuggestedQuestions = async (
  messages: SuggestedQuestionContextMessage[],
  excludedQuestions: string[] = [],
): Promise<string[]> => {
  try {
    const settings = getModelProviderSettings()
    if (!settings.suggestedQuestionsEnabled || messages.length === 0) return []

    const selection = settings.suggestedQuestions
    const provider = settings.providers[selection.provider]
    if (!provider || !provider.models[selection.model]) return []

    const resolved = resolveModelSelection(selection)
    if ("error" in resolved) return []
    const languageModel = resolveLanguageModel(resolved.model)

    const contextLimit = provider.models[selection.model].limit?.context
    const budget = Math.max(BASE_CONTEXT_CHARS, (contextLimit ?? BASE_CONTEXT_CHARS) * 3)
    const context = trimSuggestedQuestionContext(messages, budget)
    if (context.length === 0) return []

    const result = streamText({
      model: languageModel,
      abortSignal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS),
      messages: [
        {
          role: "system",
          content:
            `根据以下对话生成 2 到 4 个用户下一步可以直接提问的中文问题。` +
            `不得重复以下已有问题：${JSON.stringify(excludedQuestions)}。` +
            `仅返回 JSON 字符串数组，不要解释、Markdown 或工具调用。`,
        },
        ...context,
      ],
    })
    return parseSuggestedQuestions(await result.text)
  } catch {
    return []
  }
}

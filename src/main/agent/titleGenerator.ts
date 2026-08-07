import type { AgentMessage, ImageContent, TextContent } from "@shared/contracts/agent"
import { streamText } from "ai"
import { getModelProviderSettings } from "@/services/settingsService"
import { resolveLanguageModel, resolveModelSelection } from "./stream/modelFactory"

// 标题生成超时（秒）：兜底避免无响应 provider 挂住后台任务。
const TITLE_TIMEOUT_MS = 10_000
// 标题长度兜底上限（对齐 createTitle 的 40 字符，保证列表宽度不溢出）。
const MAX_TITLE_LENGTH = 40

// 提取文本块内容；非文本块（thinking/toolCall/image）返回空串。
const textOf = (block: TextContent | ImageContent): string =>
  block.type === "text" && typeof block.text === "string" ? block.text : ""

// 首轮 → 生成输入：仅取 user 消息文本（跳过 assistant / toolResult / thinking）。
const extractTurnText = (firstTurn: AgentMessage[]): string => {
  const parts: string[] = []
  for (const message of firstTurn) {
    if (message.role !== "user") continue
    const text = Array.isArray(message.content)
      ? message.content.map(textOf).filter(Boolean).join("\n")
      : message.content
    if (text) parts.push(text)
  }
  return parts.join("\n")
}

// 清理生成结果：去 think 标签 → 取第一行非空 → 40 字符截断兜底。
const cleanTitle = (raw: string): string | null => {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, "")
  const firstLine = withoutThink
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (!firstLine) return null
  const trimmed =
    firstLine.length > MAX_TITLE_LENGTH ? firstLine.slice(0, MAX_TITLE_LENGTH) : firstLine
  return trimmed || null
}

/**
 * 用配置的 titleSummary 模型为会话生成标题。
 * 纯生成、无工具、不进 Agent 事件流；失败/无模型/无 key 返回 null（不抛错）。
 * 调用方负责校验会话归属并落库。
 */
export const generateSessionTitle = async (firstTurn: AgentMessage[]): Promise<string | null> => {
  try {
    const selection = getModelProviderSettings().titleSummary
    const resolved = resolveModelSelection(selection)
    if ("error" in resolved) return null
    const languageModel = resolveLanguageModel(resolved.model)

    const input = extractTurnText(firstTurn)
    if (!input) return null

    const result = streamText({
      model: languageModel,
      abortSignal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
      messages: [
        {
          role: "user",
          content:
            "请用简体中文为本轮对话生成一个简洁精炼的会话标题。\n" +
            "要求：一句话概括对话主题，不超过 20 字，不加标点结尾。\n\n" +
            `对话内容：\n${input}`,
        },
      ],
    })
    return cleanTitle(await result.text)
  } catch {
    // 无响应 provider / 网络错误 / 超时：静默返回 null，保留兜底标题。
    return null
  }
}

/**
 * 用配置的 titleSummary 模型为模板块内容生成标题。
 * 纯生成、无工具、不进入 Agent 事件流；失败/无模型/无 key 返回 null（不抛错）。
 * 渲染侧负责校验模板块归属并回写开始行「title: 」。
 */
export const generateTemplateTitle = async (content: string): Promise<string | null> => {
  try {
    const selection = getModelProviderSettings().titleSummary
    const resolved = resolveModelSelection(selection)
    if ("error" in resolved) return null
    const languageModel = resolveLanguageModel(resolved.model)

    const result = streamText({
      model: languageModel,
      abortSignal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
      messages: [
        {
          role: "user",
          content:
            "请用简体中文为以下开发任务描述提炼一个简洁精炼的标题。\n" +
            "要求：一句话概括任务主题，不超过 20 字，不加标点结尾。\n\n" +
            `任务描述：\n${content}`,
        },
      ],
    })
    return cleanTitle(await result.text)
  } catch {
    // 无响应 provider / 网络错误 / 超时：静默返回 null，由调用方提示失败。
    return null
  }
}

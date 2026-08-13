import type { AgentMessage, CompactionSummaryMessage } from "@shared/contracts/agent"
import { type CompactionSettings, DEFAULT_COMPACTION_SETTINGS } from "@shared/settings"
import { streamText } from "ai"
import { getModelProviderSettings } from "@/services/settingsService"
import { resolveLanguageModel, resolveModelSelection } from "./stream/modelFactory"

// 摘要生成超时（秒）：兜底避免无响应 provider 挂住 turn 收尾。
const COMPACTION_TIMEOUT_MS = 30_000
// 摘要生成输入上限（字符）：超限只保留尾部（最近内容信息量最大），避免摘要请求自身溢出。
const MAX_SUMMARY_INPUT_CHARS = 30_000

// 压缩边界：summary 替代 firstKeptSeq 之前的全部历史。
export interface CompactionBoundary {
  summary: string
  // 保留起点的消息 seq（seq >= firstKeptSeq 的尾部进入模型上下文）。
  firstKeptSeq: number
  // 被压缩部分的估计 token 数。
  tokensBefore: number
}

export { type CompactionSettings, DEFAULT_COMPACTION_SETTINGS }

// 构造可见的压缩摘要消息（UI 与模型上下文共用同一份）。
export const createCompactionSummaryMessage = (
  summary: string,
  tokensBefore: number,
): CompactionSummaryMessage => ({
  role: "compactionSummary",
  summary,
  tokensBefore,
  timestamp: Date.now(),
})

// context-overflow 错误签名（各 provider 的上下文超限错误文案）。
const OVERFLOW_SIGNATURES = [
  "context_length_exceeded",
  "maximum context length",
  "context window",
  "prompt is too long",
  "token limit",
  "maximum token",
  "input length",
  "context limit",
  "too many tokens",
]

// 判断是否为上下文溢出失败（provider 返回的 errorMessage 匹配签名）。
export const isContextOverflowFailure = (message: string): boolean => {
  const normalized = message.toLowerCase()
  return OVERFLOW_SIGNATURES.some((signature) => normalized.includes(signature))
}

// 单条消息的文本字符数（估计 token 用；忽略思考/工具参数细节以降低噪音）。
const messageCharCount = (message: AgentMessage): number => {
  switch (message.role) {
    case "user": {
      const content = Array.isArray(message.content) ? message.content : []
      const text = content
        .map((block) => (block.type === "text" ? block.text : "[image]"))
        .join("\n")
      return typeof message.content === "string" ? message.content.length : text.length
    }
    case "assistant":
      return message.content
        .map((block) => {
          if (block.type === "text") return block.text
          if (block.type === "thinking") return block.thinking
          return ""
        })
        .join("\n").length
    case "toolResult":
      return message.content
        .map((block) => (block.type === "text" ? block.text : "[image]"))
        .join("\n").length
    case "compactionSummary":
      return message.summary.length
    case "todoState":
      // 任务清单消息仅存在于 transformContext 输出（不进 state.messages），不参与上下文估计。
      return 0
  }
}

// 单条消息 token 启发式估计（char/4，对齐 pi estimateContextTokens）。
export const estimateMessageTokens = (message: AgentMessage): number =>
  Math.max(1, Math.ceil(messageCharCount(message) / 4))

/**
 * 估计整组上下文 token 数：复用最后一条 assistant 的 usage.totalTokens 作锚点
 * （其生成时即完整上下文），其后消息按 char/4 累加；无 assistant 时纯字符估计。
 */
export const estimateContextTokens = (messages: AgentMessage[]): number => {
  let anchor = 0
  let anchorIndex = -1
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role === "assistant") {
      anchor = message.usage.totalTokens || 0
      anchorIndex = index
      break
    }
  }
  if (anchorIndex < 0) {
    return messages.reduce((total, message) => total + estimateMessageTokens(message), 0)
  }
  let total = anchor
  for (let index = anchorIndex + 1; index < messages.length; index++) {
    total += estimateMessageTokens(messages[index])
  }
  return total
}

/**
 * 计算切割点：从尾部向前累计 token 至 keepRecentTokens 预算满足，返回保留起点的消息索引
 * （该索引及之后保留，之前压缩）。只切在完整 turn 边界——保留部分第一条不能是 toolResult。
 * 返回 messages.length 表示全部保留（无需压缩）。
 */
export const findCutPoint = (messages: AgentMessage[], keepRecentTokens: number): number => {
  let accumulated = 0
  let cutIndex = messages.length
  for (let index = messages.length - 1; index >= 0; index--) {
    accumulated += estimateMessageTokens(messages[index])
    if (accumulated >= keepRecentTokens) {
      cutIndex = index
      break
    }
  }
  // 全部消息累计仍不足预算：全部保留。
  if (cutIndex === messages.length) return messages.length
  // 提升到完整 turn 边界：保留部分的第一条不能是 toolResult。
  while (cutIndex < messages.length && messages[cutIndex]?.role === "toolResult") {
    cutIndex += 1
  }
  return cutIndex
}

// 提取消息数组的文本内容（摘要生成输入；跳过思考/图片占位）。
const extractConversationText = (messages: AgentMessage[]): string => {
  const parts: string[] = []
  for (const message of messages) {
    // todoState 仅存在于 transformContext 输出（不进 state.messages），不参与压缩摘要。
    if (message.role === "todoState") continue
    const prefix =
      message.role === "user"
        ? "用户"
        : message.role === "assistant"
          ? "助手"
          : message.role === "toolResult"
            ? `工具(${message.toolName})`
            : "摘要"
    const text =
      message.role === "assistant"
        ? message.content
            .map((block) => (block.type === "text" ? block.text : ""))
            .filter(Boolean)
            .join("\n")
        : message.role === "toolResult"
          ? message.content
              .map((block) => (block.type === "text" ? block.text : ""))
              .filter(Boolean)
              .join("\n")
          : message.role === "user"
            ? Array.isArray(message.content)
              ? message.content
                  .map((block) => (block.type === "text" ? block.text : "[图片]"))
                  .join("\n")
              : message.content
            : message.summary
    if (text.trim()) parts.push(`${prefix}: ${text}`)
  }
  return parts.join("\n")
}

// 清理摘要生成结果：去 think 标签 + 空白收尾。
const cleanSummary = (raw: string): string | null => {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim()
  return withoutThink || null
}

/**
 * 为被压缩的历史生成结构化摘要（简体中文：目标/已完成/进行中/阻塞/关键决策/下一步）。
 * 裸 AI SDK streamText：单次生成、无工具、不进 Agent 事件流；失败返回 null（调用方保留旧边界）。
 */
export const generateCompactionSummary = async (
  messages: AgentMessage[],
): Promise<string | null> => {
  try {
    const selection = getModelProviderSettings().titleSummary
    const resolved = resolveModelSelection(selection)
    if ("error" in resolved) return null
    const languageModel = resolveLanguageModel(resolved.model)

    const input = extractConversationText(messages)
    if (!input) return null
    // 输入超限时保留尾部（最近内容信息量最大）。
    const truncated =
      input.length > MAX_SUMMARY_INPUT_CHARS
        ? `…[较早内容已省略]\n\n${input.slice(-MAX_SUMMARY_INPUT_CHARS)}`
        : input

    const result = streamText({
      model: languageModel,
      abortSignal: AbortSignal.timeout(COMPACTION_TIMEOUT_MS),
      messages: [
        {
          role: "user",
          content:
            "请用简体中文为以下对话历史生成结构化摘要，作为后续对话的上下文。\n" +
            "按以下小节组织，每节尽量简洁（无信息则写「无」）：\n" +
            "1. 目标：用户最终想达成的目标\n" +
            "2. 已完成：已经完成的关键事项\n" +
            "3. 进行中：当前正在进行的任务与结论\n" +
            "4. 阻塞：遇到的障碍与解决方案\n" +
            "5. 关键决策：做出的重要技术/设计决策\n" +
            "6. 下一步：尚未开始或待办事项\n\n" +
            `对话历史：\n${truncated}`,
        },
      ],
    })
    return cleanSummary(await result.text)
  } catch {
    // 无响应 provider / 网络错误 / 超时：静默返回 null，保留旧边界，下轮再试。
    return null
  }
}

import type { Locale } from "@shared/settings"
import { en } from "@/i18n/locales/en"
import { zh } from "@/i18n/locales/zh"
import type {
  MarkdownSendPromptCommandParsed,
  MarkdownSendPromptFlagId,
  MarkdownSendPromptFlagOption,
  MarkdownSendPromptTargetId,
} from "./types"

/**
 * 获取 Markdown /sendPrompt 命令三级运行选项配置列表。
 */
export const getMarkdownSendPromptFlagOptions = (
  locale: Locale = "zh",
): MarkdownSendPromptFlagOption[] => {
  const dict = locale === "en" ? en : zh
  return [
    {
      id: "-enter",
      name: "-enter",
      label: "-enter",
      description: dict.markdown.sendPromptFlagEnterDesc,
      tag: dict.markdown.sendPromptFlagEnterTag,
    },
  ]
}

/**
 * 解析 /sendPrompt 命令行中携带的目标、实例与可选标志位。
 * 支持：
 * - /sendPrompt agent
 * - /sendPrompt opencode
 * - /sendPrompt opencode:opencode-dev
 * - /sendPrompt opencode:opencode-dev -enter
 * - /sendPrompt opencode -enter
 */
export const parseMarkdownSendPromptCommandLine = (
  lineText: string,
): MarkdownSendPromptCommandParsed | null => {
  const trimmed = lineText.trim()
  if (!trimmed.startsWith("/sendPrompt")) return null

  const remainder = trimmed.slice("/sendPrompt".length).trim()
  if (!remainder) return null

  // 提取尾部可选的 Flag（如 -new）
  const flagMatch = /\s+(-[a-zA-Z0-9_-]+)$/.exec(remainder)
  const flag = (flagMatch ? flagMatch[1] : null) as MarkdownSendPromptFlagId | null
  const withoutFlag = flagMatch ? remainder.slice(0, flagMatch.index).trim() : remainder

  let rawTarget = withoutFlag
  let instance: string | null = null

  if (withoutFlag.includes(":")) {
    const colonIndex = withoutFlag.indexOf(":")
    rawTarget = withoutFlag.slice(0, colonIndex).trim()
    instance = withoutFlag.slice(colonIndex + 1).trim() || null
  }

  const normalizedTarget = rawTarget.toLowerCase()
  const target = (
    normalizedTarget === "lx" ||
    normalizedTarget === "lx agent" ||
    normalizedTarget === "lx-agent" ||
    normalizedTarget === "agent" ||
    normalizedTarget === "agentinput"
      ? "agent"
      : normalizedTarget === "claudecode" || normalizedTarget === "cc"
        ? "claude"
        : normalizedTarget === "oc"
          ? "opencode"
          : normalizedTarget === "openai" || normalizedTarget === "cx"
            ? "codex"
            : normalizedTarget === "gemini-cli" ||
                normalizedTarget === "geminicli" ||
                normalizedTarget === "gm"
              ? "gemini"
              : normalizedTarget === "antigravity" || normalizedTarget === "ag"
                ? "agy"
                : normalizedTarget === "grok" || normalizedTarget === "gk"
                  ? "grok"
                  : normalizedTarget
  ) as MarkdownSendPromptTargetId

  return { target, instance, flag }
}

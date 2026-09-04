import type { ChatMessage } from "@/features/agent/types"
import {
  BUILTIN_UNDERSCORE_TOOLS,
  QUESTION_TOOL_NAME,
  SKILL_TOOL_NAME,
  SUBAGENT_TOOL_NAME,
  TODO_TOOL_NAME,
  VISUAL_TOOL_NAMES,
  WEB_SEARCH_TOOL_NAME,
} from "./constants"
import type { CommandTag, QaUsage } from "./types"

// 判断是否为 Skill 调用。
export const isSkillToolCall = (toolName: string): boolean => toolName === SKILL_TOOL_NAME

// 判断是否为联网搜索调用。
export const isWebSearchToolCall = (toolName: string): boolean => toolName === WEB_SEARCH_TOOL_NAME

// 判断是否为子代理（task 工具）调用。
export const isSubagentToolCall = (toolName: string): boolean => toolName === SUBAGENT_TOOL_NAME

// 判断是否为任务清单（todowrite 工具）调用。
export const isTodoToolCall = (toolName: string): boolean => toolName === TODO_TOOL_NAME

// 判断是否为模型提问（question 工具）调用。
export const isQuestionToolCall = (toolName: string): boolean => toolName === QUESTION_TOOL_NAME

// 判断是否为解释性可视化工具（render_svg / render_ascii / render_html）调用。
export const isVisualToolCall = (toolName: string): boolean => VISUAL_TOOL_NAMES.has(toolName)

// 判断是否为 MCP 调用（MCP 工具全名为 `server_tool`，排除内置下划线工具）。
export const isMcpToolCall = (toolName: string): boolean =>
  !BUILTIN_UNDERSCORE_TOOLS.has(toolName) && toolName.includes("_")

// 获取 MCP 服务名。
export const getMcpServerName = (toolName: string): string => {
  const separatorIndex = toolName.indexOf("_")
  return separatorIndex > 0 ? toolName.slice(0, separatorIndex) : toolName
}

// 判断是否为写操作工具（文件修改，独立展示且不参与执行折叠）。
export const isWriteToolCall = (toolName: string): boolean =>
  toolName === "edit" || toolName === "write"

// token 千位紧凑缩写（英文 K/M）。
export const formatTokensShort = (count: number): string => {
  if (count < 1000) return count.toString()
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`
  if (count < 1000000) return `${Math.round(count / 1000)}k`
  return `${(count / 1000000).toFixed(1)}M`
}

// 提取文本中的 Skill Markdown 内容（从 <skill> 注入块中提取）。
export const extractSkillBlock = (rawText: string): string | null => {
  const match = /<skill\b[^>]*>([\s\S]*?)<\/skill>/i.exec(rawText)
  if (match && match[1]) {
    return match[1].replace(/^References are relative to [^\n]*\n+/i, "").trim()
  }
  return null
}

// 清洗用户输入纯文本（剥离 <skill ...> 注入块与命令前缀）。
export const cleanUserPrompt = (
  rawText: string,
  options?: { isSteer?: boolean; command?: { kind?: string; name: string } },
): string => {
  let cleaned = rawText.replace(/<skill\b[\s\S]*?<\/skill>\s*/gi, "")

  if (options?.isSteer || options?.command?.name === "steer") {
    cleaned = cleaned.replace(/^\s*\/steer(?:\s+|$)/, "").trim()
    cleaned = cleaned.replace(/^[\[【]([\s\S]*?)[\]】]$/, "$1").trim()
    return cleaned
  }

  if (options?.command?.kind === "skill") {
    // 剥离开头的技能命令触发前缀（如 /skill:name 或 $name 或 /name）
    const skillName = options.command.name.replace(/^[\/\$]/, "")
    const pattern = new RegExp(
      `^\\s*(?:/skill:${skillName}|\\$${skillName}|/${skillName})(?:\\s+|$)`,
      "i",
    )
    cleaned = cleaned.replace(pattern, "")
  }

  return cleaned.trim()
}

// 提取用户输入纯文本（剥离 <skill ...> 注入块与 /steer 前缀）。
export const extractUserText = (message: ChatMessage): string => {
  const joined = message.blocks
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join("\n")

  return cleanUserPrompt(joined, {
    isSteer: message.isSteer,
    command: message.command,
  })
}

// 解析用户消息命令与来源标识。
export const resolveCommandTag = (message: ChatMessage): CommandTag | null => {
  if (message.isSteer) {
    return {
      label: "/steer",
      sourceTag: undefined,
    }
  }
  if (message.command) {
    if (message.command.kind === "skill") {
      const skillName = message.command.name.replace(/^[\/\$]/, "")
      return {
        label: `$${skillName}`,
        sourceTag: undefined,
      }
    }

    const name = message.command.name.startsWith("/")
      ? message.command.name
      : `/${message.command.name}`

    const sourceTag =
      message.command.kind === "prompt"
        ? message.command.source === "project"
          ? "Project"
          : "Global"
        : undefined

    return {
      label: name,
      sourceTag,
    }
  }
  return null
}

// 计算 QA 聚合 token 用量。
export const calculateQaUsage = (
  message: ChatMessage,
  continuationMessages: ChatMessage[] = [],
): QaUsage | null => {
  let input = 0
  let output = 0
  let cacheRead = 0
  let totalTokens = 0
  let hasUsage = false
  for (const currentMessage of [message, ...continuationMessages]) {
    if (currentMessage.role !== "assistant" || !currentMessage.usage) continue
    hasUsage = true
    input += currentMessage.usage.input
    output += currentMessage.usage.output
    cacheRead += currentMessage.usage.cacheRead ?? 0
    totalTokens += currentMessage.usage.totalTokens
  }
  if (!hasUsage) return null
  return { input, output, cacheRead, totalTokens }
}

// 解析用户气泡背景样式类。
export const getUserBubbleClass = (message: ChatMessage, readOnly: boolean): string => {
  if (readOnly) return "bg-[#33517a]"
  if (message.isSteer) return "bg-steer-bubble"
  if (message.command?.kind === "prompt" && message.command.source === "project") {
    return "bg-[#163f35]"
  }
  if (message.command?.kind === "prompt" && message.command.source === "user") {
    return "bg-[#1e2a5e]"
  }
  if (message.command?.kind === "skill") {
    return "bg-skill-bubble"
  }
  return "bg-user-bubble"
}

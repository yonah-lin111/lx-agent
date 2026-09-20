import type { Locale } from "@shared/settings"
import { builtinMarkdownSlashCommands, getBuiltinMarkdownSlashCommands } from "./builtinCommands"
import type {
  MarkdownSlashCommand,
  MarkdownSlashCommandLine,
  MarkdownSlashCommandScope,
} from "./types"

// 全部斜杠命令（含确认型与选择型），供 armed 判定使用。
const markdownSlashCommands: MarkdownSlashCommand[] = [...builtinMarkdownSlashCommands]

// 斜杠命令名称的大小写不敏感子序列匹配。
const isFuzzyMatch = (query: string, keyword: string): boolean => {
  const normalizedQuery = query.toLowerCase()
  if (!normalizedQuery) return true

  let queryIndex = 0
  for (const character of keyword.toLowerCase()) {
    if (character === normalizedQuery[queryIndex]) queryIndex += 1
    if (queryIndex === normalizedQuery.length) return true
  }
  return false
}

/**
 * 判定光标行为已武装的斜杠命令行，返回对应命令：
 * - 确认型：行内容与某个确认命令标签完全一致且位于模板块内；
 * - 选择型 / 参数型：行以「/命令 值」形态存在（标签后带非空值），等待回车触发；varTemplate 作用域命令仅在变量块内可武装；
 * 已武装状态下命令面板不弹出，Enter 直接触发该命令。
 */
export const getMarkdownArmedSlashCommand = (
  lineValue: string,
  isInsideTemplateBlock: boolean,
  customCommands: MarkdownSlashCommand[] = [],
  isInsideVarBlock = false,
): MarkdownSlashCommand | null => {
  const value = lineValue.trim()
  const allCommands = [...markdownSlashCommands, ...customCommands]
  return (
    allCommands.find((command) => {
      if (command.kind === "confirm") {
        return isInsideTemplateBlock && command.label === value
      }
      if (command.kind === "select" || command.kind === "argument") {
        if (command.scope === "varTemplate" && !isInsideVarBlock) return false
        return value.startsWith(`${command.label} `) && value.length > command.label.length + 1
      }
      return false
    }) ?? null
  )
}

// 已武装的确认/选择命令行判定（兼容旧调用方）。
export const isMarkdownConfirmCommandArmed = (
  lineValue: string,
  isInsideTemplateBlock: boolean,
  customCommands: MarkdownSlashCommand[] = [],
  isInsideVarBlock = false,
): boolean =>
  getMarkdownArmedSlashCommand(
    lineValue,
    isInsideTemplateBlock,
    customCommands,
    isInsideVarBlock,
  ) !== null

// 提取选择型命令行携带的值（标签后的首个词）；非选择型或缺失时返回 null。
export const getMarkdownSelectCommandValue = (
  lineValue: string,
  isInsideTemplateBlock: boolean,
  customCommands: MarkdownSlashCommand[] = [],
  isInsideVarBlock = false,
): string | null => {
  const command = getMarkdownArmedSlashCommand(
    lineValue,
    isInsideTemplateBlock,
    customCommands,
    isInsideVarBlock,
  )
  if (!command || command.kind !== "select") return null
  const value = lineValue.trim()
  const rest = value.slice(command.label.length).trim()
  return rest.length > 0 ? rest : null
}

/**
 * 获取光标所在行的斜杠命令范围。
 */
export const getMarkdownSlashCommandLine = (
  lineText: string,
  lineFrom: number,
  lineTo: number,
): MarkdownSlashCommandLine | null => {
  const value = lineText.trimStart()
  if (!value.startsWith("/")) return null

  return { from: lineFrom, to: lineTo, value }
}

/**
 * 获取与当前斜杠命令匹配的候选项；按光标所在上下文（模板块内/外、变量模板块内）过滤命令可用范围。
 * isGitWorktreeAvailable 为 false 时排除 git 工作区切换命令（如 virtual 项目无 git 上下文）。
 * customCommands 支持传入自定义 Markdown 模板命令（已按 Project 覆盖 User 排序）。
 */
export const getMarkdownSlashCommands = (
  value: string,
  isInsideTemplateBlock = false,
  isGitWorktreeAvailable = true,
  customCommands: MarkdownSlashCommand[] = [],
  locale: Locale = "zh",
  isInsideVarBlock = false,
): MarkdownSlashCommand[] => {
  const match = /^\/([a-zA-Z0-9_-]*)$/i.exec(value)
  if (!match) return []

  const query = match[1].toLowerCase()
  const builtinCommands = getBuiltinMarkdownSlashCommands(locale)
  const allCommands = [...builtinCommands, ...customCommands]

  if (isInsideVarBlock) {
    return allCommands.filter(
      (command) =>
        (command.scope === "varTemplate" || command.scope === "all") &&
        (isFuzzyMatch(query, command.id) || isFuzzyMatch(query, command.label.replace(/^\//, ""))),
    )
  }

  const expectedScope: MarkdownSlashCommandScope = isInsideTemplateBlock ? "template" : "normal"
  return allCommands.filter(
    (command) =>
      command.scope !== "varTemplate" &&
      (command.scope === expectedScope || command.scope === "both" || command.scope === "all") &&
      (isFuzzyMatch(query, command.id) || isFuzzyMatch(query, command.label.replace(/^\//, ""))) &&
      (command.id !== "gitWorktree" || isGitWorktreeAvailable),
  )
}

/**
 * 移除文本中包含的所有 Markdown 斜杠命令行（例如 /sendPrompt agent、/gitWorktree dev、/summaryTitle 等），
 * 保留该行的换行位置（置空该行文本），避免命令清除后破坏段落或标题的换行结构。
 */
export const stripMarkdownSlashCommands = (content: string): string =>
  content
    .split("\n")
    .map((line) => (/^\s*\/[a-zA-Z0-9_-]+(?:\s+.*)?$/.test(line) ? "" : line))
    .join("\n")

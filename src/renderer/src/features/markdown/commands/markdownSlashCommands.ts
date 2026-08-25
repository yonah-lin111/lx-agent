import type { Locale } from "@shared/settings"
import { en } from "@/i18n/locales/en"
import { zh } from "@/i18n/locales/zh"

// Markdown 模板命令标识。
export type MarkdownTemplateCommandId =
  | "addTemplate"
  | "bugTemplate"
  | "refactorTemplate"
  | "commonTemplate"
  | "styleTemplate"
  | "suppleTemplate"

// Markdown 斜杠命令标识。
export type MarkdownSlashCommandId =
  | MarkdownTemplateCommandId
  | "summaryTitle"
  | "gitWorktree"
  | (string & {})

// Markdown 斜杠命令可用范围：normal = 模板块外（文档正文），template = 模板块内，both = 两者皆可。
export type MarkdownSlashCommandScope = "normal" | "template" | "both"

// Markdown 斜杠命令触发类型：
// - direct = 面板选中即插入内容；
// - confirm = 回显命令文本、二次回车触发；
// - select = 回显命令文本后打开二级选择面板，选中回显值、再回车触发；
// - customTemplate = 自定义命令：直接在光标处插入内容。
export type MarkdownSlashCommandKind = "direct" | "confirm" | "select" | "customTemplate"

// Markdown 斜杠命令来源类型。
export type MarkdownSlashCommandSource = "builtin" | "project" | "user"

// Markdown 斜杠命令配置。
export interface MarkdownSlashCommand {
  id: MarkdownSlashCommandId
  label: string
  description: string
  content: string
  cursorOffset: number
  scope: MarkdownSlashCommandScope
  kind: MarkdownSlashCommandKind
  source?: MarkdownSlashCommandSource
  customScope?: "global" | "template"
}

// 斜杠命令行范围。
export interface MarkdownSlashCommandLine {
  from: number
  to: number
  value: string
}

/**
 * 计算模板插入内容在首个输入占位处的光标偏移量。
 */
const getTemplateCursorOffset = (content: string): number => {
  const lines = content.split("\n")
  let offset = 0
  for (const line of lines) {
    if (line.startsWith("- ") && (line.endsWith(": ") || line.endsWith("："))) {
      return offset + line.length
    }
    offset += line.length + 1
  }
  return content.length
}

/**
 * 根据语言环境构造内置 Markdown 模板命令。
 */
export const getBuiltinMarkdownSlashCommands = (locale: Locale = "zh"): MarkdownSlashCommand[] => {
  const dict = locale === "en" ? en : zh

  const addContent = dict.markdown.templateAddContent
  const bugContent = dict.markdown.templateBugContent
  const refactorContent = dict.markdown.templateRefactorContent
  const commonContent = dict.markdown.templateCommonContent
  const styleContent = dict.markdown.templateStyleContent
  const suppleContent = dict.markdown.templateSuppleContent

  const templates: MarkdownSlashCommand[] = [
    {
      id: "addTemplate",
      label: "/addTemplate",
      description: dict.markdown.templateAddDesc,
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: addContent,
      cursorOffset: getTemplateCursorOffset(addContent),
    },
    {
      id: "bugTemplate",
      label: "/bugTemplate",
      description: dict.markdown.templateBugDesc,
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: bugContent,
      cursorOffset: getTemplateCursorOffset(bugContent),
    },
    {
      id: "refactorTemplate",
      label: "/refactorTemplate",
      description: dict.markdown.templateRefactorDesc,
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: refactorContent,
      cursorOffset: getTemplateCursorOffset(refactorContent),
    },
    {
      id: "commonTemplate",
      label: "/commonTemplate",
      description: dict.markdown.templateCommonDesc,
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: commonContent,
      cursorOffset: getTemplateCursorOffset(commonContent),
    },
    {
      id: "styleTemplate",
      label: "/styleTemplate",
      description: dict.markdown.templateStyleDesc,
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: styleContent,
      cursorOffset: getTemplateCursorOffset(styleContent),
    },
  ]

  // 补充需求命令：仅在模板块内可用，直接替换当前行插入嵌套子块。
  const suppleTemplate: MarkdownSlashCommand = {
    id: "suppleTemplate",
    label: "/suppleTemplate",
    description: dict.markdown.templateSuppleDesc,
    scope: "template",
    kind: "direct",
    source: "builtin",
    content: suppleContent,
    cursorOffset: getTemplateCursorOffset(suppleContent),
  }

  const summaryTitle: MarkdownSlashCommand = {
    id: "summaryTitle",
    label: "/summaryTitle",
    description: dict.markdown.templateSummaryTitleDesc,
    scope: "template",
    kind: "confirm",
    source: "builtin",
    content: "/summaryTitle ",
    cursorOffset: "/summaryTitle ".length,
  }

  const gitWorktree: MarkdownSlashCommand = {
    id: "gitWorktree",
    label: "/gitWorktree",
    description: dict.markdown.templateGitWorktreeDesc,
    scope: "both",
    kind: "select",
    source: "builtin",
    content: "/gitWorktree ",
    cursorOffset: "/gitWorktree ".length,
  }

  return [...templates, suppleTemplate, summaryTitle, gitWorktree]
}

// 默认内置命令（中文兜底与单测兼容）。
export const builtinMarkdownSlashCommands: MarkdownSlashCommand[] =
  getBuiltinMarkdownSlashCommands("zh")

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
 * - 选择型：行以「/命令 值」形态存在（标签后带非空值），等待回车触发；
 * 已武装状态下命令面板不弹出，Enter 直接触发该命令。
 */
export const getMarkdownArmedSlashCommand = (
  lineValue: string,
  isInsideTemplateBlock: boolean,
  customCommands: MarkdownSlashCommand[] = [],
): MarkdownSlashCommand | null => {
  const value = lineValue.trim()
  const allCommands = [...markdownSlashCommands, ...customCommands]
  return (
    allCommands.find((command) => {
      if (command.kind === "confirm") {
        return isInsideTemplateBlock && command.label === value
      }
      if (command.kind === "select") {
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
): boolean =>
  getMarkdownArmedSlashCommand(lineValue, isInsideTemplateBlock, customCommands) !== null

// 提取选择型命令行携带的值（标签后的首个词）；非选择型或缺失时返回 null。
export const getMarkdownSelectCommandValue = (
  lineValue: string,
  isInsideTemplateBlock: boolean,
  customCommands: MarkdownSlashCommand[] = [],
): string | null => {
  const command = getMarkdownArmedSlashCommand(lineValue, isInsideTemplateBlock, customCommands)
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
 * 获取与当前斜杠命令匹配的候选项；按光标所在上下文（模板块内/外）过滤命令可用范围。
 * isGitWorktreeAvailable 为 false 时排除 git 工作区切换命令（如 virtual 项目无 git 上下文）。
 * customCommands 支持传入自定义 Markdown 模板命令（已按 Project 覆盖 User 排序）。
 */
export const getMarkdownSlashCommands = (
  value: string,
  isInsideTemplateBlock = false,
  isGitWorktreeAvailable = true,
  customCommands: MarkdownSlashCommand[] = [],
  locale: Locale = "zh",
): MarkdownSlashCommand[] => {
  const match = /^\/([a-zA-Z0-9_-]*)$/i.exec(value)
  if (!match) return []

  const query = match[1].toLowerCase()
  const expectedScope: MarkdownSlashCommandScope = isInsideTemplateBlock ? "template" : "normal"
  const builtinCommands = getBuiltinMarkdownSlashCommands(locale)
  const allCommands = [...builtinCommands, ...customCommands]

  return allCommands.filter(
    (command) =>
      (command.scope === expectedScope || command.scope === "both") &&
      (isFuzzyMatch(query, command.id) || isFuzzyMatch(query, command.label.replace(/^\//, ""))) &&
      (command.id !== "gitWorktree" || isGitWorktreeAvailable),
  )
}

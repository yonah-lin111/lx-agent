import type { Locale } from "@shared/settings"
import { en } from "@/i18n/locales/en"
import { zh } from "@/i18n/locales/zh"
import {
  MARKDOWN_TEMPLATE_ADD_CONTENT,
  MARKDOWN_TEMPLATE_BUG_CONTENT,
  MARKDOWN_TEMPLATE_COMMON_CONTENT,
  MARKDOWN_TEMPLATE_LOG_CONTENT,
  MARKDOWN_TEMPLATE_REFACTOR_CONTENT,
  MARKDOWN_TEMPLATE_STYLE_CONTENT,
  MARKDOWN_TEMPLATE_SUPPLE_CONTENT,
  MARKDOWN_TEMPLATE_VAR_CONTENT,
} from "./templateContents"
import type { MarkdownSlashCommand } from "./types"

/**
 * 计算模板插入内容在首个输入占位处的光标偏移量。
 */
export const getTemplateCursorOffset = (content: string): number => {
  const lines = content.split("\n")
  let offset = 0
  for (const line of lines) {
    if (line.startsWith("- ") && (line.endsWith(": ") || line.endsWith("："))) {
      return offset + line.length
    }
    offset += line.length + 1
  }
  // 如果没有列表项占位符，且包含空标题「title: 」，则将光标精准定位在标题冒号之后
  const titleEmptyMatch = /「title:\s*」/.exec(content)
  if (titleEmptyMatch && titleEmptyMatch.index !== undefined) {
    return titleEmptyMatch.index + "「title: ".length
  }

  return content.length
}

/**
 * 获取模板内容中首个占位符 [xxx] 内部文本的选中范围（不包含中括号字符本身）。
 * 若存在多个占位符默认返回第一个内部文本；若内部为空或无方括号占位符则返回 null。
 */
export const getTemplatePlaceholderSelectionRange = (
  content: string,
): { start: number; end: number } | null => {
  const match = /\[([^\]\r\n]+)\]/.exec(content)
  if (!match || match.index === undefined) {
    return null
  }
  return {
    start: match.index + 1,
    end: match.index + 1 + match[1].length,
  }
}

/**
 * 计算变量模板初始插入时的选中范围，默认高亮选中首行 key: "var" 中的 key 标识。
 */
export const getVarTemplateInitialSelectionRange = (
  content: string,
): { start: number; end: number } | undefined => {
  const match = /^([ \t]*)([A-Za-z0-9_.-]+)\s*:/m.exec(content)
  if (!match || match.index === undefined) return undefined
  const start = match.index + match[1].length
  return {
    start,
    end: start + match[2].length,
  }
}

/**
 * 根据语言环境构造内置 Markdown 模板命令。
 * /xxxTemplate 系列命令移除语言国际化，统一使用英文正文与说明。
 */
export const getBuiltinMarkdownSlashCommands = (locale: Locale = "zh"): MarkdownSlashCommand[] => {
  const dict = locale === "en" ? en : zh

  const varContent = MARKDOWN_TEMPLATE_VAR_CONTENT
  const varSelection = getVarTemplateInitialSelectionRange(varContent)

  const templates: MarkdownSlashCommand[] = [
    {
      id: "varTemplate",
      label: "/varTemplate",
      description: "Insert variable template block",
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: varContent,
      cursorOffset: varSelection ? varSelection.end : getTemplateCursorOffset(varContent),
      selectionRange: varSelection,
    },
    {
      id: "addTemplate",
      label: "/addTemplate",
      description: "Insert add requirement template block",
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: MARKDOWN_TEMPLATE_ADD_CONTENT,
      cursorOffset: getTemplateCursorOffset(MARKDOWN_TEMPLATE_ADD_CONTENT),
    },
    {
      id: "bugTemplate",
      label: "/bugTemplate",
      description: "Insert fix bug template block",
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: MARKDOWN_TEMPLATE_BUG_CONTENT,
      cursorOffset: getTemplateCursorOffset(MARKDOWN_TEMPLATE_BUG_CONTENT),
    },
    {
      id: "refactorTemplate",
      label: "/refactorTemplate",
      description: "Insert refactor feature template block",
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: MARKDOWN_TEMPLATE_REFACTOR_CONTENT,
      cursorOffset: getTemplateCursorOffset(MARKDOWN_TEMPLATE_REFACTOR_CONTENT),
    },
    {
      id: "commonTemplate",
      label: "/commonTemplate",
      description: "Insert execute task template block",
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: MARKDOWN_TEMPLATE_COMMON_CONTENT,
      cursorOffset: getTemplateCursorOffset(MARKDOWN_TEMPLATE_COMMON_CONTENT),
    },
    {
      id: "styleTemplate",
      label: "/styleTemplate",
      description: "Insert design style template block",
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: MARKDOWN_TEMPLATE_STYLE_CONTENT,
      cursorOffset: getTemplateCursorOffset(MARKDOWN_TEMPLATE_STYLE_CONTENT),
    },
  ]

  // 补充需求命令：仅在模板块内可用，直接替换当前行插入嵌套子块。
  const suppleTemplate: MarkdownSlashCommand = {
    id: "suppleTemplate",
    label: "/suppleTemplate",
    description: "Insert supplementary requirements subblock",
    scope: "template",
    kind: "direct",
    source: "builtin",
    content: MARKDOWN_TEMPLATE_SUPPLE_CONTENT,
    cursorOffset: getTemplateCursorOffset(MARKDOWN_TEMPLATE_SUPPLE_CONTENT),
  }

  // 运行日志命令：仅在模板块内可用，直接替换当前行插入嵌套日志块。
  const logTemplate: MarkdownSlashCommand = {
    id: "logTemplate",
    label: "/logTemplate",
    description: "Insert execution log subblock",
    scope: "template",
    kind: "direct",
    source: "builtin",
    content: MARKDOWN_TEMPLATE_LOG_CONTENT,
    cursorOffset: getTemplateCursorOffset(MARKDOWN_TEMPLATE_LOG_CONTENT),
  }

  // 固定 @ 内容块追加命令：全 page 可用，回显 /addContent [content] 并选中参数，回车写入首个变量块的 @content。
  const addContent: MarkdownSlashCommand = {
    id: "addContent",
    label: "/addContent",
    description: "Add a @file or @reference into the @content block of the first variable block",
    scope: "all",
    kind: "argument",
    source: "builtin",
    content: "/addContent [content]",
    cursorOffset: "/addContent [content]".length,
    argumentHint: "[content]",
  }

  const sendPrompt: MarkdownSlashCommand = {
    id: "sendPrompt",
    label: "/sendPrompt",
    description: dict.markdown.templateSendPromptDesc,
    scope: "template",
    kind: "select",
    source: "builtin",
    content: "/sendPrompt ",
    cursorOffset: "/sendPrompt ".length,
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

  const singleLine: MarkdownSlashCommand = {
    id: "singleLine",
    label: "/singleLine",
    description: "Insert single-line variable (key: value)",
    scope: "varTemplate",
    kind: "direct",
    source: "builtin",
    content: 'key: "value"',
    cursorOffset: 3,
    selectionRange: { start: 0, end: 3 },
  }

  const multiLine: MarkdownSlashCommand = {
    id: "multiLine",
    label: "/multiLine",
    description: "Insert multi-line variable with triple quotes",
    scope: "varTemplate",
    kind: "direct",
    source: "builtin",
    content: ["key:", '  """', "  var", '  """'].join("\n"),
    cursorOffset: 3,
    selectionRange: { start: 0, end: 3 },
  }

  return [
    ...templates,
    suppleTemplate,
    logTemplate,
    addContent,
    sendPrompt,
    summaryTitle,
    gitWorktree,
    singleLine,
    multiLine,
  ]
}

// 默认内置命令（中文兜底与单测兼容）。
export const builtinMarkdownSlashCommands: MarkdownSlashCommand[] =
  getBuiltinMarkdownSlashCommands("zh")

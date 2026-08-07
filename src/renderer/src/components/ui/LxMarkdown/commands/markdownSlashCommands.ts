// Markdown 模板命令标识。
export type MarkdownTemplateCommandId =
  | "addTemplate"
  | "bugTemplate"
  | "refactorTemplate"
  | "commonTemplate"

// Markdown 斜杠命令标识。
export type MarkdownSlashCommandId = MarkdownTemplateCommandId | "summary"

// Markdown 斜杠命令可用范围：normal = 模板块外（文档正文），template = 模板块内。
export type MarkdownSlashCommandScope = "normal" | "template"

// Markdown 斜杠命令触发类型：direct = 面板选中即插入内容，confirm = 回显命令文本、二次回车触发。
export type MarkdownSlashCommandKind = "direct" | "confirm"

// Markdown 斜杠命令配置。
export interface MarkdownSlashCommand {
  id: MarkdownSlashCommandId
  label: string
  description: string
  content: string
  cursorOffset: number
  scope: MarkdownSlashCommandScope
  kind: MarkdownSlashCommandKind
}

// 斜杠命令行范围。
export interface MarkdownSlashCommandLine {
  from: number
  to: number
  value: string
}

const templateCommands: MarkdownSlashCommand[] = [
  {
    id: "addTemplate",
    label: "/addTemplate",
    description: "插入需求提示词模板",
    scope: "normal",
    kind: "direct",
    content:
      "&&& addTemplate 「title: 」\n# 添加需求\n\n- 参考: \n- 位置: \n- 描述: \n- 要求: \n  - \n- 注意: \n  - \n&&&",
    cursorOffset: "&&& addTemplate 「title: 」\n# 添加需求\n\n- 参考: ".length,
  },
  {
    id: "bugTemplate",
    label: "/bugTemplate",
    description: "插入 Bug 修复提示词模板",
    scope: "normal",
    kind: "direct",
    content:
      "&&& bugTemplate 「title: 」\n# 修复 Bug\n\n- 参考: \n- 位置: \n- 描述: \n- 复现: \n- 要求: \n  - \n- 期望: \n&&&",
    cursorOffset: "&&& bugTemplate 「title: 」\n# 修复 Bug\n\n- 参考: ".length,
  },
  {
    id: "refactorTemplate",
    label: "/refactorTemplate",
    description: "插入功能重构提示词模板",
    scope: "normal",
    kind: "direct",
    content:
      "&&& refactorTemplate 「title: 」\n# 重构功能\n\n- 参考: \n- 位置: \n- 目标: \n- 要求: \n  - \n- 注意: \n  - \n&&&",
    cursorOffset: "&&& refactorTemplate 「title: 」\n# 重构功能\n\n- 参考: ".length,
  },
  // 通用提示词模板（通用模板，非代码修改模板）
  {
    id: "commonTemplate",
    label: "/commonTemplate",
    description: "插入通用提示词模板（非代码修改模板）",
    scope: "normal",
    kind: "direct",
    content: [
      "&&& commonTemplate 「title: 」",
      "# 执行任务",
      "",
      "- 参考: ",
      "- 位置: ",
      "- 要求: ",
      "  - ",
      "- 注意: ",
      "  - ",
      "- 期望: ",
      "&&&",
    ].join("\n"),
    cursorOffset: ["&&& commonTemplate 「title: 」", "# 执行任务", "", "- 参考: "].join("\n")
      .length,
  },
]

// 模板块内的 AI 标题命令：确认型（回显 /summary、二次回车触发），content 为回显文本（带尾随空格）。
const summaryCommand: MarkdownSlashCommand = {
  id: "summary",
  label: "/summary",
  description: "AI 提炼当前模板块标题",
  scope: "template",
  kind: "confirm",
  content: "/summary ",
  cursorOffset: "/summary ".length,
}

// 全部斜杠命令（含确认型），供 armed 判定使用。
const markdownSlashCommands: MarkdownSlashCommand[] = [...templateCommands, summaryCommand]

/**
 * 判定光标行是否为已武装的确认命令行：行内容与某个确认命令标签完全一致且位于模板块内。
 * 此状态下命令面板不弹出，Enter 直接触发该命令。
 */
export const isMarkdownConfirmCommandArmed = (
  lineValue: string,
  isInsideTemplateBlock: boolean,
): boolean => {
  if (!isInsideTemplateBlock) return false
  const value = lineValue.trim()
  return markdownSlashCommands.some(
    (command) => command.kind === "confirm" && command.label === value,
  )
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
 */
export const getMarkdownSlashCommands = (
  value: string,
  isInsideTemplateBlock = false,
): MarkdownSlashCommand[] => {
  const match = /^\/(\w*)$/i.exec(value)
  if (!match) return []

  const query = match[1].toLowerCase()
  const expectedScope: MarkdownSlashCommandScope = isInsideTemplateBlock ? "template" : "normal"
  return markdownSlashCommands.filter(
    (command) => command.scope === expectedScope && command.id.includes(query),
  )
}

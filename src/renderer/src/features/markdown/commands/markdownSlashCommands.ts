// Markdown 模板命令标识。
export type MarkdownTemplateCommandId =
  | "addTemplate"
  | "bugTemplate"
  | "refactorTemplate"
  | "commonTemplate"

// Markdown 斜杠命令标识。
export type MarkdownSlashCommandId = MarkdownTemplateCommandId | "summaryTitle" | "gitWorktree"

// Markdown 斜杠命令可用范围：normal = 模板块外（文档正文），template = 模板块内，both = 两者皆可。
export type MarkdownSlashCommandScope = "normal" | "template" | "both"

// Markdown 斜杠命令触发类型：
// - direct = 面板选中即插入内容；
// - confirm = 回显命令文本、二次回车触发；
// - select = 回显命令文本后打开二级选择面板，选中回显值、再回车触发。
export type MarkdownSlashCommandKind = "direct" | "confirm" | "select"

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

// 模板块内的 AI 标题命令：确认型（回显 /summaryTitle、二次回车触发），content 为回显文本（带尾随空格）。
const summaryTitleCommand: MarkdownSlashCommand = {
  id: "summaryTitle",
  label: "/summaryTitle",
  description: "AI 提炼当前模板块标题",
  scope: "template",
  kind: "confirm",
  content: "/summaryTitle ",
  cursorOffset: "/summaryTitle ".length,
}

// 模板块内外的 git 工作区切换命令：选择型（回显 /gitWorktree、打开二级工作区面板，选中回显分支名、回车触发切换）。
const gitWorktreeCommand: MarkdownSlashCommand = {
  id: "gitWorktree",
  label: "/gitWorktree",
  description: "切换当前 git 工作区",
  scope: "both",
  kind: "select",
  content: "/gitWorktree ",
  cursorOffset: "/gitWorktree ".length,
}

// 全部斜杠命令（含确认型与选择型），供 armed 判定使用。
const markdownSlashCommands: MarkdownSlashCommand[] = [
  ...templateCommands,
  summaryTitleCommand,
  gitWorktreeCommand,
]

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
): MarkdownSlashCommand | null => {
  const value = lineValue.trim()
  return (
    markdownSlashCommands.find((command) => {
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
): boolean => getMarkdownArmedSlashCommand(lineValue, isInsideTemplateBlock) !== null

// 提取选择型命令行携带的值（标签后的首个词）；非选择型或缺失时返回 null。
export const getMarkdownSelectCommandValue = (
  lineValue: string,
  isInsideTemplateBlock: boolean,
): string | null => {
  const command = getMarkdownArmedSlashCommand(lineValue, isInsideTemplateBlock)
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
 */
export const getMarkdownSlashCommands = (
  value: string,
  isInsideTemplateBlock = false,
  isGitWorktreeAvailable = true,
): MarkdownSlashCommand[] => {
  const match = /^\/(\w*)$/i.exec(value)
  if (!match) return []

  const query = match[1].toLowerCase()
  const expectedScope: MarkdownSlashCommandScope = isInsideTemplateBlock ? "template" : "normal"
  return markdownSlashCommands.filter(
    (command) =>
      (command.scope === expectedScope || command.scope === "both") &&
      isFuzzyMatch(query, command.id) &&
      (command.id !== "gitWorktree" || isGitWorktreeAvailable),
  )
}

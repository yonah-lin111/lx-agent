// Markdown 模板命令标识。
export type MarkdownTemplateCommandId =
  | "addTemplate"
  | "bugTemplate"
  | "refactorTemplate"
  | "commonTemplate"

// Markdown 斜杠命令配置。
export interface MarkdownSlashCommand {
  id: MarkdownTemplateCommandId
  label: string
  description: string
  content: string
  cursorOffset: number
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
    content:
      "&&& addTemplate\n# 添加需求\n\n- 位置：\n- 描述：\n- 要求：\n  - \n- 注意：\n  - \n&&&",
    cursorOffset: "&&& addTemplate\n# 添加需求\n\n- 位置：".length,
  },
  {
    id: "bugTemplate",
    label: "/bugTemplate",
    description: "插入 Bug 修复提示词模板",
    content:
      "&&& bugTemplate\n# 修复 Bug\n\n- 位置：\n- 描述：\n- 复现：-> ->\n- 要求：\n  - \n- 期望：\n&&&",
    cursorOffset: "&&& bugTemplate\n# 修复 Bug\n\n- 位置：".length,
  },
  {
    id: "refactorTemplate",
    label: "/refactorTemplate",
    description: "插入功能重构提示词模板",
    content:
      "&&& refactorTemplate\n# 重构功能\n\n- 位置：\n- 目标：\n- 要求：\n  - \n- 注意：\n  - \n&&&",
    cursorOffset: "&&& refactorTemplate\n# 重构功能\n\n- 位置：".length,
  },
  // 通用提示词模板（通用模板，非代码修改模板）
  {
    id: "commonTemplate",
    label: "/commonTemplate",
    description: "插入通用提示词模板（非代码修改模板）",
    content: [
      "&&& commonTemplate",
      "# 执行任务",
      "",
      "- 位置：",
      "- 要求：",
      "  - ",
      "- 注意：",
      "  - ",
      "- 期望：",
      "&&&",
    ].join("\n"),
    cursorOffset: ["&&& commonTemplate", "# 执行任务", "", "- 位置："].join("\n").length,
  },
]

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
 * 获取与当前斜杠命令匹配的候选项。
 */
export const getMarkdownSlashCommands = (value: string): MarkdownSlashCommand[] => {
  const match = /^\/(\w*)$/i.exec(value)
  if (!match) return []

  const query = match[1].toLowerCase()
  return templateCommands.filter((command) => command.id.includes(query))
}

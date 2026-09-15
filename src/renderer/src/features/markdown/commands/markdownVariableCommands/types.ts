// 页面预设变量条目。
export interface MarkdownVariableEntry {
  name: string
  value: string
}

// 页面变量触发信息。
export interface MarkdownVariableTrigger {
  fragment: string
  start: number
  triggerChar: "$" | "¥"
}

// 冒号命令触发信息。
export interface MarkdownColonTrigger {
  indent: string
  key: string
  from: number
  to: number
}

export interface VarBlockTabTarget {
  type: "key" | "value"
  from: number
  to: number
  lineNum: number
}

export interface MarkdownVarBlockActionResult {
  success: boolean
  isAlreadyTop?: boolean
  changes?: { from: number; to: number; insert: string }[]
}

export interface ApplyMarkdownTemplatePresetResult {
  from: number
  to: number
  insert: string
  cursor?: number
}

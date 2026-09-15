// 代码 diff 展示契约：词级片段、展示行与结构化负载。

// 词级 diff 片段：文本 + 是否变更（变更片段渲染为逆色高亮）。
export interface DiffLinePart {
  text: string
  // 是否变更 token（渲染为逆色高亮）。
  changed: boolean
}

// diff 展示行。
export interface AgentDiffLine {
  type: "context" | "add" | "del"
  // 旧文件行号（context/del 行）。
  oldLine?: number
  // 新文件行号（context/add 行）。
  newLine?: number
  // 行内容。
  text: string
  // 单行替换的词级高亮片段（仅 add/del 行，纯渲染用）。
  parts?: DiffLinePart[]
}

// 结构化 diff 负载（edit/write 工具的展示副产品，随 ToolResultMessage 落库）。
export interface AgentDiff {
  // 被修改的文件路径（旧消息可能缺失，渲染端需容错）。
  fileName?: string
  lines: AgentDiffLine[]
  // 是否因变更行数超限截断（渲染端显示提示条）。
  truncated: boolean
  // 变更统计（全量，不受截断影响）。
  stats: {
    added: number
    removed: number
  }
}

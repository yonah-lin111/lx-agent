// 模板块源码状态：未完成 / 进行中 / 已完成。
export type MarkdownTemplateStatus = "todo" | "in_progress" | "done"

export interface MarkdownListContinuation {
  prefix: string
  markerLength: number
  empty: boolean
}

export interface ParsedMarkdownSuppleEnd {
  indent: string
  command: string
  id?: string
  wt?: string
}

// 规范化后的模板块正文与标题兜底。
export interface NormalizedAgentBlockBody {
  content: string
  title?: string
}

// 前端设计画布共享视图类型。

export type ViewportMode = "desktop" | "tablet" | "mobile"

// 画布批注条目。
export interface DesignAnnotation {
  id: string
  // 无空格无括号的 CSS 选择器，可被 @design mention 语法承载。
  selector: string
  // 元素描述，如 button.primary。
  description: string
  comment: string
  // 画布气泡编号，按清单顺序重排。
  index: number
  createdAt: number
}

// 体检问题分组。
export type PreviewIssueGroup = "runtime" | "a11y"

// 体检问题级别。
export type PreviewIssueLevel = "error" | "warning"

// 可用性审计规则标识。
export type A11yRuleId =
  | "alt"
  | "accessible-name"
  | "contrast"
  | "target-size"
  | "form-label"
  | "lang"

// 审计原始发现：仅描述规则与实测值，展示与回流文案在 issueFormat 中生成。
export interface A11yFinding {
  rule: A11yRuleId
  level: PreviewIssueLevel
  selector?: string
  values?: Record<string, string | number>
}

// 体检问题条目。
export interface PreviewIssue {
  id: string
  group: PreviewIssueGroup
  level: PreviewIssueLevel
  rule?: A11yRuleId
  // 面板展示文案。
  message: string
  // 回流给 Agent 的定向指令。
  instruction: string
  selector?: string
  detail?: string
  count: number
}

// 从画布计算样式提取出的设计令牌候选。
export interface ExtractedDesignTokens {
  // 高频颜色，已归一化为 hex，按出现频次降序。
  colors: string[]
  // 出现频次最高的非零圆角，如 "8px"。
  radius: string | null
  // body 计算字体栈首项，如 "Inter"。
  fontFamily: string | null
}

import type {
  FrontDesignUpdateAction,
  GrillQuestionData,
  ReviewFindingItem,
  ReviewFindingsData,
  ReviewSeverity,
} from "../types"

// 结构化标签内容解析器：把各协议标签的正文解析为结构化数据（plan / review / grill / front design 属性）。
// 与标签切分逻辑（structuredTags）拆分职责，保持单文件小体量。

const UPDATE_ACTIONS = new Set<string>(["replace", "append", "prepend", "before", "after"])

// 归一化模型给出的更新动作；未知值一律退回 replace。
const normalizeUpdateAction = (value: string | undefined): FrontDesignUpdateAction => {
  const normalized = value?.trim().toLowerCase()
  return normalized && UPDATE_ACTIONS.has(normalized)
    ? (normalized as FrontDesignUpdateAction)
    : "replace"
}

export const extractFrontDesignAttributes = (
  tagStr: string,
): {
  title?: string
  id?: string
  parentId?: string
  mode?: "tailwindcss" | "css"
  target?: string
  action: FrontDesignUpdateAction
} => {
  const titleMatch = /title=["']([^"']*)["']/i.exec(tagStr)
  // 边界保护：`parent_id="x"` / `parentId="x"` 中的 `id=` 不得被误认为本标签自身的 id。
  const idMatch = /(?<![A-Za-z0-9_-])id=["']([^"']*)["']/i.exec(tagStr)
  const parentIdMatch = /(?:parent_id|parentId)=["']([^"']*)["']/i.exec(tagStr)
  const modeMatch = /mode=["']([^"']*)["']/i.exec(tagStr)
  const actionMatch = /action=["']([^"']*)["']/i.exec(tagStr)
  let target: string | undefined
  const bracketTargetMatch = /target=["']?(\[[^\]]+\])["']?/i.exec(tagStr)
  if (bracketTargetMatch) {
    target = bracketTargetMatch[1].replace(
      /\[\s*([a-zA-Z0-9_-]+)\s*=\s*["']?([^"'\]\s]+)["']?\s*\]/g,
      "[$1=$2]",
    )
  } else {
    const targetMatch = /target=["']([^"']*)["']/i.exec(tagStr)
    target = targetMatch ? targetMatch[1].trim() : undefined
  }

  const rawMode = modeMatch ? modeMatch[1].trim().toLowerCase() : undefined
  const mode = rawMode === "css" ? "css" : "tailwindcss"

  return {
    title: titleMatch ? titleMatch[1].trim() : undefined,
    id: idMatch ? idMatch[1].trim() : undefined,
    parentId: parentIdMatch ? parentIdMatch[1].trim() : undefined,
    mode,
    target,
    action: normalizeUpdateAction(actionMatch?.[1]),
  }
}

// 提取计划内容中的首个标题（支持 # 或 ##）。
export const extractPlanTitle = (content: string): string | undefined => {
  const matchH1 = /^#\s+(.+)$/m.exec(content)
  if (matchH1) return matchH1[1].trim()
  const matchH2 = /^##\s+(.+)$/m.exec(content)
  if (matchH2) return matchH2[1].trim()
  return undefined
}

// 解析 Review Findings 文本内容，提取摘要和结构化 Finding 列表
export const parseReviewFindingsContent = (
  content: string,
  raw: string,
  isStreaming: boolean,
): ReviewFindingsData => {
  let summary = ""
  const findings: ReviewFindingItem[] = []

  // 1. 提取 Summary
  const summaryMatch = /##\s*Summary\s*([\s\S]*?)(?=###\s*Finding|\s*$)/i.exec(content)
  if (summaryMatch) {
    summary = summaryMatch[1].trim()
  }

  // 2. 提取每个 Finding 块
  const findingRegex =
    /###\s*Finding(?:\s*\d+)?:\s*([^\n]+)\n([\s\S]*?)(?=(?:###\s*Finding|\s*$))/gi
  let match: RegExpExecArray | null = null
  let count = 0

  while ((match = findingRegex.exec(content)) !== null) {
    count++
    const title = match[1].trim()
    const body = match[2]

    // 解析 Severity
    const severityMatch = /-\s*\*\*Severity\*\*:\s*(Critical|High|Medium|Low)/i.exec(body)
    const severityRaw = severityMatch ? severityMatch[1].toLowerCase() : "medium"
    const severity = (
      ["critical", "high", "medium", "low"].includes(severityRaw) ? severityRaw : "medium"
    ) as ReviewSeverity

    // 解析 Location (`path/to/file.ts:42` 或 `path/to/file.ts:42-50`)
    const locationMatch =
      /-\s*\*\*Location\*\*:\s*`?([^\n:`]+?)(?::(\d+)(?:-(\d+))?)?`?(?:\s|$)/i.exec(body)
    let filePath = "workspace"
    let lineStart = 1
    let lineEnd: number | undefined

    if (locationMatch) {
      filePath = locationMatch[1].trim()
      if (locationMatch[2]) {
        lineStart = parseInt(locationMatch[2], 10)
      }
      if (locationMatch[3]) {
        lineEnd = parseInt(locationMatch[3], 10)
      }
    }

    // 解析 Description
    const descriptionMatch =
      /-\s*\*\*Description\*\*:\s*([\s\S]*?)(?=-\s*\*\*Suggestion\*\*|\s*$)/i.exec(body)
    const description = descriptionMatch ? descriptionMatch[1].trim() : body.trim()

    // 解析 Suggestion
    const suggestionMatch = /-\s*\*\*Suggestion\*\*:\s*([\s\S]*?)$/i.exec(body)
    const suggestion = suggestionMatch ? suggestionMatch[1].trim() : undefined

    findings.push({
      id: `finding-${count}-${Date.now()}`,
      title,
      severity,
      location: {
        filePath,
        lineStart,
        lineEnd,
      },
      description,
      suggestion,
    })
  }

  return {
    summary: summary || (findings.length > 0 ? "Code review audit completed." : content.trim()),
    findings,
    raw,
    isStreaming,
  }
}

// grill-me 字段标签：中文为契约规范形态，英文为本地化形态；兼容 Markdown 加粗与中英文冒号。
// 举例说明标签必须先于推荐标签匹配（"推荐举例说明" 以 "推荐" 开头）。
const GRILL_FIELD_PATTERNS: {
  field: "question" | "recommendation" | "example"
  pattern: RegExp
}[] = [
  {
    field: "example",
    pattern:
      /^(?:\*\*)?(?:推荐举例说明|举例说明|recommendation example|example)(?:\*\*)?\s*[:：]\s*/i,
  },
  {
    field: "recommendation",
    pattern: /^(?:\*\*)?(?:推荐|recommendation)(?:\*\*)?\s*[:：]\s*/i,
  },
  { field: "question", pattern: /^(?:\*\*)?(?:问题|question)(?:\*\*)?\s*[:：]\s*/i },
]

/**
 * 解析 <grill_question> 正文：按 问题 / 推荐 / 推荐举例说明 三个标签切分字段，
 * 支持字段多行内容与流式未写完的半截内容（缺失字段保持空串）。
 */
export const parseGrillQuestionContent = (
  content: string,
  raw: string,
  isStreaming: boolean,
): GrillQuestionData => {
  const fields: Record<"question" | "recommendation" | "example", string> = {
    question: "",
    recommendation: "",
    example: "",
  }
  let current: keyof typeof fields | null = null

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const matched = GRILL_FIELD_PATTERNS.find(({ pattern }) => pattern.test(trimmed))
    if (matched) {
      current = matched.field
      const value = trimmed.replace(matched.pattern, "").trim()
      if (value) {
        fields[current] = fields[current] ? `${fields[current]}\n${value}` : value
      }
      continue
    }
    if (current) {
      fields[current] = fields[current] ? `${fields[current]}\n${trimmed}` : trimmed
    }
  }

  return {
    question: fields.question,
    recommendation: fields.recommendation,
    example: fields.example,
    raw,
    isStreaming,
  }
}

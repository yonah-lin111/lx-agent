// 设计评审消息回流：把批注与体检问题编译为 Agent 可解析的 mention 消息（纯函数，无副作用）。

import type { DesignAnnotation, PreviewIssue } from "@/pages/front-design/types"

// mention 选择器约束：`@design` 解析不允许空白与括号，含则降级为编号说明。
export const isMentionSafeSelector = (selector: string | undefined): boolean => {
  if (!selector) return false
  return !/[\s()]/.test(selector)
}

// mention 内联文本（标题 / 描述）清洗：去除括号与换行，避免撑破 `(description)` 分组。
export const sanitizeMentionText = (text: string): string =>
  text
    .replace(/[()\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

// mention 选择器归一化：`#id` 形式剥离前缀井号，避免产出 `##id`。
export const toMentionSelector = (selector: string): string =>
  selector.startsWith("#") ? selector.replace(/^#+/, "") : selector

export interface BuildAnnotationReviewMessageOptions {
  designId: string
  annotations: DesignAnnotation[]
  // 已按当前语言格式化的头行（含数量）。
  header: string
}

/**
 * 批注回流消息：每条批注独占一行 mention，选择器不安全时降级为编号说明行。
 */
export const buildAnnotationReviewMessage = ({
  designId,
  annotations,
  header,
}: BuildAnnotationReviewMessageOptions): string => {
  const mentionLines: string[] = []
  const fallbackLines: string[] = []

  for (const annotation of annotations) {
    const comment = annotation.comment.trim()
    if (!comment) continue

    if (isMentionSafeSelector(annotation.selector)) {
      const description = sanitizeMentionText(annotation.description)
      const suffix = description ? ` (${description})` : ""
      mentionLines.push(
        `@design:${designId}#${toMentionSelector(annotation.selector)}${suffix} ${comment}`,
      )
    } else {
      fallbackLines.push(`- ${annotation.selector || annotation.description} ${comment}`)
    }
  }

  if (mentionLines.length === 0 && fallbackLines.length === 0) return ""
  return `${header}\n${[...mentionLines, ...fallbackLines].join("\n")}`
}

export interface BuildIssueReviewMessageOptions {
  designId: string
  title: string
  issues: PreviewIssue[]
  // 已按当前语言格式化的头行（含数量）。
  header: string
}

/**
 * 体检回流消息：设计级 mention 注入完整基线，编号清单携带路径选择器供 Agent 作为 target 使用。
 */
export const buildIssueReviewMessage = ({
  designId,
  title,
  issues,
  header,
}: BuildIssueReviewMessageOptions): string => {
  if (issues.length === 0) return ""

  const lines = issues.map((issue, index) => {
    const selectorPart = issue.selector ? `\`${issue.selector}\` ` : ""
    return `${index + 1}. ${selectorPart}${issue.instruction}`
  })
  const cleanTitle = sanitizeMentionText(title)
  const titleSuffix = cleanTitle ? ` (${cleanTitle})` : ""

  return `@design:${designId}${titleSuffix} ${header}\n${lines.join("\n")}`
}

// 快捷迭代动作标识（文案与指令由调用方按当前语言注入）。
export type DesignIterateActionId = "states" | "responsive" | "dark" | "micro" | "variant"

export interface BuildIterateMessageOptions {
  designId: string
  title: string
  // 已按当前语言格式化的动作指令。
  instruction: string
}

/**
 * 快捷迭代消息：设计级 mention 携带完整基线，动作指令追加在 mention 行尾。
 */
export const buildIterateMessage = ({
  designId,
  title,
  instruction,
}: BuildIterateMessageOptions): string => {
  const cleanInstruction = instruction.trim()
  if (!designId || !cleanInstruction) return ""

  const cleanTitle = sanitizeMentionText(title)
  const titleSuffix = cleanTitle ? ` (${cleanTitle})` : ""

  return `@design:${designId}${titleSuffix} ${cleanInstruction}`
}

import type { ChatBlock } from "../types"
import {
  extractPlanTitle,
  parseGrillQuestionContent,
  parseReviewFindingsContent,
} from "./tagContentParsers"

// 结构化标签切分：识别 <proposed_plan> / <review_findings> / <grill_question> 标签，
// 把助手文本拆分为结构化块与普通文本块；内容解析见 tagContentParsers。

const PROPOSED_PLAN_OPEN_REGEX = /<proposed_plan>/i
const PROPOSED_PLAN_CLOSE_REGEX = /<\/proposed_plan>/i

const REVIEW_FINDINGS_OPEN_REGEX = /<review_findings>/i
const REVIEW_FINDINGS_CLOSE_REGEX = /<\/review_findings>/i

// 属性值内的 `>` 是合法字符，因此开标签必须按引号配对解析，不能简单用 [^>]* 截断。
const buildOpenTagRegex = (tagName: string): RegExp =>
  new RegExp(
    `<${tagName}(?=[\\s>])(?:\\s+[a-zA-Z0-9_-]+(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?)*\\s*>`,
    "i",
  )

const GRILL_QUESTION_OPEN_REGEX = buildOpenTagRegex("grill_question")
const GRILL_QUESTION_CLOSE_REGEX = /<\/grill_question>/i

// 定稿消息中的未闭合标签视为正文引用（如报告里提到标签名）：保留原文本并继续解析其后的合法结构化块。
const parseAfterUnclosedTag = (
  text: string,
  openTagEndIndex: number,
  durationMs?: number,
): ChatBlock[] => {
  const tailBlocks = parseTextWithProposedPlan(text.slice(openTagEndIndex), durationMs, false)
  if (tailBlocks.length === 1 && tailBlocks[0].kind === "text") {
    return [{ kind: "text", text, durationMs }]
  }
  return [{ kind: "text", text: text.slice(0, openTagEndIndex), durationMs }, ...tailBlocks]
}

// 解析文本块，若包含 <proposed_plan>、<review_findings> 或 <grill_question> 标签则拆分为独立结构化块与文本块。
// isStreaming 为 true 时允许未闭合标签（流式渐进渲染）；定稿消息必须成对闭合，避免正文引用标签名误触发卡片。
export const parseTextWithProposedPlan = (
  text: string,
  durationMs?: number,
  isStreaming = false,
): ChatBlock[] => {
  if (!text) return []

  const reviewOpenMatch = REVIEW_FINDINGS_OPEN_REGEX.exec(text)
  const planOpenMatch = PROPOSED_PLAN_OPEN_REGEX.exec(text)
  const grillOpenMatch = GRILL_QUESTION_OPEN_REGEX.exec(text)

  type Candidate = {
    type: "review" | "plan" | "grill"
    index: number
  }
  const candidates: Candidate[] = []
  if (reviewOpenMatch) candidates.push({ type: "review", index: reviewOpenMatch.index })
  if (planOpenMatch) candidates.push({ type: "plan", index: planOpenMatch.index })
  if (grillOpenMatch) candidates.push({ type: "grill", index: grillOpenMatch.index })

  if (candidates.length === 0) {
    return [{ kind: "text", text, durationMs }]
  }

  candidates.sort((a, b) => a.index - b.index)
  const earliest = candidates[0].type

  if (earliest === "review" && reviewOpenMatch) {
    const openIndex = reviewOpenMatch.index
    const openTagLength = reviewOpenMatch[0].length
    const contentStartIndex = openIndex + openTagLength
    const remainingText = text.slice(contentStartIndex)
    const closeMatch = REVIEW_FINDINGS_CLOSE_REGEX.exec(remainingText)

    if (!closeMatch && !isStreaming) {
      return parseAfterUnclosedTag(text, contentStartIndex, durationMs)
    }

    const result: ChatBlock[] = []
    const before = text.slice(0, openIndex).trim()
    if (before.length > 0) {
      result.push({ kind: "text", text: before })
    }

    if (!closeMatch) {
      const findingsContent = remainingText.trim()
      result.push({
        kind: "reviewFindings",
        findings: parseReviewFindingsContent(findingsContent, text.slice(openIndex), true),
        durationMs,
      })
    } else {
      const closeIndexInRemaining = closeMatch.index
      const findingsContent = remainingText.slice(0, closeIndexInRemaining).trim()
      const after = remainingText.slice(closeIndexInRemaining + closeMatch[0].length).trim()

      result.push({
        kind: "reviewFindings",
        findings: parseReviewFindingsContent(
          findingsContent,
          text.slice(openIndex, contentStartIndex + closeIndexInRemaining + closeMatch[0].length),
          false,
        ),
        durationMs,
      })

      if (after.length > 0) {
        result.push(...parseTextWithProposedPlan(after, durationMs, isStreaming))
      }
    }

    return result
  }

  if (earliest === "plan" && planOpenMatch) {
    const openIndex = planOpenMatch.index
    const openTagLength = planOpenMatch[0].length
    const contentStartIndex = openIndex + openTagLength
    const remainingText = text.slice(contentStartIndex)
    const closeMatch = PROPOSED_PLAN_CLOSE_REGEX.exec(remainingText)

    if (!closeMatch && !isStreaming) {
      return parseAfterUnclosedTag(text, contentStartIndex, durationMs)
    }

    const result: ChatBlock[] = []
    const before = text.slice(0, openIndex).trim()
    if (before.length > 0) {
      result.push({ kind: "text", text: before })
    }

    if (!closeMatch) {
      const planContent = remainingText.trim()
      result.push({
        kind: "proposedPlan",
        plan: {
          title: extractPlanTitle(planContent),
          content: planContent,
          raw: text.slice(openIndex),
          isStreaming: true,
        },
        durationMs,
      })
    } else {
      const closeIndexInRemaining = closeMatch.index
      const planContent = remainingText.slice(0, closeIndexInRemaining).trim()
      const after = remainingText.slice(closeIndexInRemaining + closeMatch[0].length).trim()

      result.push({
        kind: "proposedPlan",
        plan: {
          title: extractPlanTitle(planContent),
          content: planContent,
          raw: text.slice(
            openIndex,
            contentStartIndex + closeIndexInRemaining + closeMatch[0].length,
          ),
          isStreaming: false,
        },
        durationMs,
      })

      if (after.length > 0) {
        result.push(...parseTextWithProposedPlan(after, durationMs, isStreaming))
      }
    }

    return result
  }

  if (earliest === "grill" && grillOpenMatch) {
    const openIndex = grillOpenMatch.index
    const openTagLength = grillOpenMatch[0].length
    const contentStartIndex = openIndex + openTagLength
    const remainingText = text.slice(contentStartIndex)
    const closeMatch = GRILL_QUESTION_CLOSE_REGEX.exec(remainingText)

    if (!closeMatch && !isStreaming) {
      return parseAfterUnclosedTag(text, contentStartIndex, durationMs)
    }

    const result: ChatBlock[] = []
    const before = text.slice(0, openIndex).trim()
    if (before.length > 0) {
      result.push({ kind: "text", text: before })
    }

    if (!closeMatch) {
      const content = remainingText.trim()
      result.push({
        kind: "grillQuestion",
        grill: parseGrillQuestionContent(content, text.slice(openIndex), true),
        durationMs,
      })
    } else {
      const closeIndexInRemaining = closeMatch.index
      const content = remainingText.slice(0, closeIndexInRemaining).trim()
      const after = remainingText.slice(closeIndexInRemaining + closeMatch[0].length).trim()

      result.push({
        kind: "grillQuestion",
        grill: parseGrillQuestionContent(
          content,
          text.slice(openIndex, contentStartIndex + closeIndexInRemaining + closeMatch[0].length),
          false,
        ),
        durationMs,
      })

      if (after.length > 0) {
        result.push(...parseTextWithProposedPlan(after, durationMs, isStreaming))
      }
    }

    return result
  }

  return [{ kind: "text", text, durationMs }]
}

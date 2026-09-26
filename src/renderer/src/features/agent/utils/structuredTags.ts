import type { ChatBlock } from "../types"
import {
  extractFrontDesignAttributes,
  extractPlanTitle,
  parseGrillQuestionContent,
  parseReviewFindingsContent,
} from "./tagContentParsers"

// 结构化标签切分：识别 <proposed_plan> / <review_findings> / <front_design> / <front_design_update> / <grill_question>
// 标签，把助手文本拆分为结构化块与普通文本块；内容解析见 tagContentParsers。

const PROPOSED_PLAN_OPEN_REGEX = /<proposed_plan>/i
const PROPOSED_PLAN_CLOSE_REGEX = /<\/proposed_plan>/i

const REVIEW_FINDINGS_OPEN_REGEX = /<review_findings>/i
const REVIEW_FINDINGS_CLOSE_REGEX = /<\/review_findings>/i

// 属性值内的 `>` 是合法字符（如 target="body > div > details:nth-child(2)"），
// 因此开标签必须按引号配对解析，不能简单用 [^>]* 截断。
const buildOpenTagRegex = (tagName: string): RegExp =>
  new RegExp(
    `<${tagName}(?=[\\s>])(?:\\s+[a-zA-Z0-9_-]+(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?)*\\s*>`,
    "i",
  )

const FRONT_DESIGN_OPEN_REGEX = buildOpenTagRegex("front_design")
const FRONT_DESIGN_CLOSE_REGEX = /<\/front_design>/i

const FRONT_DESIGN_UPDATE_OPEN_REGEX = buildOpenTagRegex("front_design_update")
const FRONT_DESIGN_UPDATE_CLOSE_REGEX = /<\/front_design_update>/i

const GRILL_QUESTION_OPEN_REGEX = buildOpenTagRegex("grill_question")
const GRILL_QUESTION_CLOSE_REGEX = /<\/grill_question>/i

// 定稿消息中的未闭合标签视为正文引用（如报告里提到标签名）：保留原文本并继续解析其后的合法结构化块。
const parseAfterUnclosedTag = (
  text: string,
  openTagEndIndex: number,
  durationMs?: number,
  baseId?: string,
  sessionId?: string | null,
  timestamp?: number,
): ChatBlock[] => {
  const tailBlocks = parseTextWithProposedPlan(
    text.slice(openTagEndIndex),
    durationMs,
    baseId,
    sessionId,
    timestamp,
    false,
  )
  if (tailBlocks.length === 1 && tailBlocks[0].kind === "text") {
    return [{ kind: "text", text, durationMs }]
  }
  return [{ kind: "text", text: text.slice(0, openTagEndIndex), durationMs }, ...tailBlocks]
}

// 解析文本块，若包含 <proposed_plan>、<review_findings>、<front_design> 或 <grill_question> 标签则拆分为独立结构化块与文本块。
// isStreaming 为 true 时允许未闭合标签（流式渐进渲染）；定稿消息必须成对闭合，避免正文引用标签名误触发卡片。
export const parseTextWithProposedPlan = (
  text: string,
  durationMs?: number,
  baseId?: string,
  sessionId?: string | null,
  timestamp?: number,
  isStreaming = false,
): ChatBlock[] => {
  if (!text) return []

  const reviewOpenMatch = REVIEW_FINDINGS_OPEN_REGEX.exec(text)
  const planOpenMatch = PROPOSED_PLAN_OPEN_REGEX.exec(text)
  const designOpenMatch = FRONT_DESIGN_OPEN_REGEX.exec(text)
  const designUpdateOpenMatch = FRONT_DESIGN_UPDATE_OPEN_REGEX.exec(text)
  const grillOpenMatch = GRILL_QUESTION_OPEN_REGEX.exec(text)

  type Candidate = {
    type: "review" | "plan" | "design" | "designUpdate" | "grill"
    index: number
  }
  const candidates: Candidate[] = []
  if (reviewOpenMatch) candidates.push({ type: "review", index: reviewOpenMatch.index })
  if (planOpenMatch) candidates.push({ type: "plan", index: planOpenMatch.index })
  if (designOpenMatch) candidates.push({ type: "design", index: designOpenMatch.index })
  if (designUpdateOpenMatch) {
    candidates.push({ type: "designUpdate", index: designUpdateOpenMatch.index })
  }
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
      return parseAfterUnclosedTag(
        text,
        contentStartIndex,
        durationMs,
        baseId,
        sessionId,
        timestamp,
      )
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
        result.push(
          ...parseTextWithProposedPlan(
            after,
            durationMs,
            baseId,
            sessionId,
            timestamp,
            isStreaming,
          ),
        )
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
      return parseAfterUnclosedTag(
        text,
        contentStartIndex,
        durationMs,
        baseId,
        sessionId,
        timestamp,
      )
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
        result.push(
          ...parseTextWithProposedPlan(
            after,
            durationMs,
            baseId,
            sessionId,
            timestamp,
            isStreaming,
          ),
        )
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
      return parseAfterUnclosedTag(
        text,
        contentStartIndex,
        durationMs,
        baseId,
        sessionId,
        timestamp,
      )
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
        result.push(
          ...parseTextWithProposedPlan(
            after,
            durationMs,
            baseId,
            sessionId,
            timestamp,
            isStreaming,
          ),
        )
      }
    }

    return result
  }

  if (earliest === "design" && designOpenMatch) {
    const openIndex = designOpenMatch.index
    const openTagLength = designOpenMatch[0].length
    const {
      title: parsedTitle,
      id: parsedId,
      parentId: parsedParentId,
      mode: parsedMode,
    } = extractFrontDesignAttributes(designOpenMatch[0])
    const title = parsedTitle || "Frontend Prototype"
    const validParsedId = parsedId && parsedId !== parsedParentId ? parsedId : undefined
    const stableDesignId =
      validParsedId || (baseId ? `${baseId}-design-${openIndex}` : `design-${openIndex}`)
    const mode = parsedMode ?? "tailwindcss"
    const contentStartIndex = openIndex + openTagLength
    const remainingText = text.slice(contentStartIndex)
    const closeMatch = FRONT_DESIGN_CLOSE_REGEX.exec(remainingText)

    if (!closeMatch && !isStreaming) {
      return parseAfterUnclosedTag(
        text,
        contentStartIndex,
        durationMs,
        baseId,
        sessionId,
        timestamp,
      )
    }

    const result: ChatBlock[] = []
    const before = text.slice(0, openIndex).trim()
    if (before.length > 0) {
      result.push({ kind: "text", text: before })
    }

    if (!closeMatch) {
      const htmlContent = remainingText.trim()
      result.push({
        kind: "frontDesign",
        design: {
          id: stableDesignId,
          parentId: parsedParentId ?? null,
          title,
          html: htmlContent,
          raw: text.slice(openIndex),
          isStreaming: true,
          sessionId: sessionId ?? null,
          mode,
        },
        durationMs,
      })
    } else {
      const closeIndexInRemaining = closeMatch.index
      const htmlContent = remainingText.slice(0, closeIndexInRemaining).trim()
      const after = remainingText.slice(closeIndexInRemaining + closeMatch[0].length).trim()

      result.push({
        kind: "frontDesign",
        design: {
          id: stableDesignId,
          parentId: parsedParentId ?? null,
          title,
          html: htmlContent,
          raw: text.slice(
            openIndex,
            contentStartIndex + closeIndexInRemaining + closeMatch[0].length,
          ),
          isStreaming: false,
          sessionId: sessionId ?? null,
          mode,
        },
        durationMs,
      })

      if (after.length > 0) {
        result.push(
          ...parseTextWithProposedPlan(
            after,
            durationMs,
            baseId,
            sessionId,
            timestamp,
            isStreaming,
          ),
        )
      }
    }

    return result
  }

  if (earliest === "designUpdate" && designUpdateOpenMatch) {
    const openIndex = designUpdateOpenMatch.index
    const openTagLength = designUpdateOpenMatch[0].length
    const {
      title: parsedTitle,
      id: parsedId,
      parentId: parsedParentId,
      mode: parsedMode,
      target: parsedTarget,
      action: parsedAction,
    } = extractFrontDesignAttributes(designUpdateOpenMatch[0])
    const title = parsedTitle || "Frontend Component Update"
    const designId =
      parsedId || (baseId ? `${baseId}-design-update-${openIndex}` : `design-update-${openIndex}`)
    const mode = parsedMode ?? "tailwindcss"
    const contentStartIndex = openIndex + openTagLength
    const remainingText = text.slice(contentStartIndex)
    const closeMatch = FRONT_DESIGN_UPDATE_CLOSE_REGEX.exec(remainingText)

    if (!closeMatch && !isStreaming) {
      return parseAfterUnclosedTag(
        text,
        contentStartIndex,
        durationMs,
        baseId,
        sessionId,
        timestamp,
      )
    }

    const result: ChatBlock[] = []
    const before = text.slice(0, openIndex).trim()
    if (before.length > 0) {
      result.push({ kind: "text", text: before })
    }

    if (!closeMatch) {
      const htmlContent = remainingText.trim()
      result.push({
        kind: "frontDesign",
        design: {
          id: designId,
          parentId: parsedParentId ?? null,
          target: parsedTarget ?? null,
          action: parsedAction,
          isUpdate: true,
          title,
          html: htmlContent,
          raw: text.slice(openIndex),
          isStreaming: true,
          sessionId: sessionId ?? null,
          mode,
        },
        durationMs,
      })
    } else {
      const closeIndexInRemaining = closeMatch.index
      const htmlContent = remainingText.slice(0, closeIndexInRemaining).trim()
      const after = remainingText.slice(closeIndexInRemaining + closeMatch[0].length).trim()

      result.push({
        kind: "frontDesign",
        design: {
          id: designId,
          parentId: parsedParentId ?? null,
          target: parsedTarget ?? null,
          action: parsedAction,
          isUpdate: true,
          title,
          html: htmlContent,
          raw: text.slice(
            openIndex,
            contentStartIndex + closeIndexInRemaining + closeMatch[0].length,
          ),
          isStreaming: false,
          sessionId: sessionId ?? null,
          mode,
        },
        durationMs,
      })

      if (after.length > 0) {
        result.push(
          ...parseTextWithProposedPlan(
            after,
            durationMs,
            baseId,
            sessionId,
            timestamp,
            isStreaming,
          ),
        )
      }
    }

    return result
  }

  return [{ kind: "text", text, durationMs }]
}

import type { AgentMessage, QuestionAnswer, SubagentData } from "@shared/contracts/agent"
import { frontDesignStore } from "./hooks/frontDesignStore"
import type {
  ChatBlock,
  ChatMessage,
  ReviewFindingItem,
  ReviewFindingsData,
  ReviewSeverity,
} from "./types"

// 提取助手消息的错误信息。
export const getAssistantError = (message: AgentMessage): string | undefined =>
  message.role === "assistant" ? message.errorMessage : undefined

// 提取工具执行进度的文本（task 子代理桥接的 partialResult.content 文本）。
export const extractToolProgressText = (partialResult: unknown): string | undefined => {
  if (!partialResult || typeof partialResult !== "object") return undefined
  const result = partialResult as { content?: Array<{ type?: string; text?: string }> }
  const text = result.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
  return text || undefined
}

// 提取工具执行的子代理面板快照（partialResult/result 的 details.subagent）。
export const extractSubagentData = (partialResult: unknown): SubagentData | undefined => {
  if (!partialResult || typeof partialResult !== "object") return undefined
  const details = (partialResult as { details?: { subagent?: SubagentData } }).details
  return details?.subagent
}

// 提取 question 工具的用户作答（result 的 details.answers）。
export const extractQuestionAnswers = (result: unknown): QuestionAnswer[] | undefined => {
  if (!result || typeof result !== "object") return undefined
  const details = (result as { details?: { answers?: QuestionAnswer[] } }).details
  return details?.answers
}

// 从 question 工具的 toolResult 文本（User answered: ...）解析答案（历史会话兼容兜底）。
export const parseQuestionAnswersFromText = (text: string): QuestionAnswer[] | undefined => {
  const match = text.match(/^User answered: (.*)\. Continue with the answers\.$/s)
  if (!match || !match[1]) return undefined
  const inner = match[1]
  const regex = /"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g
  const answers: QuestionAnswer[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(inner)) !== null) {
    const question = m[1].replace(/\\"/g, '"')
    const rawAnswer = m[2].replace(/\\"/g, '"')
    const answer = rawAnswer.length > 0 ? rawAnswer.split(",") : []
    answers.push({ question, answer })
  }
  return answers.length > 0 ? answers : undefined
}

const PROPOSED_PLAN_OPEN_REGEX = /<proposed_plan>/i
const PROPOSED_PLAN_CLOSE_REGEX = /<\/proposed_plan>/i

const REVIEW_FINDINGS_OPEN_REGEX = /<review_findings>/i
const REVIEW_FINDINGS_CLOSE_REGEX = /<\/review_findings>/i

const FRONT_DESIGN_OPEN_REGEX = /<front_design(?:\s+[^>]*)?>/i
const FRONT_DESIGN_CLOSE_REGEX = /<\/front_design>/i

const extractFrontDesignAttributes = (tagStr: string): { title?: string; id?: string } => {
  const titleMatch = /title=["']([^"']*)["']/i.exec(tagStr)
  const idMatch = /id=["']([^"']*)["']/i.exec(tagStr)
  return {
    title: titleMatch ? titleMatch[1].trim() : undefined,
    id: idMatch ? idMatch[1].trim() : undefined,
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

// 解析文本块，若包含 <proposed_plan>、<review_findings> 或 <front_design> 标签则拆分为独立结构化块与文本块。
export const parseTextWithProposedPlan = (
  text: string,
  durationMs?: number,
  baseId?: string,
  sessionId?: string | null,
  timestamp?: number,
): ChatBlock[] => {
  if (!text) return []

  const reviewOpenMatch = REVIEW_FINDINGS_OPEN_REGEX.exec(text)
  const planOpenMatch = PROPOSED_PLAN_OPEN_REGEX.exec(text)
  const designOpenMatch = FRONT_DESIGN_OPEN_REGEX.exec(text)

  type Candidate = { type: "review" | "plan" | "design"; index: number }
  const candidates: Candidate[] = []
  if (reviewOpenMatch) candidates.push({ type: "review", index: reviewOpenMatch.index })
  if (planOpenMatch) candidates.push({ type: "plan", index: planOpenMatch.index })
  if (designOpenMatch) candidates.push({ type: "design", index: designOpenMatch.index })

  if (candidates.length === 0) {
    return [{ kind: "text", text, durationMs }]
  }

  candidates.sort((a, b) => a.index - b.index)
  const earliest = candidates[0].type

  if (earliest === "review" && reviewOpenMatch) {
    const openIndex = reviewOpenMatch.index
    const openTagLength = reviewOpenMatch[0].length

    const result: ChatBlock[] = []
    const before = text.slice(0, openIndex).trim()
    if (before.length > 0) {
      result.push({ kind: "text", text: before })
    }

    const contentStartIndex = openIndex + openTagLength
    const remainingText = text.slice(contentStartIndex)
    const closeMatch = REVIEW_FINDINGS_CLOSE_REGEX.exec(remainingText)

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
        result.push(...parseTextWithProposedPlan(after, durationMs, baseId))
      }
    }

    return result
  }

  if (earliest === "plan" && planOpenMatch) {
    const openIndex = planOpenMatch.index
    const openTagLength = planOpenMatch[0].length

    const result: ChatBlock[] = []
    const before = text.slice(0, openIndex).trim()
    if (before.length > 0) {
      result.push({ kind: "text", text: before })
    }

    const contentStartIndex = openIndex + openTagLength
    const remainingText = text.slice(contentStartIndex)
    const closeMatch = PROPOSED_PLAN_CLOSE_REGEX.exec(remainingText)

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
          raw: text.slice(openIndex, contentStartIndex + closeIndexInRemaining + closeMatch[0].length),
          isStreaming: false,
        },
        durationMs,
      })

      if (after.length > 0) {
        result.push(...parseTextWithProposedPlan(after, durationMs, baseId))
      }
    }

    return result
  }

  if (earliest === "design" && designOpenMatch) {
    const openIndex = designOpenMatch.index
    const openTagLength = designOpenMatch[0].length
    const { title: parsedTitle, id: parsedId } = extractFrontDesignAttributes(designOpenMatch[0])
    const title = parsedTitle || "Frontend Prototype"
    const designId = parsedId || (baseId ? `${baseId}-design-${openIndex}` : `design-${openIndex}`)

    const result: ChatBlock[] = []
    const before = text.slice(0, openIndex).trim()
    if (before.length > 0) {
      result.push({ kind: "text", text: before })
    }

    const contentStartIndex = openIndex + openTagLength
    const remainingText = text.slice(contentStartIndex)
    const closeMatch = FRONT_DESIGN_CLOSE_REGEX.exec(remainingText)

    if (!closeMatch) {
      const htmlContent = remainingText.trim()
      result.push({
        kind: "frontDesign",
        design: {
          id: designId,
          title,
          html: htmlContent,
          raw: text.slice(openIndex),
          isStreaming: true,
        },
        durationMs,
      })
      frontDesignStore.registerDesign({
        id: designId,
        title,
        html: htmlContent,
        isStreaming: true,
        sessionId,
        updatedAt: timestamp,
      })
    } else {
      const closeIndexInRemaining = closeMatch.index
      const htmlContent = remainingText.slice(0, closeIndexInRemaining).trim()
      const after = remainingText.slice(closeIndexInRemaining + closeMatch[0].length).trim()

      result.push({
        kind: "frontDesign",
        design: {
          id: designId,
          title,
          html: htmlContent,
          raw: text.slice(openIndex, contentStartIndex + closeIndexInRemaining + closeMatch[0].length),
          isStreaming: false,
        },
        durationMs,
      })
      frontDesignStore.registerDesign({
        id: designId,
        title,
        html: htmlContent,
        isStreaming: false,
        sessionId,
        updatedAt: timestamp,
      })

      if (after.length > 0) {
        result.push(...parseTextWithProposedPlan(after, durationMs, baseId, sessionId, timestamp))
      }
    }

    return result
  }

  return [{ kind: "text", text, durationMs }]
}

// 将 shared AgentMessage 转换为展示条目。
export const toChatMessage = (
  message: AgentMessage,
  isStreaming: boolean,
  id: string,
  sessionId?: string | null,
): ChatMessage => {
  if (message.role === "user") {
    const text = Array.isArray(message.content)
      ? message.content.map((block) => (block.type === "text" ? block.text : `[图片]`)).join("\n")
      : message.content
    return {
      id,
      role: "user",
      blocks: [{ kind: "text", text }],
      isStreaming: false,
      timestamp: message.timestamp,
      isSteer: message.isSteer,
      command: message.command,
      files: message.files,
    }
  }

  if (message.role === "compactionSummary") {
    return {
      id,
      role: "compactionSummary",
      blocks: [{ kind: "text", text: message.summary }],
      isStreaming: false,
      timestamp: message.timestamp,
      isManual: message.manual,
      model: message.model,
      compactionUsage: message.usage,
      summaryTokens: message.summaryTokens,
    }
  }

  if (message.role === "undoSummary") {
    return {
      id,
      role: "undoSummary",
      blocks: message.undoPayload?.userPrompt
        ? [{ kind: "text", text: message.undoPayload.userPrompt }]
        : [],
      isStreaming: false,
      timestamp: message.timestamp,
      undoPayload: message.undoPayload,
    }
  }

  if (message.role === "modelSwitch") {
    return {
      id,
      role: "modelSwitch",
      blocks: message.instructions ? [{ kind: "text", text: message.instructions }] : [],
      isStreaming: false,
      timestamp: message.timestamp,
      model: message.model,
      provider: message.provider,
      family: message.family,
      instructions: message.instructions,
      isInitial: message.isInitial,
    }
  }

  if (message.role === "toolResult") {
    return {
      id,
      role: "toolResult",
      blocks: [
        {
          kind: "toolResult",
          toolCallId: message.toolCallId,
          toolName: message.toolName,
          text: message.content
            .map((block) => (block.type === "text" ? block.text : "[图片]"))
            .join("\n"),
          isError: message.isError,
          durationMs: message.durationMs,
          ...(message.diff ? { diff: message.diff } : {}),
          ...(message.subagent ? { subagent: message.subagent } : {}),
          ...(message.lsp ? { lsp: message.lsp } : {}),
        },
      ],
      isStreaming: false,
      timestamp: message.timestamp,
    }
  }

  if (message.role === "todoState") {
    // 任务清单不进消息流渲染（UI 走独立 todo 指示）；此分支不可达（state.messages 不含 todoState）。
    return {
      id,
      role: "assistant",
      blocks: [],
      isStreaming: false,
      timestamp: message.timestamp,
    }
  }

  const blocks: ChatBlock[] = message.content.flatMap((block) => {
    if (block.type === "text") {
      return parseTextWithProposedPlan(block.text, block.durationMs, id, sessionId, message.timestamp)
    }
    if (block.type === "thinking") {
      return [{ kind: "thinking", text: block.thinking, durationMs: block.durationMs }]
    }
    return [
      {
        kind: "toolCall",
        toolCallId: block.id,
        toolName: block.name,
        args: block.arguments,
        status: "running",
        ...(block.answers ? { answers: block.answers } : {}),
      },
    ]
  })

  return {
    id,
    role: "assistant",
    blocks,
    isStreaming,
    timestamp: message.timestamp,
    firstChunkTimestamp: message.firstChunkTimestamp,
    error: message.errorMessage,
    stopReason: message.stopReason,
    model: message.model,
    provider: message.provider,
    usage: message.usage,
    durationMs: message.durationMs,
  }
}

// 将展示条目转回 shared AgentMessage（恢复会话时发送给 main）。
export const toAgentMessages = (messages: ChatMessage[]): AgentMessage[] =>
  messages.flatMap((message): AgentMessage[] => {
    // 压缩摘要为派生数据：不落库、不进 main 上下文。
    if (message.role === "compactionSummary") return []

    if (message.role === "undoSummary") {
      return [
        {
          role: "undoSummary",
          timestamp: message.timestamp ?? Date.now(),
          undoPayload: message.undoPayload,
        },
      ]
    }

    if (message.role === "user") {
      const text = message.blocks
        .filter((block): block is Extract<ChatBlock, { kind: "text" }> => block.kind === "text")
        .map((block) => block.text)
        .join("\n")
      // 保留原始 timestamp：删除轮次后 main 按 timestamp 匹配 DB seq 重建对齐，
      // 重置为 Date.now() 会让 syncMessageSeqs 全部落空为 -1，污染压缩边界（firstKeptSeq = -1）。
      return [
        {
          role: "user",
          content: text,
          timestamp: message.timestamp ?? Date.now(),
          ...(message.isSteer ? { isSteer: true } : {}),
        },
      ]
    }

    if (message.role === "toolResult") {
      const block = message.blocks.find(
        (item): item is Extract<ChatBlock, { kind: "toolResult" }> => item.kind === "toolResult",
      )
      if (!block) return []
      return [
        {
          role: "toolResult",
          toolCallId: block.toolCallId,
          toolName: block.toolName,
          content: [{ type: "text", text: block.text }],
          isError: block.isError,
          timestamp: message.timestamp ?? Date.now(),
          ...(block.subagent ? { subagent: block.subagent } : {}),
          ...(block.lsp ? { lsp: block.lsp } : {}),
        },
      ]
    }

    const blocks = message.blocks.flatMap(
      (
        block,
      ): Array<
        | { type: "text"; text: string }
        | { type: "thinking"; thinking: string }
        | {
            type: "toolCall"
            id: string
            name: string
            arguments: Record<string, unknown>
            answers?: QuestionAnswer[]
          }
      > => {
        if (block.kind === "text") return [{ type: "text", text: block.text }]
        if (block.kind === "thinking") return [{ type: "thinking", thinking: block.text }]
        if (block.kind === "toolCall") {
          return [
            {
              type: "toolCall",
              id: block.toolCallId,
              name: block.toolName,
              arguments: block.args,
              ...(block.answers ? { answers: block.answers } : {}),
            },
          ]
        }
        return []
      },
    )
    return [
      {
        role: "assistant",
        content: blocks,
        // 保留 usage/model 等元数据：undo 后 main 侧 estimateContextTokens 以最后一条
        // assistant 的 usage.totalTokens 为锚点，重置为 0 会让状态栏上下文误归零。
        provider: message.provider ?? "local",
        model: message.model ?? "local",
        usage: message.usage ?? { input: 0, output: 0, cacheRead: 0, totalTokens: 0 },
        stopReason: message.stopReason ?? "stop",
        errorMessage: message.error,
        timestamp: message.timestamp ?? Date.now(),
      },
    ]
  })

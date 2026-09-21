import type { AgentMessage, QuestionAnswer, SubagentData } from "@shared/contracts/agent"
import type {
  ChatBlock,
  ChatMessage,
  FrontDesignUpdateAction,
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

// 提取工具执行的批量子代理快照（partialResult/result 的 details.subagents；空数组视为缺省）。
export const extractSubagentsData = (partialResult: unknown): SubagentData[] | undefined => {
  if (!partialResult || typeof partialResult !== "object") return undefined
  const details = (partialResult as { details?: { subagents?: SubagentData[] } }).details
  const subagents = details?.subagents
  return subagents && subagents.length > 0 ? subagents : undefined
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

// 清洗用户输入纯文本（剥离 <skill ...>、<referenced_design ...> 与 <current_design ...> 注入块与命令前缀）。
export const cleanUserPrompt = (
  rawText: string,
  options?: { isSteer?: boolean; command?: { kind?: string; name: string } },
): string => {
  let cleaned = rawText
    .replace(/<skill\b[\s\S]*?<\/skill>\s*/gi, "")
    .replace(/<referenced_design\b[\s\S]*?(?:<\/referenced_design>|$)\s*/gi, "")
    .replace(/<current_design\b[\s\S]*?(?:<\/current_design>|$)\s*/gi, "")

  if (options?.isSteer || options?.command?.name === "steer") {
    cleaned = cleaned.replace(/^\s*\/steer(?:\s+|$)/, "").trim()
    cleaned = cleaned.replace(/^[\[【]([\s\S]*?)[\]】]$/, "$1").trim()
    return cleaned
  }

  if (options?.command?.kind === "skill") {
    // 剥离开头的技能命令触发前缀（如 /skill:name 或 $name 或 /name）
    const skillName = options.command.name.replace(/^[\/\$]/, "")
    const pattern = new RegExp(
      `^\\s*(?:/skill:${skillName}|\\$${skillName}|/${skillName})(?:\\s+|$)`,
      "i",
    )
    cleaned = cleaned.replace(pattern, "")
  }

  return cleaned.trim()
}

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

const UPDATE_ACTIONS = new Set<string>(["replace", "append", "prepend", "before", "after"])

// 归一化模型给出的更新动作；未知值一律退回 replace。
const normalizeUpdateAction = (value: string | undefined): FrontDesignUpdateAction => {
  const normalized = value?.trim().toLowerCase()
  return normalized && UPDATE_ACTIONS.has(normalized)
    ? (normalized as FrontDesignUpdateAction)
    : "replace"
}

const extractFrontDesignAttributes = (
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

// 解析文本块，若包含 <proposed_plan>、<review_findings> 或 <front_design> 标签则拆分为独立结构化块与文本块。
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

  type Candidate = {
    type: "review" | "plan" | "design" | "designUpdate"
    index: number
  }
  const candidates: Candidate[] = []
  if (reviewOpenMatch) candidates.push({ type: "review", index: reviewOpenMatch.index })
  if (planOpenMatch) candidates.push({ type: "plan", index: planOpenMatch.index })
  if (designOpenMatch) candidates.push({ type: "design", index: designOpenMatch.index })
  if (designUpdateOpenMatch) {
    candidates.push({ type: "designUpdate", index: designUpdateOpenMatch.index })
  }

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

// 将 shared AgentMessage 转换为展示条目。
// 设计 id 前缀：以消息时间戳（base36）为稳定锚点，保证同一消息在任何路径解析出的设计 id 一致。
export const buildStableDesignBaseId = (timestamp: number | undefined): string =>
  typeof timestamp === "number" && Number.isFinite(timestamp)
    ? `d${timestamp.toString(36)}`
    : "design"

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

  if (message.role === "hookContext") {
    return {
      id,
      role: "hookContext",
      blocks: message.text ? [{ kind: "text", text: message.text }] : [],
      isStreaming: false,
      timestamp: message.timestamp,
      hookEvent: message.event,
      hookName: message.hookName,
      hookStatus: message.status,
      durationMs: message.durationMs,
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
          ...(message.subagents ? { subagents: message.subagents } : {}),
          ...(message.lsp ? { lsp: message.lsp } : {}),
          ...(message.image ? { image: message.image } : {}),
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
      return parseTextWithProposedPlan(
        block.text,
        block.durationMs,
        // 设计 id 前缀用消息时间戳（实时与恢复两条路径一致），
        // 避免依赖聊天消息自增 id 导致重启后设计 id 漂移、版本链 parent_id 解析失败。
        buildStableDesignBaseId(message.timestamp),
        sessionId,
        message.timestamp,
        isStreaming,
      )
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
    variant: message.variant,
    usage: message.usage,
    durationMs: message.durationMs,
    tokenSaver: message.tokenSaver,
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
          ...(block.subagents ? { subagents: block.subagents } : {}),
          ...(block.lsp ? { lsp: block.lsp } : {}),
          ...(block.image ? { image: block.image } : {}),
        },
      ]
    }

    if (message.role === "hookContext") {
      // hook 审计消息回传 main（保留 timestamp 供 seq 对齐）。
      const text = message.blocks
        .filter((block): block is Extract<ChatBlock, { kind: "text" }> => block.kind === "text")
        .map((block) => block.text)
        .join("\n")
      return [
        {
          role: "hookContext",
          event: message.hookEvent ?? "SessionStart",
          hookName: message.hookName ?? "hook",
          status: message.hookStatus ?? "completed",
          text,
          ...(message.durationMs !== undefined ? { durationMs: message.durationMs } : {}),
          timestamp: message.timestamp ?? Date.now(),
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
        if (block.kind === "proposedPlan") return [{ type: "text", text: block.plan.raw }]
        if (block.kind === "reviewFindings") return [{ type: "text", text: block.findings.raw }]
        if (block.kind === "frontDesign") return [{ type: "text", text: block.design.raw }]
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
        usage: message.usage ?? {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
        },
        stopReason: message.stopReason ?? "stop",
        errorMessage: message.error,
        timestamp: message.timestamp ?? Date.now(),
        ...(message.tokenSaver ? { tokenSaver: message.tokenSaver } : {}),
      },
    ]
  })

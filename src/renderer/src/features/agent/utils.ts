import type { AgentMessage, QuestionAnswer, SubagentData } from "@shared/contracts/agent"
import type { ChatBlock, ChatMessage } from "./types"
import { parseTextWithProposedPlan } from "./utils/structuredTags"

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

export { parseTextWithProposedPlan } from "./utils/structuredTags"
// 结构化标签解析拆分为独立文件：utils/structuredTags.ts（标签切分）与
// utils/tagContentParsers.ts（正文解析）；以下转出保持对外 API 稳定。
export {
  extractPlanTitle,
  parseGrillQuestionContent,
  parseReviewFindingsContent,
} from "./utils/tagContentParsers"

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

  if (message.role === "modeSwitch") {
    return {
      id,
      role: "modeSwitch",
      blocks: [],
      isStreaming: false,
      timestamp: message.timestamp,
      collaborationMode: message.mode,
      viaAuto: message.viaAuto,
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

// 切换类消息角色：会话尾部连续出现时按同类合并，避免来回切换刷屏（与 main 侧同一规则）。
const SWITCH_MESSAGE_ROLES = new Set<ChatMessage["role"]>(["modelSwitch", "modeSwitch"])

/**
 * 追加切换类消息：会话尾部连续的切换消息中已有同类条目时原地更新（保留 id/位置），否则追加。
 */
export const upsertSwitchMessage = (
  messages: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] => {
  if (!SWITCH_MESSAGE_ROLES.has(incoming.role)) return [...messages, incoming]
  for (let index = messages.length - 1; index >= 0; index--) {
    const current = messages[index]
    if (!SWITCH_MESSAGE_ROLES.has(current.role)) break
    if (current.role === incoming.role) {
      const next = [...messages]
      next[index] = { ...incoming, id: current.id }
      return next
    }
  }
  return [...messages, incoming]
}

// 将展示条目转回 shared AgentMessage（恢复会话时发送给 main）。
export const toAgentMessages = (messages: ChatMessage[]): AgentMessage[] =>
  messages.flatMap((message): AgentMessage[] => {
    // 压缩摘要为派生数据：不落库、不进 main 上下文。
    if (message.role === "compactionSummary") return []

    // 协作模式切换为非 LLM 标记（main 侧已有同条目），不回传上下文。
    if (message.role === "modeSwitch") return []

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
        if (block.kind === "grillQuestion") return [{ type: "text", text: block.grill.raw }]
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

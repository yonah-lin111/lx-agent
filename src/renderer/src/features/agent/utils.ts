import type { AgentMessage, QuestionAnswer, SubagentData } from "@shared/contracts/agent"
import type { ChatBlock, ChatMessage } from "./types"

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

// 将 shared AgentMessage 转换为展示条目。
export const toChatMessage = (
  message: AgentMessage,
  isStreaming: boolean,
  id: string,
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

  const blocks: ChatBlock[] = message.content.map((block) => {
    if (block.type === "text") {
      return { kind: "text", text: block.text }
    }
    if (block.type === "thinking") {
      return { kind: "thinking", text: block.thinking }
    }
    return {
      kind: "toolCall",
      toolCallId: block.id,
      toolName: block.name,
      args: block.arguments,
      status: "done",
      ...(block.answers ? { answers: block.answers } : {}),
    }
  })

  return {
    id,
    role: "assistant",
    blocks,
    isStreaming,
    timestamp: message.timestamp,
    error: message.errorMessage,
    stopReason: message.stopReason,
    model: message.model,
    provider: message.provider,
    usage: message.usage,
  }
}

// 将展示条目转回 shared AgentMessage（恢复会话时发送给 main）。
export const toAgentMessages = (messages: ChatMessage[]): AgentMessage[] =>
  messages.flatMap((message): AgentMessage[] => {
    // 压缩摘要为派生数据：不落库、不进 main 上下文（由 compaction entry 重建）。
    if (message.role === "compactionSummary") return []

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
        | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
      > => {
        if (block.kind === "text") return [{ type: "text", text: block.text }]
        if (block.kind === "thinking") return [{ type: "thinking", thinking: block.text }]
        if (block.kind === "toolCall") {
          return [
            { type: "toolCall", id: block.toolCallId, name: block.toolName, arguments: block.args },
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

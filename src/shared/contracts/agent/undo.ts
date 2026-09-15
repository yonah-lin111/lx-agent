// 撤销与删除摘要契约：单轮/多轮撤销的展示负载。

import type { AgentDiff } from "./diff"

// 撤销代码 Diff 摘要项。
export interface AgentUndoDiffSummary {
  filePath: string
  diff?: AgentDiff
  toolName?: string
}

// 撤销/删除单个轮次的详情项。
export interface AgentUndoSummaryItem {
  userPrompt?: string
  files?: {
    name: string
    path: string
    type: "image" | "text"
    size?: string
    extension?: string
  }[]
  assistantSnippet?: string
  modelName?: string
  turnDurationMs?: number
  diffs?: AgentUndoDiffSummary[]
  toolCalls?: {
    toolName: string
    summary?: string
  }[]
  undoneAt?: number
}

// 撤销摘要专用数据结构（支持单轮与多轮堆叠合并）。
export interface AgentUndoSummaryPayload {
  // 多轮连续撤销时的堆叠项列表。
  items?: AgentUndoSummaryItem[]
  // 被撤销的用户提示词（单轮）。
  userPrompt?: string
  // 被撤销的用户附件文件。
  files?: {
    name: string
    path: string
    type: "image" | "text"
    size?: string
    extension?: string
  }[]
  // 被撤销的助手回复摘要。
  assistantSnippet?: string
  // 被撤销时使用的模型。
  modelName?: string
  // 被撤销轮次的执行耗时（毫秒）。
  turnDurationMs?: number
  // 被撤销的代码 Diff 变更列表。
  diffs?: AgentUndoDiffSummary[]
  // 被撤销的工具调用简要列表。
  toolCalls?: {
    toolName: string
    summary?: string
  }[]
  // 统计指标。
  toolCallCount?: number
  fileChangeCount?: number
  undoneAt?: number
}

// 撤销/删除摘要消息：展示已撤销的一轮对话及代码 Diff 变更。
export interface UndoSummaryMessage {
  role: "undoSummary"
  id?: string
  timestamp: number
  undoPayload?: AgentUndoSummaryPayload
}

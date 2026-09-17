// 会话契约：人格、归属上下文、摘要/恢复、发送与各类操作结果。

import type { AgentMessage } from "./messages"
import type { AgentCapabilitySnapshot } from "./runtime"
import type { TodoList } from "./todos"

// Agent 人格类型（pragmatic 实用主义 / friendly 友好协作）。
export type AgentPersonality = "pragmatic" | "friendly"

// 会话归属上下文（发送消息时声明；决定会话建在哪个桶内，支持多会话/多 Tab 路由）。
export interface AgentSendContext {
  projectId?: string // 所属项目 id
  page?: string // 页面路由（'/' | '/project' | '/settings' …）
  cwd?: string // 工具执行目录（项目页 = project.path；独立页可省略，回退主目录）
  personality?: AgentPersonality // 会话级指定人格
  files?: {
    name: string
    path: string
    type: "image" | "text"
    size?: string
    extension?: string
  }[]
  sessionId?: string // 目标会话 ID
  tabId?: string // 目标 Tab ID
}

// 会话摘要（历史列表展示，不含消息体）。
export interface AgentSessionSummary {
  id: string
  title: string
  cwd: string
  // 所属项目（历史面板项目 tag 客户端筛选用；独立页会话为 null）。
  projectId: string | null
  createdAt: string
  updatedAt: string
}

// 恢复的会话内容。
export interface AgentRestoredSession {
  messages: AgentMessage[]
  activeCapabilities: AgentCapabilitySnapshot
  // 任务清单（最后一条 todo entry 快照；空数组 = 无清单）。
  todos: TodoList
}

// 发送消息选项。
// delivery: "queue"（默认，当前 run 结束后排队执行）| "steer"（即时插话，注入当前 run 的 turn 边界即时引导转向）。
export interface AgentSendOptions {
  delivery?: "queue" | "steer"
  personality?: AgentPersonality
}

// 发送对话请求的返回结果；ok 时携带落库会话 id（首条消息才真正入库）。
// queued 变体：流式输出期间消息已入队，当前 run 结束后自动发送；会话 id 即当前会话（流式中必有会话）。
// steered 变体：流式输出期间即时插话，已注入当前 run 的 turn 边界。
export type AgentSendResult =
  | { ok: true; sessionId: string }
  | { ok: true; queued: true; queueLength: number; sessionId: string }
  | { ok: true; steered: true; sessionId: string }
  | { ok: false; error: string }

// 切换会话工作区（/gitWorktree）的返回结果。
export type AgentSwitchWorktreeResult = { ok: true } | { ok: false; error: string }

// 切换会话项目（更新 project_id 与 cwd）的返回结果。
export type AgentSwitchProjectResult = { ok: true } | { ok: false; error: string }

// 手动压缩（/compact）的返回结果。
export type AgentCompactResult = { ok: true } | { ok: false; error: string }

// 撤销手动压缩（/undo 对压缩摘要触发）的返回结果；自动压缩不可撤销。
export type AgentUndoCompactionResult = { ok: true } | { ok: false; error: string }

// 会话分支（fork）的返回结果；ok 时携带新会话 id（创建后自动切换）。
export type AgentForkResult = { ok: true; sessionId: string } | { ok: false; error: string }

// 上下文容量快照（状态栏展示：估计 token / 模型窗口）。
export interface AgentContextUsage {
  tokens: number
  contextWindow: number
}

// 导出会话选项。
export interface ExportSessionOptions {
  sessionId?: string
  format: "html" | "markdown" | "jsonl"
  customPath?: string
  openAfterExport?: boolean
}

// 导出会话结果。
export type ExportSessionResult =
  | { ok: true; filePath: string; canceled?: false }
  | { ok: true; canceled: true }
  | { ok: false; error: string }

// 复制会话选项。
export interface CopySessionOptions {
  sessionId?: string
  target?: "markdown" | "last_assistant"
}

// 复制会话结果。
export type CopySessionResult = { ok: true; text: string } | { ok: false; error: string }

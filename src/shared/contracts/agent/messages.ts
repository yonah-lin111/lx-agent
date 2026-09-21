// Agent 消息契约：用户/助手消息、记忆引用与消息联合类型。

import type { HookContextMessage } from "./hooks"
import type { CollaborationMode } from "./permissions"
import type {
  CompactionUsage,
  ImageContent,
  StopReason,
  TextContent,
  ThinkingContent,
  ToolCall,
  Usage,
} from "./primitives"
import type { TodoStateMessage } from "./todos"
import type { ToolResultMessage } from "./tools"
import type { UndoSummaryMessage } from "./undo"

// 用户消息指令来源元数据。
export interface UserMessageCommand {
  name: string
  kind: "builtin" | "prompt" | "skill"
  source?: "project" | "user"
}

// 用户消息。
export interface UserMessage {
  role: "user"
  content: string | (TextContent | ImageContent)[]
  timestamp: number
  // 是否为即时插话（steer 消息注入当前 run 的 turn 边界，用于视觉标识与区分）。
  isSteer?: boolean
  // 指令来源元数据（Prompt 模板、Skill 或 Slash 命令）。
  command?: UserMessageCommand
  files?: {
    name: string
    path: string
    type: "image" | "text"
    size?: string
    extension?: string
  }[]
}

export interface MemoryCitationEntry {
  path: string
  lineStart: number
  lineEnd: number
  note?: string
}

export interface MemoryCitation {
  entries: MemoryCitationEntry[]
  rolloutIds?: string[]
}

export interface WorkspaceMemorySummary {
  memoryPath: string
  rawContent: string
  sections: { title: string; content: string }[]
  notesCount: number
  rolloutsCount: number
}

// 单条工具输出的 RTK 压缩命中记录（按 toolCallId 归因到工具步骤）。
export interface TokenSaverHit {
  // 工具调用 ID。
  toolCallId: string
  // 工具名。
  toolName: string
  // 生效的过滤器名。
  filter: string
  // 该条输出节省的字符数。
  savedChars: number
}

// Token Saver 出站请求生效记录（随 assistant 消息落库；执行流程底部标注展示）。
// 档位字段为 settings 中的 CavemanLevel / PonytailLevel 字符串值。
export interface TokenSaverRun {
  // RTK：实际生效的过滤器名（去重，按首次生效顺序）。
  rtkFilters?: string[]
  // RTK：压缩节省的字符数（整轮汇总）。
  rtkSavedChars?: number
  // RTK：逐工具输出的命中明细（按 toolCallId 归因）。
  hits?: TokenSaverHit[]
  // Caveman：生效档位。
  cavemanLevel?: string
  // Ponytail：生效档位。
  ponytailLevel?: string
}

// 助手消息。
export interface AssistantMessage {
  role: "assistant"
  content: (TextContent | ThinkingContent | ToolCall)[]
  provider: string
  model: string
  // 思考等级（对应 model.variants 的 key，如 "high"）
  variant?: string
  usage: Usage
  stopReason: StopReason
  errorMessage?: string
  timestamp: number
  // 首字/首个事件到达的时间戳（用于精准统计 TTFT 及 User 提示词响应耗时）。
  firstChunkTimestamp?: number
  durationMs?: number
  citations?: MemoryCitation
  // 本轮请求实际生效的 Token Saver 记录（未生效时不设置）。
  tokenSaver?: TokenSaverRun
}

// 模型切换/初始模型消息：非交互块，记录模型切换及注入的模型厂商自适应提示词。
export interface ModelSwitchMessage {
  role: "modelSwitch"
  provider: string
  model: string
  // 思考等级
  variant?: string
  family: string
  instructions?: string
  timestamp: number
  // 是否为会话创建时的初始模型条目
  isInitial?: boolean
}

// 协作模式切换/初始模式消息：非交互块，记录模式切换（模式提示词由系统提示词模式段注入，不重复落库）。
export interface CollaborationModeSwitchMessage {
  role: "modeSwitch"
  mode: CollaborationMode
  timestamp: number
  // 是否为会话创建时的初始模式条目
  isInitial?: boolean
}

// 上下文压缩摘要消息：可见的非交互块，标注"此处已压缩"。
// 不落 message entry（compaction entry 的 payload 即摘要）；UI 与模型上下文共用同一份。
export interface CompactionSummaryMessage {
  role: "compactionSummary"
  summary: string
  // 被压缩部分的估计 token 数（展示"压缩了多少"）。
  tokensBefore: number
  timestamp: number
  // 是否手动触发（/compact）；自动压缩不可经 /undo 撤销。
  manual: boolean
  // 压缩所使用的模型。
  model?: string
  // 压缩摘要生成调用的实际 token 用量（输入=发给压缩模型的上下文，输出=压缩模型输出）。
  usage?: CompactionUsage
  // 摘要本身的估计 token 数（压缩后的上下文规模）。
  summaryTokens?: number
}

// Agent 消息联合类型。
export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | CompactionSummaryMessage
  | UndoSummaryMessage
  | TodoStateMessage
  | ToolResultMessage
  | ModelSwitchMessage
  | CollaborationModeSwitchMessage
  | HookContextMessage

// 建议问题生成请求的对话上下文消息。
export interface SuggestedQuestionContextMessage {
  role: "user" | "assistant"
  content: string
}

// 工具契约：MCP 命名空间、协作通信、子代理、LSP、图片查看与工具结果消息。

import type { AgentDiff } from "./diff"
import type { AgentMessage } from "./messages"
import type { SandboxPolicy } from "./permissions"
import type { ImageContent, TextContent, Usage } from "./primitives"

// MCP 工具全名命名空间前缀（`mcp__server__tool`），与内置工具名隔离。
export const MCP_TOOL_NAMESPACE = "mcp__"

// 结构化多 Agent 协作通信信元（author / recipient / triggerTurn）。
export interface InterAgentCommunication {
  // 消息唯一标识
  id?: string
  // 发送者（例如 "orchestrator", "task:explorer"）
  author: string
  // 接收者（例如 "task:explorer", "orchestrator"）
  recipient: string
  // 抄送或次要接收者
  otherRecipients?: string[]
  // 结构化消息正文或任务指令
  content: string
  // 是否立即触发目标 Agent 的新一轮执行推理
  triggerTurn: boolean
  // 消息元数据（时间戳、类型等）
  metadata?: Record<string, unknown>
}

// 子代理工具步骤（时间轴展示）。
export interface SubagentStep {
  toolName: string
  args: Record<string, unknown>
  // 结果摘要（成功文本）或错误信息。
  result?: string
  status: "running" | "done" | "error"
}

// 子代理面板数据（task 工具产物；随 ToolResultMessage 落库，恢复后重建弹窗）。
export interface SubagentData {
  // 子代理唯一标识（跨轮次续接主键）。
  subagentId?: string
  // AI 分发的子代理名（缺失时回退角色名/ "task"）。
  name: string
  // 创建时固定的角色名（内置/用户自定义；缺省 = 默认子代理）。
  roleName?: string
  // 任务描述（task 输入）。
  description: string
  // 委托任务全文（task 输入）。
  prompt: string
  // 结构化通信记录（主 Agent 与子代理的交互流）
  communications?: InterAgentCommunication[]
  // 继承自父级的沙箱策略
  sandboxPolicy?: SandboxPolicy
  // 子代理完整内部上下文（弹窗展示真相源，含工具/MCP/skill/文本）。
  messages: AgentMessage[]
  // 工具步骤（时间轴展示；含内部工具/思考/MCP/skill 调用）。
  steps: SubagentStep[]
  // 聚合 token 用量。
  usage: Usage
  // 运行状态：流式快照恒为 running；终态为 done / error / aborted（旧持久化数据缺省）。
  status?: "running" | "done" | "error" | "aborted"
  // 最终输出超限时完整结果落盘路径。
  filePath?: string
}

// LSP 语义检索操作（lsp 工具）。
export type LspOperation =
  | "goToDefinition"
  | "findReferences"
  | "hover"
  | "documentSymbol"
  | "workspaceSymbol"
  | "goToImplementation"
  | "prepareCallHierarchy"
  | "incomingCalls"
  | "outgoingCalls"

// LSP 结果位置（供渲染跳转；行/列为 1 起始，filePath 为绝对路径）。
export interface LspLocationResult {
  filePath: string
  line: number
  character: number
  // 签名或符号名（位置型结果无自然名称时为空串）。
  label: string
}

// lsp 工具结构化结果（随 ToolResultMessage 落库，恢复后渲染块复用跳转）。
export interface LspToolDetails {
  operation: LspOperation
  // 请求目标文件（绝对路径）。
  filePath: string
  // 请求位置（1 起始）。
  line: number
  character: number
  // workspaceSymbol 的搜索查询。
  query?: string
  // hover 等文本型结果的正文（无位置行时 results 为空数组）。
  text?: string
  results: LspLocationResult[]
  error?: string
}

// view_image 结构化结果（随 ToolResultMessage 落库，供 UI 渲染与审计）。
export interface ViewImageDetails {
  // 图片绝对路径（renderer 经 lx-image://local 渲染）。
  path: string
  // 实际发送给模型的 MIME 类型。
  mimeType: string
  detail: "high" | "original"
  // 发送给模型的尺寸。
  width: number
  height: number
  // 原图尺寸。
  sourceWidth: number
  sourceHeight: number
  // 是否发生缩放或重编码。
  resized: boolean
  // 实际发送的字节数。
  sizeBytes: number
}

// 工具结果消息。
export interface ToolResultMessage {
  role: "toolResult"
  toolCallId: string
  toolName: string
  content: (TextContent | ImageContent)[]
  isError: boolean
  timestamp: number
  // 工具执行耗时（毫秒）。
  durationMs?: number
  // 工具执行的可视化 diff（edit/write 工具产物，供渲染与落库）。
  diff?: AgentDiff
  // 子代理面板数据（task 单任务模式产物，供渲染与落库）。
  subagent?: SubagentData
  // 批量扇出子代理面板数据（task 批量模式产物，按输入顺序，供落库与后续渲染）。
  subagents?: SubagentData[]
  // LSP 检索结果（lsp 工具产物，供渲染与落库）。
  lsp?: LspToolDetails
  // 图片查看结果（view_image 工具产物，供渲染与落库）。
  image?: ViewImageDetails
}

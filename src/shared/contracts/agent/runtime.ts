// 运行时状态契约：后台任务与 MCP/LSP 服务状态快照。

// 后台任务唯一标识（会话内自增：bash-1, bash-2 等）。
export type JobId = string

// 任务类型与生命周期状态。
export type JobKind = "bash" | "subagent"
export type JobStatus = "running" | "stopping" | "completed" | "killed" | "failed"

// 任务快照（面向 UI 与模型工具只读展示）。
export interface JobSnapshot {
  id: JobId
  kind: JobKind
  label: string
  status: JobStatus
  detail?: string
  startedAt: number
  finishedAt?: number
  pid?: number
  sessionId: string
  outputLimitBytes?: number
}

// 任务读取结果。
export interface JobReadResult {
  text: string
  job: JobSnapshot
  hasMore: boolean
}

// 会话能力快照（随会话冻结）。
export interface AgentCapabilitySnapshot {
  tools: string[]
  mcp: string[]
  skills: string[]
}

// MCP server 连接状态（全局状态与设置页面展示）。
export interface McpServerStatusItem {
  name: string
  status: "connected" | "disabled" | "failed"
  toolsCount?: number
  tools?: string[]
  error?: string
}

// LSP server 包安装状态（状态栏指示；按 npm 包粒度）。
export interface LspServerStatusItem {
  packageName: string
  installed: boolean
}

// 批量安装缺失 LSP server 的结果。
export type LspInstallResult = { installed: string[]; failed: string[] }

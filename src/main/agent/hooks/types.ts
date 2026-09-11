import type { HookContextMessage, HookEventName, HookRunStatus } from "@shared/contracts/agent"

// 已加载并解析完成的 hook 配置条目（配置顺序即执行顺序）。
export interface LoadedHook {
  name: string
  event: HookEventName
  // 已解析的工具名精确列表；缺省 = 全部工具。
  matcher?: string[]
  command: string
  commandWindows?: string
  timeoutSec: number
  additionalContextLimit: number
  // 全局配置顺序，保证串行确定性。
  order: number
}

// 单次 hook 运行结果（含失败/阻断；fail-open 不抛错）。
export interface HookRunResult {
  hook: LoadedHook
  status: HookRunStatus
  message: HookContextMessage
  additionalContext?: string
  block?: { reason: string }
  stop?: { reason?: string }
  permission?: { decision: "allow" | "deny"; reason?: string }
}

export interface HookDispatchResult {
  // 每个 hook 一条（含 failed）。
  runs: HookRunResult[]
}

// 一次派发请求（公共字段由 dispatcher 归一为 stdin 协议字段）。
export interface HookDispatchInput {
  event: HookEventName
  sessionId?: string | null
  turnId?: string
  cwd?: string
  model?: string
  permissionMode?: string
  // 工具类事件用于 matcher 过滤与 stdin 的 tool_name。
  toolName?: string
  // 事件私有字段（snake_case，直接并入 stdin payload）。
  payload?: Record<string, unknown>
}

// hook 子进程 stdin 协议载荷（对齐 Codex / Claude 生态）。
export interface HookCommandPayload {
  session_id?: string
  turn_id?: string
  cwd: string
  hook_event_name: HookEventName
  model?: string
  permission_mode?: string
  tool_name?: string
  tool_input?: unknown
  tool_use_id?: string
  tool_response?: unknown
  prompt?: string
  reason?: string
  trigger?: "manual" | "auto"
  source?: string
  agent_id?: string
  agent_type?: string
  task?: string
  status?: string
  last_assistant_message?: string
  [key: string]: unknown
}

// 子进程执行输出。
export interface HookCommandOutput {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  spawnFailed: boolean
  durationMs: number
  stdoutTruncated: boolean
  stderrTruncated: boolean
}

// 输出解析结果（决策归一）。
export interface ParsedHookOutput {
  status: HookRunStatus
  // 审计/展示文本：additionalContext > systemMessage > 阻断/停止原因。
  text: string
  additionalContext?: string
  systemMessage?: string
  block?: { reason: string }
  stop?: { reason?: string }
  permission?: { decision: "allow" | "deny"; reason?: string }
}

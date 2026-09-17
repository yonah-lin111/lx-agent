// 钩子契约：生命周期事件名、matcher 判定、运行状态与产物消息。

// 钩子生命周期事件名（外部 hook 线协议兼容）。
export type HookEventName =
  | "PreToolUse"
  | "PermissionRequest"
  | "PostToolUse"
  | "PreCompact"
  | "PostCompact"
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "SubagentStart"
  | "SubagentStop"
  | "Stop"

// 全量事件集（PascalCase 精确名，对齐 wire 协议）。
export const HOOK_EVENT_NAMES: readonly HookEventName[] = [
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PreCompact",
  "PostCompact",
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "SubagentStart",
  "SubagentStop",
  "Stop",
]

// 仅这些事件消费 matcher 字段；其余事件忽略该字段。
export const HOOK_MATCHER_EVENTS: readonly HookEventName[] = [
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
]

// 判断事件是否消费 matcher 字段。
export const isHookMatcherEvent = (event: HookEventName): boolean =>
  HOOK_MATCHER_EVENTS.includes(event)

// 单次 hook 运行状态。
export type HookRunStatus = "completed" | "failed" | "blocked"

// hook 运行产物消息：独立注入 LLM（非空 text）并驱动 FlowList；不进 MsgList。
export interface HookContextMessage {
  role: "hookContext"
  event: HookEventName
  hookName: string
  status: HookRunStatus
  // additionalContext / 阻断原因 / systemMessage；空串不注入 LLM，仅审计。
  text: string
  durationMs?: number
  timestamp: number
}

// 权限与协作模式契约：权限三态、沙箱策略、请求/决策/响应与模式归一化。

// 权限确认模式（对齐 Claude Code 权限体系三态）。
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions"

// 协作模式（对齐 Codex 执行协作模式三态与前端设计模式，支持向后兼容 "default" 归一化为 "build"）。
export type CollaborationMode = "build" | "plan" | "review" | "design"

// 协作模式向后兼容与归一化辅助函数
export const normalizeCollaborationMode = (mode?: string | null): CollaborationMode => {
  if (mode === "plan" || mode === "review" || mode === "build" || mode === "design") {
    return mode
  }
  return "build"
}

// 沙箱策略（对齐 Codex 执行沙箱三态）。
export type SandboxPolicy = "read-only" | "workspace-write" | "danger-full-access"

// 权限配置（~/.lx/config.json 的 agent.permissions 节点）。
export interface PermissionSettings {
  defaultMode: PermissionMode
  sandboxPolicy?: SandboxPolicy
  collaborationMode?: CollaborationMode
  allow: string[]
  deny: string[]
  ask: string[]
}

// 权限请求（main → renderer，命令面板展示）。
export interface PermissionRequest {
  requestId: string
  toolName: string
  args: unknown
  summary: string
  mode: PermissionMode
  sessionId: string | null
}

// 权限决策（不含 requestId；主进程挂起请求的内部语义）。
// allowAll：会话级"允许全部工具"，跳过规则与弹窗，随会话切换重置。
// permanent：写回配置 allow[]/deny[]（精确参数），同工具同参数后续不再询问/直接拒绝。
export type PermissionDecision = {
  decision: "allow" | "deny"
  rememberForSession?: boolean
  allowAll?: boolean
  permanent?: boolean
}

// 权限决策（renderer → main 响应负载）。
export interface PermissionResponse {
  requestId: string
  decision: "allow" | "deny"
  rememberForSession?: boolean
  allowAll?: boolean
  // 永久允许/拒绝写回配置（allowAll 不写回）。
  permanent?: boolean
}

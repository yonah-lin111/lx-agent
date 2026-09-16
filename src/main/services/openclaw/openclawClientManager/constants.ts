export const OPERATOR_SCOPES = [
  "operator.read",
  "operator.write",
  "operator.approvals",
  // sessions.rewind（删除轮次/回退会话）要求 admin；不申请则该操作必被 Gateway 拒绝。
  "operator.admin",
]
export const CLIENT_CAPS = ["tool-events"]

// agent run 的最长等待时间（10 分钟），与 CLI 默认一致。
export const AGENT_RUN_TIMEOUT_MS = 600_000

// 单次历史水合与会话列表的最大条数。
export const HISTORY_LIMIT = 200
export const SESSION_LIST_LIMIT = 100

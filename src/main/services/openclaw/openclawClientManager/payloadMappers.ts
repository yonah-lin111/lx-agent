import type {
  OpenClawChatMessage,
  OpenClawConnectionStatus,
  OpenClawMessageUsage,
  OpenClawSessionInfo,
  OpenClawSessionStats,
} from "@shared/contracts/openclaw"
import type { OpenClawAgentItem } from "@shared/settings"

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// 从消息 content（字符串或文本块数组）中提取纯文本。
export const extractText = (content: unknown): string => {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((block) =>
      isRecord(block) && block.type === "text" && typeof block.text === "string" ? block.text : "",
    )
    .join("")
}

export const parseConnectError = (
  error: Error,
): { status: OpenClawConnectionStatus; message: string; pairingRequestId?: string } => {
  const rawMessage = error.message || String(error)
  if (/PAIRING_REQUIRED|pairing/i.test(rawMessage)) {
    const match = rawMessage.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    return {
      status: "pairing-required",
      message: rawMessage,
      ...(match ? { pairingRequestId: match[0] } : {}),
    }
  }

  // 捕获典型的网络层不可达/拒绝连接异常
  if (/EHOSTUNREACH/i.test(rawMessage)) {
    return {
      status: "error",
      message: `EHOSTUNREACH: ${rawMessage}`,
    }
  }
  if (/ECONNREFUSED/i.test(rawMessage)) {
    return {
      status: "error",
      message: `ECONNREFUSED: ${rawMessage}`,
    }
  }
  if (/ETIMEDOUT/i.test(rawMessage)) {
    return {
      status: "error",
      message: `ETIMEDOUT: ${rawMessage}`,
    }
  }
  if (/ENOTFOUND/i.test(rawMessage)) {
    return {
      status: "error",
      message: `ENOTFOUND: ${rawMessage}`,
    }
  }

  return { status: "error", message: rawMessage }
}

// 将 Gateway 返回的 agent 条目映射为配置模型。
export const mapAgent = (
  raw: Record<string, unknown>,
  defaultId?: string,
): OpenClawAgentItem | null => {
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  if (!id) return null
  const identity = isRecord(raw.identity) ? raw.identity : null
  const identityName = identity && typeof identity.name === "string" ? identity.name.trim() : ""
  const rawName = typeof raw.name === "string" ? raw.name.trim() : ""
  const workspace = typeof raw.workspace === "string" ? raw.workspace.trim() : ""
  return {
    id,
    name: identityName || rawName || id,
    ...(workspace ? { workspace } : {}),
    ...(defaultId === id ? { isDefault: true } : {}),
  }
}

// 从 sessions.list 结果中提取会话行（结果封套为开放 schema，做多形态兼容）。
export const extractSessionRows = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) return payload.filter(isRecord)
  if (!isRecord(payload)) return []
  for (const field of ["sessions", "rows", "items", "entries"]) {
    const value = payload[field]
    if (Array.isArray(value)) return value.filter(isRecord)
  }
  return []
}

// 将 sessions.list 行映射为会话摘要。
export const mapSessionInfo = (raw: Record<string, unknown>): OpenClawSessionInfo | null => {
  const key = typeof raw.key === "string" ? raw.key.trim() : ""
  if (!key) return null
  const label = typeof raw.label === "string" ? raw.label.trim() : ""
  const displayName =
    typeof raw.displayName === "string"
      ? raw.displayName.trim()
      : typeof raw.derivedTitle === "string"
        ? raw.derivedTitle.trim()
        : ""
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : undefined
  return {
    key,
    ...(label ? { label } : {}),
    ...(displayName ? { displayName } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(raw.isMain === true ? { isMain: true } : {}),
  }
}

export const mapSessionList = (payload: unknown): OpenClawSessionInfo[] =>
  extractSessionRows(payload)
    .map(mapSessionInfo)
    .filter((session): session is OpenClawSessionInfo => session !== null)

// 读取非空字符串字段。
export const readTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

// 读取非负有限数字字段。
export const readNonNegativeNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined

// 将 Gateway 用量对象映射为消息 token 用量。
export const mapMessageUsage = (raw: Record<string, unknown>): OpenClawMessageUsage | null => {
  const input = readNonNegativeNumber(raw.input) ?? readNonNegativeNumber(raw.inputTokens)
  const output = readNonNegativeNumber(raw.output) ?? readNonNegativeNumber(raw.outputTokens)
  const usage: OpenClawMessageUsage = {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
  }
  return Object.keys(usage).length > 0 ? usage : null
}

// 将 sessions.describe 结果映射为会话级模型与上下文用量。
export const mapSessionStats = (payload: unknown): OpenClawSessionStats | null => {
  const session = isRecord(payload) && isRecord(payload.session) ? payload.session : null
  if (!session) return null
  const budget = isRecord(session.contextBudgetStatus) ? session.contextBudgetStatus : null
  const model = readTrimmedString(session.activeModel) ?? readTrimmedString(session.model)
  const modelProvider =
    readTrimmedString(session.activeModelProvider) ?? readTrimmedString(session.modelProvider)
  const contextUsed = budget ? readNonNegativeNumber(budget.estimatedPromptTokens) : undefined
  const contextWindow =
    (budget ? readNonNegativeNumber(budget.contextTokenBudget) : undefined) ??
    readNonNegativeNumber(session.contextTokens)
  const stats: OpenClawSessionStats = {
    ...(model ? { model } : {}),
    ...(modelProvider ? { modelProvider } : {}),
    ...(contextUsed !== undefined ? { contextUsed } : {}),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
  }
  return Object.keys(stats).length > 0 ? stats : null
}

// 将 chat.history 结果中的单条消息映射为聊天消息（历史消息均为已完成态）。
export const mapHistoryMessage = (
  raw: Record<string, unknown>,
  index: number,
): OpenClawChatMessage | null => {
  const source = isRecord(raw.message) ? raw.message : raw
  const roleRaw = typeof source.role === "string" ? source.role : ""
  if (roleRaw !== "user" && roleRaw !== "assistant" && roleRaw !== "system") return null
  const content =
    extractText(source.content) || (typeof source.text === "string" ? source.text : "")
  if (!content) return null
  const id =
    typeof source.id === "string" && source.id
      ? source.id
      : typeof raw.id === "string" && raw.id
        ? raw.id
        : `history-${index}`
  const timestampCandidates = [source.timestamp, source.at, source.createdAt, raw.timestamp, raw.at]
  const timestamp =
    timestampCandidates.find(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    ) ?? Date.now() + index
  const runId =
    typeof source.runId === "string" && source.runId
      ? source.runId
      : typeof raw.runId === "string" && raw.runId
        ? raw.runId
        : undefined
  // assistant 消息自带生成时模型与 token 用量，随历史一并保留。
  const model = readTrimmedString(source.model)
  const modelProvider =
    readTrimmedString(source.provider) ?? readTrimmedString(source.modelProvider)
  const usage = isRecord(source.usage) ? mapMessageUsage(source.usage) : null
  return {
    id,
    role: roleRaw,
    content,
    timestamp,
    ...(runId ? { runId } : {}),
    status: "completed",
    ...(model ? { model } : {}),
    ...(modelProvider ? { modelProvider } : {}),
    ...(usage ? { usage } : {}),
  }
}

export const mapHistoryMessages = (payload: unknown): OpenClawChatMessage[] => {
  const messages = isRecord(payload) && Array.isArray(payload.messages) ? payload.messages : []
  return messages
    .map((raw, index) => (isRecord(raw) ? mapHistoryMessage(raw, index) : null))
    .filter((message): message is OpenClawChatMessage => message !== null)
}

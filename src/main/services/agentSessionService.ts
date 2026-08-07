import { randomUUID } from "node:crypto"
import type { AgentSessionSummary } from "@shared/contracts/agent"
import type Database from "better-sqlite3"
import { getDatabase } from "@/db"

// 会话数据库记录。
export type AgentSessionRecord = {
  external_id: string
  project_item_id: string | null
  project_id: string | null
  page: string | null
  title: string
  cwd: string
  created_at: string
  updated_at: string
}

// 会话上下文条目数据库记录。
export type AgentSessionEntryRecord = {
  external_id: string
  session_id: string
  seq: number
  parent_id: string | null
  type: string
  payload: string
  created_at: string
}

// 调用记录类型与状态。
export type AgentCallKind = "builtin" | "mcp" | "subagent" | "skill"
export type AgentCallStatus = "running" | "success" | "error" | "aborted"

const toSummary = (row: AgentSessionRecord): AgentSessionSummary => ({
  id: row.external_id,
  title: row.title,
  cwd: row.cwd,
  projectId: row.project_id ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * Agent 会话持久化服务：会话元数据、上下文条目树与调用记录的 SQLite 读写。
 * 写入均须在调用方提供的 transaction 内完成（单写者，无并发）。
 */
export const createAgentSessionService = (getConnection: () => Database.Database) => ({
  // 事务包装：会话创建/追加 entry/记录调用的多条写包在一个事务。
  transaction: <T>(fn: () => T): T => getConnection().transaction(fn)(),

  insertSession(input: {
    externalId: string
    projectItemId: string | null
    projectId: string | null
    page: string | null
    title: string
    cwd: string
    createdAt: string
    updatedAt: string
  }): void {
    getConnection()
      .prepare(
        "INSERT INTO agent_session (external_id, project_item_id, project_id, page, title, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.externalId,
        input.projectItemId,
        input.projectId,
        input.page,
        input.title,
        input.cwd,
        input.createdAt,
        input.updatedAt,
      )
  },

  getSession: (sessionId: string): AgentSessionRecord | undefined =>
    getConnection().prepare("SELECT * FROM agent_session WHERE external_id = ?").get(sessionId) as
      | AgentSessionRecord
      | undefined,

  // 同步 updated_at（每次追加 entry 的同一事务内调用）。
  touchSession: (sessionId: string, updatedAt: string): void => {
    getConnection()
      .prepare("UPDATE agent_session SET updated_at = ? WHERE external_id = ?")
      .run(updatedAt, sessionId)
  },

  // 会话内下一条 entry 序号（单调递增）。
  nextSeq: (sessionId: string): number => {
    const row = getConnection()
      .prepare(
        "SELECT COALESCE(MAX(seq), -1) + 1 AS seq FROM agent_session_entry WHERE session_id = ?",
      )
      .get(sessionId) as { seq: number }
    return row.seq
  },

  insertEntry(input: {
    externalId: string
    sessionId: string
    seq: number
    parentId?: string | null
    type: string
    payload: string
    createdAt: string
  }): void {
    getConnection()
      .prepare(
        "INSERT INTO agent_session_entry (external_id, session_id, seq, parent_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.externalId,
        input.sessionId,
        input.seq,
        input.parentId ?? null,
        input.type,
        input.payload,
        input.createdAt,
      )
  },

  // 按 seq 升序读取会话全部条目（恢复会话用）。
  listEntries: (sessionId: string): AgentSessionEntryRecord[] =>
    getConnection()
      .prepare("SELECT * FROM agent_session_entry WHERE session_id = ? ORDER BY seq ASC")
      .all(sessionId) as AgentSessionEntryRecord[],

  // 只读会话的消息条目（删除一轮对话时定位边界用）。
  listMessageEntries: (sessionId: string): AgentSessionEntryRecord[] =>
    getConnection()
      .prepare(
        "SELECT * FROM agent_session_entry WHERE session_id = ? AND type = 'message' ORDER BY seq ASC",
      )
      .all(sessionId) as AgentSessionEntryRecord[],

  // 重命名会话标题（同步 updated_at）。
  renameSession(sessionId: string, title: string, updatedAt: string): void {
    getConnection()
      .prepare("UPDATE agent_session SET title = ?, updated_at = ? WHERE external_id = ?")
      .run(title, updatedAt, sessionId)
  },

  // 批量删除引用指定 entry 的调用记录（entry_id 无级联，必须先删调用再删 entry）。
  deleteCallsByEntryIds(entryIds: string[]): void {
    if (entryIds.length === 0) return
    const placeholders = entryIds.map(() => "?").join(",")
    getConnection()
      .prepare(`DELETE FROM agent_call WHERE entry_id IN (${placeholders})`)
      .run(...entryIds)
  },

  // 批量删除 entry 行。
  deleteEntries(entryIds: string[]): void {
    if (entryIds.length === 0) return
    const placeholders = entryIds.map(() => "?").join(",")
    getConnection()
      .prepare(`DELETE FROM agent_session_entry WHERE external_id IN (${placeholders})`)
      .run(...entryIds)
  },

  // 删除会话行本身（调用方须先清理其 entries/calls）。
  deleteSessionRow(sessionId: string): void {
    getConnection().prepare("DELETE FROM agent_session WHERE external_id = ?").run(sessionId)
  },

  // 级联删除整个会话：显式顺序删调用 → entries → 会话（避免 entry_id 无级联导致的 FK 冲突）。
  deleteSession(sessionId: string): void {
    const database = getConnection()
    database.transaction(() => {
      database.prepare("DELETE FROM agent_call WHERE session_id = ?").run(sessionId)
      database.prepare("DELETE FROM agent_session_entry WHERE session_id = ?").run(sessionId)
      database.prepare("DELETE FROM agent_session WHERE external_id = ?").run(sessionId)
    })()
  },

  insertCall(input: {
    sessionId: string
    externalId: string
    entryId?: string | null
    parentCallId?: string | null
    kind: AgentCallKind
    name: string
    mcpServer?: string | null
    status: AgentCallStatus
    args?: string | null
    result?: string | null
    durationMs?: number | null
    startedAt: string
    finishedAt?: string | null
    createdAt: string
    updatedAt: string
  }): void {
    getConnection()
      .prepare(
        "INSERT INTO agent_call (external_id, session_id, entry_id, parent_call_id, kind, name, mcp_server, status, args, result, duration_ms, details, started_at, finished_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)",
      )
      .run(
        input.externalId,
        input.sessionId,
        input.entryId ?? null,
        input.parentCallId ?? null,
        input.kind,
        input.name,
        input.mcpServer ?? null,
        input.status,
        input.args ?? null,
        input.result ?? null,
        input.durationMs ?? null,
        input.startedAt,
        input.finishedAt ?? null,
        input.createdAt,
        input.updatedAt,
      )
  },

  // 会话列表：全量拉取，按最后活跃排序（历史面板客户端过滤）。
  listSessions: (): AgentSessionSummary[] => {
    const rows = getConnection()
      .prepare("SELECT * FROM agent_session ORDER BY updated_at DESC, id DESC")
      .all() as AgentSessionRecord[]
    return rows.map(toSummary)
  },
})

// 生成业务键（供 agent_session / entry / call 使用）。
export const createExternalId = (): string => randomUUID()

// 生产环境使用的 Agent 会话数据服务。
export const agentSessionService = createAgentSessionService(getDatabase)

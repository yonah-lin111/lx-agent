import { randomUUID } from "node:crypto"
import type { AgentSessionFilter, AgentSessionSummary } from "@shared/contracts/agent"
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

  // 会话列表：item 会话按 projectItemId，页面会话按 page，均按最后活跃排序。
  listSessions: (filter: AgentSessionFilter): AgentSessionSummary[] => {
    const database = getConnection()
    let rows: AgentSessionRecord[]
    if (filter.projectItemId) {
      rows = database
        .prepare(
          "SELECT * FROM agent_session WHERE project_item_id = ? ORDER BY updated_at DESC, id DESC",
        )
        .all(filter.projectItemId) as AgentSessionRecord[]
    } else if (filter.page) {
      rows = database
        .prepare("SELECT * FROM agent_session WHERE page = ? ORDER BY updated_at DESC, id DESC")
        .all(filter.page) as AgentSessionRecord[]
    } else {
      rows = database
        .prepare("SELECT * FROM agent_session ORDER BY updated_at DESC, id DESC")
        .all() as AgentSessionRecord[]
    }
    return rows.map(toSummary)
  },
})

// 生成业务键（供 agent_session / entry / call 使用）。
export const createExternalId = (): string => randomUUID()

// 生产环境使用的 Agent 会话数据服务。
export const agentSessionService = createAgentSessionService(getDatabase)

import { randomUUID } from "node:crypto"
import type { AgentMessage, AgentSessionSummary } from "@shared/contracts/agent"
import type Database from "better-sqlite3"
import { getDatabase } from "@/db"

// 会话数据库记录。
export type AgentSessionRecord = {
  external_id: string
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
    projectId: string | null
    page: string | null
    title: string
    cwd: string
    createdAt: string
    updatedAt: string
  }): void {
    getConnection()
      .prepare(
        "INSERT INTO agent_session (external_id, project_id, page, title, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.externalId,
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

  // 更新会话工具执行目录（/gitWorktree 切换，同步 updated_at）。
  updateSessionCwd(sessionId: string, cwd: string, updatedAt: string): void {
    getConnection()
      .prepare("UPDATE agent_session SET cwd = ?, updated_at = ? WHERE external_id = ?")
      .run(cwd, updatedAt, sessionId)
  },

  // 更新会话关联的项目与执行目录（同步 updated_at）。
  updateSessionProject(
    sessionId: string,
    projectId: string | null,
    cwd: string,
    updatedAt: string,
  ): void {
    getConnection()
      .prepare(
        "UPDATE agent_session SET project_id = ?, cwd = ?, updated_at = ? WHERE external_id = ?",
      )
      .run(projectId, cwd, updatedAt, sessionId)
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

  // 级联删除整个会话：显式顺序删调用 → entries → snapshots → 会话（避免 FK 无级联导致的冲突）。
  deleteSession(sessionId: string): void {
    const database = getConnection()
    database.transaction(() => {
      database.prepare("DELETE FROM agent_call WHERE session_id = ?").run(sessionId)
      database.prepare("DELETE FROM agent_session_entry WHERE session_id = ?").run(sessionId)
      database.prepare("DELETE FROM agent_snapshot WHERE session_id = ?").run(sessionId)
      database.prepare("DELETE FROM agent_session WHERE external_id = ?").run(sessionId)
    })()
  },

  // 会话分支：复制 forkSeq 之前的历史（切割点用户轮不包含）到新会话，保持原始 seq / parent_id 关系。
  // 同一事务内复制 session + entries + snapshots；不复制 agent_call（renderer 展示依赖 entry payload，是派生视图）。
  // 无 forkSeq = 整会话复制（v1 UI 不暴露，留口）。
  forkSession(
    sessionId: string,
    forkSeq?: number,
  ): { ok: true; session: AgentSessionSummary } | { ok: false; error: string } {
    const source = this.getSession(sessionId)
    if (!source) {
      return { ok: false, error: "会话不存在。" }
    }

    // 切割点定位：forkSeq 对应 entry 必须是 user 消息轮，否则拒绝（对齐 pi invalid_fork_target）。
    let forkUserTimestamp: number | undefined
    if (forkSeq !== undefined) {
      const forkEntry = this.listEntries(sessionId).find((entry) => entry.seq === forkSeq)
      if (!forkEntry || forkEntry.type !== "message") {
        return { ok: false, error: "只能从用户消息轮创建分支。" }
      }
      let message: AgentMessage | undefined
      try {
        message = JSON.parse(forkEntry.payload) as AgentMessage
      } catch {
        return { ok: false, error: "只能从用户消息轮创建分支。" }
      }
      if (message.role !== "user") {
        return { ok: false, error: "只能从用户消息轮创建分支。" }
      }
      forkUserTimestamp = message.timestamp
    }

    const now = new Date().toISOString()
    const forkTitle = getForkedTitle(source.title)
    const newSessionId = createExternalId()

    try {
      this.transaction(() => {
        this.insertSession({
          externalId: newSessionId,
          projectId: source.project_id,
          page: source.page,
          title: forkTitle,
          cwd: source.cwd,
          createdAt: now,
          updatedAt: now,
        })

        // entries：重写 external_id（parent_id 经映射指向新 id），seq 原样保持。
        const condition = forkSeq !== undefined ? "AND seq < ?" : ""
        const params = forkSeq !== undefined ? [sessionId, forkSeq] : [sessionId]
        const entryRows = getConnection()
          .prepare(
            `SELECT * FROM agent_session_entry WHERE session_id = ? ${condition} ORDER BY seq ASC`,
          )
          .all(...params) as AgentSessionEntryRecord[]
        const idMap = new Map<string, string>()
        for (const entry of entryRows) {
          const newExternalId = createExternalId()
          idMap.set(entry.external_id, newExternalId)
          this.insertEntry({
            externalId: newExternalId,
            sessionId: newSessionId,
            seq: entry.seq,
            parentId: entry.parent_id ? (idMap.get(entry.parent_id) ?? entry.parent_id) : null,
            type: entry.type,
            payload: entry.payload,
            createdAt: entry.created_at,
          })
        }

        // snapshots：继承切割点轮（含）之前的快照，新分支共享同一 cwd / git tree，hash 直接有效。
        type SnapshotRow = {
          external_id: string
          user_message_timestamp: number
          hash_start: string
          hash_end: string
          files_changed: string
          created_at: string
        }
        const snapshotRows = getConnection()
          .prepare(
            `SELECT * FROM agent_snapshot
             WHERE session_id = ? ${forkUserTimestamp !== undefined ? "AND user_message_timestamp <= ?" : ""}
             ORDER BY user_message_timestamp ASC`,
          )
          .all(
            forkUserTimestamp !== undefined ? [sessionId, forkUserTimestamp] : [sessionId],
          ) as SnapshotRow[]
        for (const snapshot of snapshotRows) {
          this.insertSnapshot({
            externalId: createExternalId(),
            sessionId: newSessionId,
            userMessageTimestamp: snapshot.user_message_timestamp,
            hashStart: snapshot.hash_start,
            hashEnd: snapshot.hash_end,
            filesChanged: snapshot.files_changed,
            createdAt: snapshot.created_at,
          })
        }
      })
    } catch {
      // 复制异常整体回滚（同一事务），对调用方返回失败。
      return { ok: false, error: "创建分支失败。" }
    }

    const created = this.getSession(newSessionId)
    return created
      ? { ok: true, session: toSummary(created) }
      : { ok: false, error: "创建分支失败。" }
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

  // 插入一轮的文件快照（turn 开始/结束两次 write-tree 的哈希 + 变更列表）。
  insertSnapshot(input: {
    externalId: string
    sessionId: string
    userMessageTimestamp: number
    hashStart: string
    hashEnd: string
    filesChanged: string
    createdAt: string
  }): void {
    getConnection()
      .prepare(
        `INSERT INTO agent_snapshot
          (external_id, session_id, user_message_timestamp, hash_start, hash_end, files_changed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.externalId,
        input.sessionId,
        input.userMessageTimestamp,
        input.hashStart,
        input.hashEnd,
        input.filesChanged,
        input.createdAt,
      )
  },

  // 按用户消息 timestamp 查快照（删轮回滚定位）。
  getSnapshotByUserTimestamp(
    sessionId: string,
    userMessageTimestamp: number,
  ):
    | {
        external_id: string
        session_id: string
        user_message_timestamp: number
        hash_start: string
        hash_end: string
        files_changed: string
        created_at: string
      }
    | undefined {
    return getConnection()
      .prepare("SELECT * FROM agent_snapshot WHERE session_id = ? AND user_message_timestamp = ?")
      .get(sessionId, userMessageTimestamp) as
      | {
          external_id: string
          session_id: string
          user_message_timestamp: number
          hash_start: string
          hash_end: string
          files_changed: string
          created_at: string
        }
      | undefined
  },

  // 删除一轮关联的快照（该轮消息删除后快照失效）。
  deleteSnapshotsByUserTimestamp(sessionId: string, userMessageTimestamp: number): void {
    getConnection()
      .prepare("DELETE FROM agent_snapshot WHERE session_id = ? AND user_message_timestamp = ?")
      .run(sessionId, userMessageTimestamp)
  },
})

// 生成业务键（供 agent_session / entry / call 使用）。
export const createExternalId = (): string => randomUUID()

// 分支会话标题：探测源标题的 `(fork #N)` 后缀递增，否则追加 `(fork #1)`（对齐 opencode getForkedTitle）。
export const getForkedTitle = (title: string): string => {
  const match = /^(.*?)\s*\(fork #(\d+)\)$/.exec(title)
  if (match) {
    return `${match[1]} (fork #${Number.parseInt(match[2], 10) + 1})`
  }
  return `${title} (fork #1)`
}

// 生产环境使用的 Agent 会话数据服务。
export const agentSessionService = createAgentSessionService(getDatabase)

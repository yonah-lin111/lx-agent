import { randomUUID } from "node:crypto"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAgentTables } from "@/db/schema/agentSchema"
import { createProjectTables } from "@/db/schema/projectSchema"
import { createAgentSessionService } from "@/services/agentSessionService"

let database: Database.Database
let service: ReturnType<typeof createAgentSessionService>

beforeEach(() => {
  database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  createProjectTables(database)
  createAgentTables(database)
  service = createAgentSessionService(() => database)
  // 项目条目 FK 目标。
  const now = new Date().toISOString()
  database
    .prepare(
      "INSERT INTO project (external_id, name, type, referenced_folders, created_at, updated_at) VALUES ('p1', 'proj', 'filesystem', '[]', ?, ?)",
    )
    .run(now, now)
  database
    .prepare(
      "INSERT INTO project_item (external_id, project_id, name, item_data, enabled_folder_paths, status, sort_order, created_at, updated_at) VALUES ('item1', 'p1', 'item', '', '[]', 'todo', 0, ?, ?)",
    )
    .run(now, now)
})

afterEach(() => {
  database.close()
})

const insertSession = (externalId: string, page: string | null, updatedAt: string): void => {
  service.insertSession({
    externalId,
    projectItemId: page ? null : "item1",
    projectId: page ? null : "p1",
    page,
    title: "会话",
    cwd: "/proj",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  })
}

describe("agentSessionService", () => {
  it("会话内 entries seq 单调递增", () => {
    const sessionId = randomUUID()
    const now = new Date().toISOString()
    service.insertSession({
      externalId: sessionId,
      projectItemId: "item1",
      projectId: "p1",
      page: null,
      title: "t",
      cwd: "/proj",
      createdAt: now,
      updatedAt: now,
    })

    let seq = service.nextSeq(sessionId)
    service.insertEntry({
      externalId: randomUUID(),
      sessionId,
      seq: seq++,
      type: "active_capabilities",
      payload: '{"tools":["read"]}',
      createdAt: now,
    })
    service.insertEntry({
      externalId: randomUUID(),
      sessionId,
      seq: seq,
      type: "message",
      payload: '{"role":"user","content":"hi"}',
      createdAt: now,
    })

    const entries = service.listEntries(sessionId)
    expect(entries.map((entry) => entry.seq)).toEqual([0, 1])
    expect(entries.map((entry) => entry.type)).toEqual(["active_capabilities", "message"])
    expect(service.nextSeq(sessionId)).toBe(2)
  })

  it("listSessions 按归属过滤并按 updated_at 倒序", () => {
    insertSession("s1", "/", "2026-01-01T00:00:00.000Z")
    insertSession("s2", "/", "2026-01-02T00:00:00.000Z")
    insertSession("s3", null, "2026-01-03T00:00:00.000Z")

    const pageSessions = service.listSessions({ page: "/" })
    expect(pageSessions.map((session) => session.id)).toEqual(["s2", "s1"])

    const itemSessions = service.listSessions({ projectItemId: "item1" })
    expect(itemSessions.map((session) => session.id)).toEqual(["s3"])
  })

  it("transaction 内多写原子回滚", () => {
    const sessionId = randomUUID()
    const now = new Date().toISOString()

    expect(() =>
      service.transaction(() => {
        service.insertSession({
          externalId: sessionId,
          projectItemId: null,
          projectId: null,
          page: "/",
          title: "t",
          cwd: "/",
          createdAt: now,
          updatedAt: now,
        })
        service.insertEntry({
          externalId: randomUUID(),
          sessionId,
          seq: 0,
          type: "message",
          payload: "{}",
          createdAt: now,
        })
        throw new Error("rollback")
      }),
    ).toThrow("rollback")

    expect(service.getSession(sessionId)).toBeUndefined()
    expect(service.listEntries(sessionId)).toEqual([])
  })

  it("记录调用并关联触发 entry", () => {
    const sessionId = randomUUID()
    const now = new Date().toISOString()
    service.transaction(() => {
      service.insertSession({
        externalId: sessionId,
        projectItemId: null,
        projectId: null,
        page: "/",
        title: "t",
        cwd: "/",
        createdAt: now,
        updatedAt: now,
      })
      service.insertEntry({
        externalId: "entry-1",
        sessionId,
        seq: 0,
        type: "message",
        payload: "{}",
        createdAt: now,
      })
      service.insertCall({
        sessionId,
        externalId: randomUUID(),
        entryId: "entry-1",
        kind: "builtin",
        name: "read",
        status: "success",
        args: '{"path":"/a"}',
        result: '{"content":"ok"}',
        durationMs: 10,
        startedAt: now,
        finishedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    })

    const rows = database
      .prepare("SELECT * FROM agent_call WHERE session_id = ?")
      .all(sessionId) as Array<{ name: string; kind: string; status: string; entry_id: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: "read",
      kind: "builtin",
      status: "success",
      entry_id: "entry-1",
    })
  })

  it("空会话无记录：未插入任何行时列表为空", () => {
    expect(service.listSessions({ page: "/" })).toEqual([])
    expect(service.getSession("missing")).toBeUndefined()
  })

  it("renameSession 更新标题并同步 updated_at", () => {
    insertSession("s1", "/", "2026-01-01T00:00:00.000Z")
    service.renameSession("s1", "新标题", "2026-02-01T00:00:00.000Z")
    const session = service.getSession("s1")
    expect(session?.title).toBe("新标题")
    expect(session?.updated_at).toBe("2026-02-01T00:00:00.000Z")
  })

  it("listMessageEntries 只返回消息条目并按 seq 升序", () => {
    const sessionId = randomUUID()
    const now = new Date().toISOString()
    service.insertSession({
      externalId: sessionId,
      projectItemId: null,
      projectId: null,
      page: "/",
      title: "t",
      cwd: "/",
      createdAt: now,
      updatedAt: now,
    })
    service.insertEntry({
      externalId: "e-cap",
      sessionId,
      seq: 0,
      type: "active_capabilities",
      payload: "{}",
      createdAt: now,
    })
    service.insertEntry({
      externalId: "e-msg",
      sessionId,
      seq: 1,
      type: "message",
      payload: "{}",
      createdAt: now,
    })

    const messages = service.listMessageEntries(sessionId)
    expect(messages.map((entry) => entry.external_id)).toEqual(["e-msg"])
  })

  it("deleteCallsByEntryIds / deleteEntries 批量删除，空列表跳过", () => {
    const sessionId = randomUUID()
    const now = new Date().toISOString()
    service.transaction(() => {
      service.insertSession({
        externalId: sessionId,
        projectItemId: null,
        projectId: null,
        page: "/",
        title: "t",
        cwd: "/",
        createdAt: now,
        updatedAt: now,
      })
      service.insertEntry({
        externalId: "e1",
        sessionId,
        seq: 0,
        type: "message",
        payload: "{}",
        createdAt: now,
      })
      service.insertEntry({
        externalId: "e2",
        sessionId,
        seq: 1,
        type: "message",
        payload: "{}",
        createdAt: now,
      })
      service.insertCall({
        sessionId,
        externalId: randomUUID(),
        entryId: "e1",
        kind: "builtin",
        name: "read",
        status: "success",
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    })

    service.deleteCallsByEntryIds(["e1"])
    expect(
      database.prepare("SELECT * FROM agent_call WHERE session_id = ?").all(sessionId),
    ).toHaveLength(0)

    service.deleteEntries(["e1", "e2"])
    expect(service.listEntries(sessionId)).toHaveLength(0)
  })

  it("deleteSession 显式顺序级联删除调用、entries 与会话", () => {
    const sessionId = randomUUID()
    const now = new Date().toISOString()
    service.transaction(() => {
      service.insertSession({
        externalId: sessionId,
        projectItemId: null,
        projectId: null,
        page: "/",
        title: "t",
        cwd: "/",
        createdAt: now,
        updatedAt: now,
      })
      service.insertEntry({
        externalId: "e1",
        sessionId,
        seq: 0,
        type: "message",
        payload: "{}",
        createdAt: now,
      })
      service.insertCall({
        sessionId,
        externalId: randomUUID(),
        entryId: "e1",
        kind: "builtin",
        name: "read",
        status: "success",
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    })

    service.deleteSession(sessionId)
    expect(service.getSession(sessionId)).toBeUndefined()
    expect(service.listEntries(sessionId)).toEqual([])
    expect(
      database.prepare("SELECT * FROM agent_call WHERE session_id = ?").all(sessionId),
    ).toEqual([])
  })
})

import { randomUUID } from "node:crypto"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runMigrations } from "@/db"
import { createAgentSessionService, getForkedTitle } from "@/services/agentSessionService"

let database: Database.Database
let service: ReturnType<typeof createAgentSessionService>

beforeEach(() => {
  database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  runMigrations(database)
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
      "INSERT INTO project_item (external_id, project_id, name, item_data, enabled_folder_paths, status, created_at, updated_at) VALUES ('item1', 'p1', 'item', '', '[]', 'todo', ?, ?)",
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

  it("listSessions 全量拉取并按 updated_at 倒序，携带 projectId", () => {
    insertSession("s1", "/", "2026-01-01T00:00:00.000Z")
    insertSession("s2", "/", "2026-01-02T00:00:00.000Z")
    insertSession("s3", null, "2026-01-03T00:00:00.000Z")

    const sessions = service.listSessions()
    expect(sessions.map((session) => session.id)).toEqual(["s3", "s2", "s1"])
    // 页面会话 projectId 为 null；item 会话为所属项目。
    expect(sessions[0].projectId).toBe("p1")
    expect(sessions[1].projectId).toBeNull()
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
    expect(service.listSessions()).toEqual([])
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

  it("getForkedTitle 递增 (fork #N) 后缀", () => {
    expect(getForkedTitle("普通会话")).toBe("普通会话 (fork #1)")
    expect(getForkedTitle("普通会话 (fork #1)")).toBe("普通会话 (fork #2)")
    expect(getForkedTitle("会话 (fork #7)")).toBe("会话 (fork #8)")
  })

  it("forkSession 从用户轮切割复制：seq < 切割点、保持 seq、重写 id、不复制调用", () => {
    const sourceId = randomUUID()
    const now = new Date().toISOString()
    service.transaction(() => {
      service.insertSession({
        externalId: sourceId,
        projectItemId: null,
        projectId: null,
        page: "/",
        title: "源会话",
        cwd: "/proj",
        createdAt: now,
        updatedAt: now,
      })
      let seq = service.nextSeq(sourceId)
      service.insertEntry({
        externalId: "cap-1",
        sessionId: sourceId,
        seq: seq++,
        type: "active_capabilities",
        payload: '{"tools":["read"]}',
        createdAt: now,
      })
      service.insertEntry({
        externalId: "u1",
        sessionId: sourceId,
        seq: seq++,
        type: "message",
        payload: JSON.stringify({ role: "user", content: "q1", timestamp: 100 }),
        createdAt: now,
      })
      service.insertEntry({
        externalId: "a1",
        sessionId: sourceId,
        seq: seq++,
        type: "message",
        payload: JSON.stringify({
          role: "assistant",
          content: [],
          provider: "p",
          model: "m",
          usage: { input: 0, output: 0, totalTokens: 0 },
          stopReason: "stop",
          timestamp: 101,
        }),
        createdAt: now,
      })
      service.insertEntry({
        externalId: "u2",
        sessionId: sourceId,
        seq: seq++,
        type: "message",
        payload: JSON.stringify({ role: "user", content: "q2", timestamp: 200 }),
        createdAt: now,
      })
      service.insertCall({
        sessionId: sourceId,
        externalId: randomUUID(),
        entryId: "u2",
        kind: "builtin",
        name: "read",
        status: "success",
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    })

    const result = service.forkSession(sourceId, 3) // q2（seq=3）为切割点，不包含该轮
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const forkId = result.session.id

    expect(result.session.title).toBe("源会话 (fork #1)")
    expect(result.session.cwd).toBe("/proj")
    // 源会话原样保留。
    expect(service.listEntries(sourceId)).toHaveLength(4)
    // 新会话仅包含切割点之前的 3 条 entry，seq 原样、external_id 全部重写。
    const forkEntries = service.listEntries(forkId)
    expect(forkEntries.map((entry) => entry.seq)).toEqual([0, 1, 2])
    expect(forkEntries.map((entry) => entry.type)).toEqual([
      "active_capabilities",
      "message",
      "message",
    ])
    expect(forkEntries.map((entry) => entry.external_id)).not.toContain("cap-1")
    expect(forkEntries.map((entry) => entry.external_id)).not.toContain("u2")
    expect(forkEntries[2]?.payload).toContain('"timestamp":101')
    // agent_call 不复制（renderer 展示依赖 entry payload）。
    expect(
      database.prepare("SELECT * FROM agent_call WHERE session_id = ?").all(forkId),
    ).toHaveLength(0)
    // 新会话下一条 seq = 切割点 seq（继续从该轮编号）。
    expect(service.nextSeq(forkId)).toBe(3)
  })

  it("forkSession 继承切割点轮（含）之前的快照", () => {
    const sourceId = randomUUID()
    const now = new Date().toISOString()
    service.insertSession({
      externalId: sourceId,
      projectItemId: null,
      projectId: null,
      page: "/",
      title: "源会话",
      cwd: "/proj",
      createdAt: now,
      updatedAt: now,
    })
    service.insertEntry({
      externalId: "u1",
      sessionId: sourceId,
      seq: 0,
      type: "message",
      payload: JSON.stringify({ role: "user", content: "q1", timestamp: 100 }),
      createdAt: now,
    })
    service.insertEntry({
      externalId: "u2",
      sessionId: sourceId,
      seq: 1,
      type: "message",
      payload: JSON.stringify({ role: "user", content: "q2", timestamp: 200 }),
      createdAt: now,
    })
    service.insertEntry({
      externalId: "u3",
      sessionId: sourceId,
      seq: 2,
      type: "message",
      payload: JSON.stringify({ role: "user", content: "q3", timestamp: 300 }),
      createdAt: now,
    })
    service.insertSnapshot({
      externalId: "s1",
      sessionId: sourceId,
      userMessageTimestamp: 100,
      hashStart: "a",
      hashEnd: "b",
      filesChanged: "[]",
      createdAt: now,
    })
    service.insertSnapshot({
      externalId: "s2",
      sessionId: sourceId,
      userMessageTimestamp: 200,
      hashStart: "b",
      hashEnd: "c",
      filesChanged: "[]",
      createdAt: now,
    })
    service.insertSnapshot({
      externalId: "s3",
      sessionId: sourceId,
      userMessageTimestamp: 300,
      hashStart: "c",
      hashEnd: "d",
      filesChanged: "[]",
      createdAt: now,
    })

    // 切割点在 q2（seq=1，timestamp=200）：继承 timestamp <= 200 的两个快照。
    const result = service.forkSession(sourceId, 1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const rows = database
      .prepare(
        "SELECT user_message_timestamp FROM agent_snapshot WHERE session_id = ? ORDER BY user_message_timestamp",
      )
      .all(result.session.id) as Array<{ user_message_timestamp: number }>
    expect(rows.map((row) => row.user_message_timestamp)).toEqual([100, 200])
  })

  it("forkSession 无 forkSeq = 整会话复制（全部 entries + 全部快照）", () => {
    const sourceId = randomUUID()
    const now = new Date().toISOString()
    service.insertSession({
      externalId: sourceId,
      projectItemId: null,
      projectId: null,
      page: "/",
      title: "源会话",
      cwd: "/proj",
      createdAt: now,
      updatedAt: now,
    })
    service.insertEntry({
      externalId: "u1",
      sessionId: sourceId,
      seq: 0,
      type: "message",
      payload: JSON.stringify({ role: "user", content: "q1", timestamp: 100 }),
      createdAt: now,
    })
    service.insertSnapshot({
      externalId: "s1",
      sessionId: sourceId,
      userMessageTimestamp: 100,
      hashStart: "a",
      hashEnd: "b",
      filesChanged: "[]",
      createdAt: now,
    })

    const result = service.forkSession(sourceId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(service.listEntries(result.session.id)).toHaveLength(1)
    expect(
      database.prepare("SELECT * FROM agent_snapshot WHERE session_id = ?").all(result.session.id),
    ).toHaveLength(1)
  })

  it("forkSession 拒绝非用户消息轮 / 不存在的切割点", () => {
    const sourceId = randomUUID()
    const now = new Date().toISOString()
    service.insertSession({
      externalId: sourceId,
      projectItemId: null,
      projectId: null,
      page: "/",
      title: "t",
      cwd: "/",
      createdAt: now,
      updatedAt: now,
    })
    service.insertEntry({
      externalId: "a1",
      sessionId: sourceId,
      seq: 0,
      type: "message",
      payload: JSON.stringify({
        role: "assistant",
        content: [],
        provider: "p",
        model: "m",
        usage: { input: 0, output: 0, totalTokens: 0 },
        stopReason: "stop",
        timestamp: 1,
      }),
      createdAt: now,
    })
    service.insertEntry({
      externalId: "cap-1",
      sessionId: sourceId,
      seq: 1,
      type: "active_capabilities",
      payload: "{}",
      createdAt: now,
    })

    expect(service.forkSession(sourceId, 0).ok).toBe(false) // assistant 轮
    expect(service.forkSession(sourceId, 1).ok).toBe(false) // 非 message entry
    expect(service.forkSession(sourceId, 99).ok).toBe(false) // 不存在
    expect(service.forkSession(randomUUID()).ok).toBe(false) // 会话不存在
  })

  it("forkSession 复制异常整体回滚（同一事务）", () => {
    const sourceId = randomUUID()
    const now = new Date().toISOString()
    service.insertSession({
      externalId: sourceId,
      projectItemId: null,
      projectId: null,
      page: "/",
      title: "t",
      cwd: "/",
      createdAt: now,
      updatedAt: now,
    })
    service.insertEntry({
      externalId: "cap-1",
      sessionId: sourceId,
      seq: 0,
      type: "active_capabilities",
      payload: "{}",
      createdAt: now,
    })
    // 切割点：seq=1 的 user 轮。
    service.insertEntry({
      externalId: "u1",
      sessionId: sourceId,
      seq: 1,
      type: "message",
      payload: JSON.stringify({ role: "user", content: "q1", timestamp: 100 }),
      createdAt: now,
    })
    // 复制范围内（seq<1）的 cap-1 的 parent_id 指向不存在的 entry → 复制时 FK 冲突触发回滚。
    // 先关 FK 播种悬空引用，再恢复（UPDATE 本身也会被 FK 拦）。
    database.pragma("foreign_keys = OFF")
    database
      .prepare(
        "UPDATE agent_session_entry SET parent_id = 'no-such-entry' WHERE external_id = 'cap-1'",
      )
      .run()
    database.pragma("foreign_keys = ON")

    const before = service.listSessions().length
    const result = service.forkSession(sourceId, 1)
    expect(result.ok).toBe(false)
    // 回滚：新会话行不应残留。
    expect(service.listSessions().length).toBe(before)
  })
})

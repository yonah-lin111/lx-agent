import { randomUUID } from "node:crypto"
import type { AgentMessage, HookContextMessage } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 内存 DB 注入 agentSessionService 单例（TurnStore 落库/恢复路径隔离真实用户库）。
const holder = vi.hoisted(() => ({ db: null as import("better-sqlite3").Database | null }))

vi.mock("@/services/agentSessionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/agentSessionService")>()
  const DatabaseCtor = (await import("better-sqlite3")).default
  const { runMigrations } = await import("@/db")
  return {
    ...actual,
    agentSessionService: actual.createAgentSessionService(() => {
      if (!holder.db) {
        const db = new DatabaseCtor(":memory:")
        db.pragma("foreign_keys = ON")
        runMigrations(db)
        holder.db = db
      }
      return holder.db
    }),
  }
})

import { TurnStore } from "@/agent/turnStore"
import { agentSessionService, createExternalId } from "@/services/agentSessionService"

// HookContextMessage 必须属于 AgentMessage 联合（编译期校验）。
const hookMessage: HookContextMessage = {
  role: "hookContext",
  event: "PreToolUse",
  hookName: "block-rm-rf",
  status: "blocked",
  text: "rm -rf is forbidden",
  durationMs: 12,
  timestamp: 123456,
}
const unionMessage: AgentMessage = hookMessage

const createSession = (): string => {
  const sessionId = randomUUID()
  const now = new Date().toISOString()
  agentSessionService.insertSession({
    externalId: sessionId,
    projectId: null,
    page: "/",
    title: "hooks",
    cwd: "/tmp",
    createdAt: now,
    updatedAt: now,
  })
  return sessionId
}

const createTurnStore = (sessionId: string): TurnStore =>
  new TurnStore({
    setSessionId: () => {},
    getCurrentSessionId: () => sessionId,
    setSessionBinding: () => {},
    getCwd: () => "/tmp",
    emit: () => {},
    emitUsage: () => {},
  })

describe("HookContextMessage 落库兼容", () => {
  beforeEach(() => {
    holder.db?.close()
    holder.db = null
  })

  afterEach(() => {
    holder.db?.close()
    holder.db = null
  })

  it("作为 message entry 落库后恢复不丢消息、seq 对齐", () => {
    const sessionId = createSession()
    const now = new Date().toISOString()
    agentSessionService.insertEntry({
      externalId: createExternalId(),
      sessionId,
      seq: 0,
      type: "message",
      payload: JSON.stringify(unionMessage),
      createdAt: now,
    })

    const store = createTurnStore(sessionId)
    const { messages, seqs } = store.readSessionEntries(sessionId)
    expect(messages).toEqual([hookMessage])
    expect(seqs).toEqual([0])

    const synced = store.syncMessageSeqs(messages)
    expect(synced).toEqual([0])
  })

  it("损坏 payload 不阻断恢复", () => {
    const sessionId = createSession()
    const now = new Date().toISOString()
    agentSessionService.insertEntry({
      externalId: createExternalId(),
      sessionId,
      seq: 0,
      type: "message",
      payload: "{ broken",
      createdAt: now,
    })
    agentSessionService.insertEntry({
      externalId: createExternalId(),
      sessionId,
      seq: 1,
      type: "message",
      payload: JSON.stringify(unionMessage),
      createdAt: now,
    })

    const store = createTurnStore(sessionId)
    const { messages } = store.readSessionEntries(sessionId)
    expect(messages).toEqual([hookMessage])
  })
})

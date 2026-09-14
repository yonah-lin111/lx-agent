import { randomUUID } from "node:crypto"
import type {
  AgentCapabilitySnapshot,
  AssistantMessage,
  UserMessage,
} from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 内存 DB 注入 agentSessionService 单例（TurnStore 落库路径隔离真实用户库）。
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

import { type BeginTurnInput, TurnStore } from "@/agent/turnStore"
import { agentSessionService } from "@/services/agentSessionService"

// 测试用能力快照。
const capabilities: AgentCapabilitySnapshot = { tools: [], mcp: [], skills: [] }

// beginTurn 输入（会话已存在，binding/cwd 仅占位）。
const beginInput: BeginTurnInput = { text: "hello", binding: {}, cwd: "/tmp", capabilities }

// 正常助手消息。
const assistantMessage = (): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text: "ok" }],
  provider: "test",
  model: "test-model",
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
  stopReason: "stop",
  timestamp: Date.now(),
})

// 上下文溢出失败消息（isOverflowFailure 判定用）。
const overflowMessage = (): AssistantMessage => ({
  ...assistantMessage(),
  stopReason: "error",
  errorMessage: "context_length_exceeded",
})

// 建一条会话行（TurnStore 落库前置）。
const createSession = (): string => {
  const sessionId = randomUUID()
  const now = new Date().toISOString()
  agentSessionService.insertSession({
    externalId: sessionId,
    projectId: null,
    page: "/",
    title: "turn-store",
    cwd: "/tmp",
    createdAt: now,
    updatedAt: now,
  })
  return sessionId
}

// 构造绑定固定会话的 TurnStore。
const createTurnStore = (sessionId: string): TurnStore =>
  new TurnStore({
    setSessionId: () => {},
    getCurrentSessionId: () => sessionId,
    setSessionBinding: () => {},
    getCwd: () => "/tmp",
    emit: () => {},
    emitUsage: () => {},
  })

describe("TurnStore 跨轮 pending 状态与 seq 对齐", () => {
  beforeEach(() => {
    holder.db?.close()
    holder.db = null
  })

  afterEach(() => {
    holder.db?.close()
    holder.db = null
    vi.restoreAllMocks()
  })

  it("discardTurn 丢弃的 todo 不会在下一轮 flush 落库", () => {
    const sessionId = createSession()
    const store = createTurnStore(sessionId)

    store.beginTurn(beginInput)
    store.setTodo([{ content: "stale", status: "pending" }])
    store.discardTurn()

    store.beginTurn(beginInput)
    store.handleEvent({ type: "message_end", message: assistantMessage() })
    store.flushTurn()

    expect(store.readLastTodoEntry(sessionId)).toEqual([])
    expect(agentSessionService.listEntries(sessionId).some((entry) => entry.type === "todo")).toBe(
      false,
    )
  })

  it("未丢弃轮次的 todo 正常落库", () => {
    const sessionId = createSession()
    const store = createTurnStore(sessionId)

    store.beginTurn(beginInput)
    store.setTodo([{ content: "kept", status: "pending" }])
    store.handleEvent({ type: "message_end", message: assistantMessage() })
    store.flushTurn()

    expect(store.readLastTodoEntry(sessionId)).toEqual([{ content: "kept", status: "pending" }])
  })

  it("discardTurn 丢弃的附件不会挂到下一轮用户消息", () => {
    const sessionId = createSession()
    const store = createTurnStore(sessionId)

    store.beginTurn(beginInput)
    store.setCopiedFiles([{ name: "a.png", path: "/tmp/a.png", type: "image" }])
    store.discardTurn()

    store.beginTurn(beginInput)
    const userMessage: UserMessage = { role: "user", content: "hi", timestamp: Date.now() }
    store.handleEvent({ type: "message_end", message: userMessage })
    store.flushTurn()

    const [entry] = agentSessionService.listMessageEntries(sessionId)
    expect((JSON.parse(entry.payload) as UserMessage).files).toBeUndefined()
  })

  it("discardTurn 清除 overflow 标记", () => {
    const store = createTurnStore(createSession())

    store.beginTurn(beginInput)
    store.handleEvent({ type: "message_end", message: overflowMessage() })
    expect(store.consumeOverflow()).toBe(true)

    store.handleEvent({ type: "message_end", message: overflowMessage() })
    store.discardTurn()
    expect(store.consumeOverflow()).toBe(false)
  })

  it("flushTurn 事务失败时 messageSeqs 不增长", () => {
    const sessionId = createSession()
    const store = createTurnStore(sessionId)

    store.beginTurn(beginInput)
    store.handleEvent({ type: "message_end", message: assistantMessage() })
    const before = [...store.getMessageSeqs()]

    const transactionSpy = vi.spyOn(agentSessionService, "transaction").mockImplementation(() => {
      throw new Error("transaction failed")
    })
    expect(() => store.flushTurn()).toThrow("transaction failed")
    expect(store.getMessageSeqs()).toEqual(before)

    transactionSpy.mockRestore()
  })

  it("flushTurn 成功后按提交结果追加 messageSeqs", () => {
    const sessionId = createSession()
    const store = createTurnStore(sessionId)

    store.beginTurn(beginInput)
    store.handleEvent({ type: "message_end", message: assistantMessage() })
    store.flushTurn()

    expect(store.getMessageSeqs()).toEqual([0])
    expect(store.readSessionEntries(sessionId).seqs).toEqual([0])
  })

  it("新建会话：预建事务回滚不产生幽灵 seq，提交后才由调用方追加", () => {
    let currentSessionId: string | null = null
    const store = new TurnStore({
      setSessionId: (id: string | null) => {
        currentSessionId = id
      },
      getCurrentSessionId: () => currentSessionId,
      setSessionBinding: () => {},
      getCwd: () => "/tmp",
      emit: () => {},
      emitUsage: () => {},
    })
    const createInput = {
      binding: {},
      cwd: "/tmp",
      title: "draft",
      capabilities,
      modelSelection: { provider: "p", model: "m" },
    }

    // 回滚路径：createSessionIfNeeded 不再写内存 seq。
    expect(() =>
      agentSessionService.transaction(() => {
        store.createSessionIfNeeded(createInput, new Date().toISOString())
        throw new Error("boom")
      }),
    ).toThrow("boom")
    expect(store.getMessageSeqs()).toEqual([])

    // 提交路径：返回值携带 initialModelSeq，由调用方在事务提交后追加。
    currentSessionId = null
    let created: { sessionId: string; initialModelSeq?: number } | undefined
    agentSessionService.transaction(() => {
      created = store.createSessionIfNeeded(createInput, new Date().toISOString())
    })
    expect(store.getMessageSeqs()).toEqual([])
    expect(created?.initialModelSeq).toBeTypeOf("number")
    store.appendMessageSeq(created!.initialModelSeq!)
    expect(store.getMessageSeqs()).toEqual([created!.initialModelSeq])
  })
})

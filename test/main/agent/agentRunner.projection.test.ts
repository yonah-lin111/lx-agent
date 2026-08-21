import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AssistantMessage } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as AssistantMessage[],
}))

vi.mock("ai", () => ({ streamText: vi.fn() }))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getConfigPath: () => holder.configPath,
    getAppDataRoot: () => holder.appDataRoot,
  }
})

vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: () => ({
    providers: {
      p: {
        id: "p",
        type: "openai-compatible",
        name: "p",
        options: { apiKey: "x", baseURL: "http://localhost" },
        models: { m: { id: "m", name: "m" } },
      },
    },
    enabledProviders: ["p"],
    defaultModel: { provider: "p", model: "m" },
    titleSummary: { provider: "p", model: "m" },
    suggestedQuestions: { provider: "p", model: "m" },
    suggestedQuestionsEnabled: true,
  }),
  getPermissionSettings: () => ({
    defaultMode: "default",
    allow: [],
    deny: [],
    ask: [],
  }),
  getCompactionSettings: () => ({
    enabled: false,
    contextWindow: 128000,
    keepRecentTokens: 20000,
    reserveTokens: 16384,
  }),
}))

vi.mock("@/services/projectService", () => ({
  projectService: { listProjects: () => [] },
}))

vi.mock("@/services/agentSessionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/agentSessionService")>()
  const Database = (await import("better-sqlite3")).default
  const { runMigrations } = await import("@/db")
  return {
    ...actual,
    agentSessionService: actual.createAgentSessionService(() => {
      if (!holder.db) {
        const db = new Database(":memory:")
        db.pragma("foreign_keys = ON")
        runMigrations(db)
        holder.db = db
      }
      return holder.db
    }),
  }
})

vi.mock("@/agent/stream/aiSdkStreamFn", async () => {
  const { createAssistantMessageEventStream } = await import("@/agent/core/event-stream")
  return {
    createAiSdkStreamFn: () => async () => {
      const response = holder.streamResponses.shift() ?? {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "hello response" }],
        provider: "p",
        model: "m",
        usage: { input: 1, output: 1, cacheRead: 0, totalTokens: 2 },
        stopReason: "stop" as const,
        timestamp: Date.now(),
      }
      const stream = createAssistantMessageEventStream()
      queueMicrotask(() => {
        stream.push({ type: "start", partial: response })
        stream.push({
          type: "text_start",
          contentIndex: 0,
          content: "hello response",
          partial: response,
        })
        stream.push({
          type: "done",
          reason: "stop",
          message: response,
        })
        stream.end()
      })
      return stream
    },
  }
})

describe("AgentRunner 会话事件投影端到端生效验证 (SessionProjection)", () => {
  let projectDir: string

  beforeEach(() => {
    vi.resetModules()
    const root = mkdtempSync(join(tmpdir(), "lx-proj-runner-"))
    holder.configPath = join(root, "config.json")
    holder.appDataRoot = root
    projectDir = mkdtempSync(join(tmpdir(), "lx-project-proj-"))
    holder.streamResponses = []
  })

  afterEach(() => {
    if (holder.db) {
      holder.db.close()
      holder.db = null
    }
    rmSync(holder.appDataRoot, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  it("发送消息后，getSessionProjection() 返回准确投影的消息与会话状态", async () => {
    const { agentRunner } = await import("@/agent/agentRunner")

    const res = await agentRunner.send("First message", undefined, {
      page: "/main",
      cwd: projectDir,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const projection = agentRunner.getSessionProjection()
    expect(projection.sessionId).toBe(res.sessionId)
    expect(projection.isStreaming).toBe(false)
    expect(projection.messages.length).toBeGreaterThanOrEqual(2)
    expect(projection.messages[0]!.role).toBe("user")
    expect(projection.messages[1]!.role).toBe("assistant")
  })

  it("历史会话恢复：restoreSession 自动重置并同步当前会话投影快照", async () => {
    const { agentRunner } = await import("@/agent/agentRunner")

    const res1 = await agentRunner.send("Session 1 Msg", undefined, {
      page: "/main",
      cwd: projectDir,
    })
    expect(res1.ok).toBe(true)
    if (!res1.ok) return
    const session1Id = res1.sessionId

    // 脱离当前会话，新建会话发送另一条
    agentRunner.restoreMessages([])
    const res2 = await agentRunner.send("Session 2 Msg", undefined, {
      page: "/other",
      cwd: projectDir,
    })
    expect(res2.ok).toBe(true)
    if (!res2.ok) return
    const session2Id = res2.sessionId
    expect(session2Id).not.toBe(session1Id)

    // 恢复 session1
    const restored = await agentRunner.restoreSession(session1Id)
    expect(restored.messages).toBeDefined()

    // 验证投影快照与 restored 状态完全对齐
    const projection = agentRunner.getSessionProjection()
    expect(projection.sessionId).toBe(session1Id)
    expect(projection.messages.length).toBe(restored.messages.length)
    expect(projection.todos).toEqual(restored.todos)
  })
})

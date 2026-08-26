import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AssistantMessage, StopReason, Usage } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 共享状态：临时 config/appData、内存 DB、脚本化 stream 响应与权限门控 mock。
const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as AssistantMessage[],
  gate: null as
    | ((
        ctx: unknown,
        sessionId: string | null,
        signal?: AbortSignal,
      ) =>
        | Promise<{ block?: boolean; reason?: string } | undefined>
        | { block?: boolean; reason?: string }
        | undefined)
    | null,
  gateCalls: [] as Array<{ sessionId: string | null }>,
  clearedSessions: [] as string[],
  loadCalls: 0,
  mcpTools: [] as string[],
}))

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
  // 压缩配置（默认值；测试上下文小，阈值不会触发）。
  getCompactionSettings: () => ({
    enabled: true,
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

// 脚本化的 mock streamFn。
vi.mock("@/agent/stream/aiSdkStreamFn", async () => {
  const { createAssistantMessageEventStream } = await import("@/agent/core/event-stream")
  return {
    createAiSdkStreamFn: () => async () => {
      const response = holder.streamResponses.shift()
      if (!response) {
        throw new Error("No more mock responses")
      }
      const stream = createAssistantMessageEventStream()
      stream.push({ type: "start", partial: response })
      stream.push({ type: "done", reason: response.stopReason, message: response })
      stream.end()
      return stream
    },
  }
})

// 权限门控 mock：记录调用与会话归属，可脚本化放行/拒绝。
vi.mock("@/agent/permissions/permissionManager", () => ({
  permissionManager: {
    load: vi.fn(() => {
      holder.loadCalls += 1
    }),
    setMcpTools: vi.fn((names: string[]) => {
      holder.mcpTools = names
    }),
    gate: vi.fn((ctx: unknown, sessionId: string | null, signal?: AbortSignal) => {
      holder.gateCalls.push({ sessionId })
      return holder.gate ? holder.gate(ctx, sessionId, signal) : undefined
    }),
    clearSession: vi.fn((sessionId: string) => {
      holder.clearedSessions.push(sessionId)
    }),
  },
}))

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, totalTokens: 0 }

const assistant = (
  blocks: AssistantMessage["content"],
  stopReason: StopReason = "stop",
): AssistantMessage => ({
  role: "assistant",
  content: blocks,
  provider: "test",
  model: "test-model",
  usage: EMPTY_USAGE,
  stopReason,
  timestamp: 0,
})

const toolCallBlock = (id: string, name: string, args: Record<string, unknown>) => ({
  type: "toolCall" as const,
  id,
  name,
  arguments: args,
})

let tmpDir: string

describe("agentRunner 权限接线", () => {
  beforeEach(async () => {
    vi.resetModules()
    tmpDir = mkdtempSync(join(tmpdir(), "lx-runner-permission-"))
    holder.configPath = join(tmpDir, "config.json")
    holder.appDataRoot = join(tmpDir, "appdata")
    holder.db = null
    holder.streamResponses = []
    holder.gate = null
    holder.gateCalls = []
    holder.clearedSessions = []
    holder.loadCalls = 0
    holder.mcpTools = []
  })

  afterEach(() => {
    holder.db?.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  const importRunner = (): Promise<typeof import("@/agent/agentRunner")> =>
    import("@/agent/agentRunner")

  it("send 时装配刷新权限配置并注入门控集", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "你好" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    expect(holder.loadCalls).toBeGreaterThan(0)
    expect(Array.isArray(holder.mcpTools)).toBe(true)
  })

  it("beforeToolCall 将当前会话 id 传入 gate；允许后工具执行成功", async () => {
    const { agentRunner } = await importRunner()
    holder.gate = () => undefined
    holder.streamResponses = [
      assistant([toolCallBlock("tc1", "bash", { command: "echo hi" })], "toolUse"),
      assistant([{ type: "text", text: "完成" }]),
    ]
    const result = await agentRunner.send("执行", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // gate 收到当前会话 id（createSessionIfNeeded 先于 prompt 建立会话）。
    expect(holder.gateCalls).toHaveLength(1)
    expect(holder.gateCalls[0].sessionId).toBe(result.sessionId)

    const row = holder
      .db!.prepare("SELECT status FROM agent_call WHERE session_id = ?")
      .get(result.sessionId) as { status: string }
    expect(row.status).toBe("success")
  })

  it("gate 拒绝 → error toolResult 回灌模型并落库为 error", async () => {
    const { agentRunner } = await importRunner()
    holder.gate = () => ({ block: true, reason: "用户已拒绝该操作" })
    holder.streamResponses = [
      assistant([toolCallBlock("tc1", "bash", { command: "rm -rf x" })], "toolUse"),
      assistant([{ type: "text", text: "已拒绝该操作。" }]),
    ]
    const result = await agentRunner.send("执行", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const row = holder
      .db!.prepare("SELECT status, result FROM agent_call WHERE session_id = ?")
      .get(result.sessionId) as { status: string; result: string }
    expect(row.status).toBe("error")
    const parsed = JSON.parse(row.result) as { content: Array<{ text: string }> }
    expect(parsed.content[0].text).toContain("用户已拒绝该操作")
  })

  it("会话切换（新建对话）清理旧会话权限内存态", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "你好" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    agentRunner.restoreMessages([])
    expect(holder.clearedSessions).toContain(result.sessionId)
  })

  it("forkSession：切割点在已压缩区域拒绝，边界之外放行", async () => {
    const { agentRunner } = await importRunner()
    const { agentSessionService } = await import("@/services/agentSessionService")
    const sessionId = "s-fork-compaction"
    const now = new Date().toISOString()
    agentSessionService.insertSession({
      externalId: sessionId,
      projectId: null,
      page: "/",
      title: "源会话",
      cwd: "/tmp",
      createdAt: now,
      updatedAt: now,
    })
    agentSessionService.insertEntry({
      externalId: "cap-1",
      sessionId,
      seq: 0,
      type: "active_capabilities",
      payload: "{}",
      createdAt: now,
    })
    agentSessionService.insertEntry({
      externalId: "u1",
      sessionId,
      seq: 1,
      type: "message",
      payload: JSON.stringify({ role: "user", content: "q1", timestamp: 100 }),
      createdAt: now,
    })
    // 压缩边界：firstKeptSeq=2 → seq<2 的轮位于已压缩区域。
    agentSessionService.insertEntry({
      externalId: "comp-1",
      sessionId,
      seq: 2,
      type: "compaction",
      payload: JSON.stringify({ summary: "s", firstKeptSeq: 2, tokensBefore: 10 }),
      createdAt: now,
    })
    agentSessionService.insertEntry({
      externalId: "u2",
      sessionId,
      seq: 3,
      type: "message",
      payload: JSON.stringify({ role: "user", content: "q2", timestamp: 200 }),
      createdAt: now,
    })

    // 切割点 u1（seq=1 < firstKeptSeq=2）位于压缩区：拒绝并给出明确原因。
    const rejected = agentRunner.forkSession(sessionId, 100)
    expect(rejected.ok).toBe(false)
    if (rejected.ok) return
    expect(rejected.error).toContain("已压缩区域")

    // 切割点 u2（seq=3 >= firstKeptSeq）在边界之外：放行并返回新会话 id。
    const accepted = agentRunner.forkSession(sessionId, 200)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(agentSessionService.getSession(accepted.sessionId)).toBeDefined()
  })
})

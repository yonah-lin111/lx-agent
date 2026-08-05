import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AssistantMessage, StopReason, Usage } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 共享状态：临时 config 路径、内存 DB 句柄与脚本化 stream 响应。
const holder = vi.hoisted(() => ({
  configPath: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as import("@shared/contracts/agent").AssistantMessage[],
}))

// config 读取指向临时文件（隔离真实用户配置）。
vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return { ...actual, getConfigPath: () => holder.configPath }
})

// 模型解析回退到固定 Provider。
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
}))

vi.mock("@/services/projectService", () => ({
  projectService: { listProjects: () => [] },
}))

// agentSessionService 挂到内存 DB（隔离真实用户库）。
vi.mock("@/services/agentSessionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/agentSessionService")>()
  const Database = (await import("better-sqlite3")).default
  const { createAgentTables } = await import("@/db/schema/agentSchema")
  const { createProjectTables } = await import("@/db/schema/projectSchema")
  return {
    ...actual,
    agentSessionService: actual.createAgentSessionService(() => {
      if (!holder.db) {
        const db = new Database(":memory:")
        db.pragma("foreign_keys = ON")
        createProjectTables(db)
        createAgentTables(db)
        holder.db = db
      }
      return holder.db
    }),
  }
})

// 脚本化的 mock streamFn：逐次返回预设助手响应，避免真实 LLM 调用。
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

const EMPTY_USAGE: Usage = { input: 0, output: 0, totalTokens: 0 }

// 构造助手消息。
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

// 构造工具调用块。
const toolCallBlock = (id: string, name: string, args: Record<string, unknown>) => ({
  type: "toolCall" as const,
  id,
  name,
  arguments: args,
})

let tmpDir: string

describe("agentRunner 持久化", () => {
  beforeEach(async () => {
    vi.resetModules()
    tmpDir = mkdtempSync(join(tmpdir(), "lx-agent-runner-"))
    holder.configPath = join(tmpDir, "config.json")
    holder.db = null
    holder.streamResponses = []
  })

  afterEach(() => {
    holder.db?.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  const importRunner = (): Promise<typeof import("@/agent/agentRunner")> =>
    import("@/agent/agentRunner")

  it("首条消息创建会话并写入能力/模型快照与消息 entries", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "你好" }])]

    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const sessions = agentRunner.listSessions({ page: "/" })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ title: "hello", cwd: "/tmp" })

    const entries = holder
      .db!.prepare("SELECT * FROM agent_session_entry WHERE session_id = ? ORDER BY seq ASC")
      .all(result.sessionId) as Array<{ type: string; payload: string }>
    expect(entries.map((entry) => entry.type)).toEqual([
      "active_capabilities",
      "message",
      "message",
    ])
    // 页面会话缺省最小只读集。
    expect(JSON.parse(entries[0].payload)).toEqual({ tools: ["read", "time"], mcp: [], skills: [] })
    const messages = entries.slice(1).map((entry) => JSON.parse(entry.payload))
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"])
  })

  it("同一绑定续接同一会话，不产生重复会话", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "a" }])]
    const first = await agentRunner.send("msg1", undefined, { page: "/", cwd: "/tmp" })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    holder.streamResponses = [assistant([{ type: "text", text: "b" }])]
    const second = await agentRunner.send("msg2", undefined, { page: "/", cwd: "/tmp" })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    expect(second.sessionId).toBe(first.sessionId)
    expect(agentRunner.listSessions({ page: "/" })).toHaveLength(1)
  })

  it("绑定变化时新建会话", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "a" }])]
    const first = await agentRunner.send("msg1", undefined, { page: "/", cwd: "/tmp" })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    holder.streamResponses = [assistant([{ type: "text", text: "b" }])]
    const second = await agentRunner.send("msg2", undefined, { page: "/settings", cwd: "/tmp" })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    expect(second.sessionId).not.toBe(first.sessionId)
    expect(agentRunner.listSessions({ page: "/" })).toHaveLength(1)
    expect(agentRunner.listSessions({ page: "/settings" })).toHaveLength(1)
  })

  it("restoreSession 重建消息与能力快照", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "你好" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const restored = agentRunner.restoreSession(result.sessionId)
    expect(restored.messages.map((message) => message.role)).toEqual(["user", "assistant"])
    expect(restored.activeCapabilities.tools).toEqual(["read", "time"])
  })

  it("工具调用写入 agent_call 并关联触发 entry", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [
      assistant([toolCallBlock("tc1", "time", {})], "toolUse"),
      assistant([{ type: "text", text: "完成" }]),
    ]
    const result = await agentRunner.send("现在几点", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const rows = holder
      .db!.prepare("SELECT * FROM agent_call WHERE session_id = ?")
      .all(result.sessionId) as Array<{
      name: string
      kind: string
      status: string
      entry_id: string | null
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: "time", kind: "builtin", status: "success" })
    expect(rows[0].entry_id).not.toBeNull()
  })

  it("新建对话脱离当前会话但不删除旧会话，也不创建空会话", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "a" }])]
    const result = await agentRunner.send("msg", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    agentRunner.restoreMessages([])
    const sessions = agentRunner.listSessions({ page: "/" })
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(result.sessionId)
  })
})

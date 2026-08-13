import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AssistantMessage, StopReason, Usage } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

// MCP 工具句柄（mock mcpManager.getTools 的返回源；测试内填充）。
const mcpHolder = vi.hoisted(() => ({
  handles: [] as Array<{ server: string; fullName: string }>,
}))

const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as AssistantMessage[],
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
  // task 委托与 mcp 工具进门控集：显式 allow，避免测试挂起权限弹窗。
  getPermissionSettings: () => ({
    defaultMode: "default",
    allow: ["Task()", "Fs_read()"],
    deny: [],
    ask: [],
  }),
  getCompactionSettings: () => ({
    enabled: false,
    contextWindow: 0,
    keepRecentTokens: 0,
    reserveTokens: 0,
  }),
}))

vi.mock("@/services/projectService", () => ({
  projectService: { listProjects: () => [] },
}))

// skill 注入：固定一个可用 skill（驱动 withReadSkill=true，注册 read_skill）。
vi.mock("@/agent/skills/skillLoader", () => ({
  formatSkillsForPrompt: () => "",
  skillLoader: {
    load: () => [
      {
        name: "test-skill",
        description: "测试 skill",
        filePath: "/tmp/skills/test.md",
        baseDir: "/tmp",
        disableModelInvocation: false,
      },
    ],
    get: () => undefined,
  },
  stripFrontmatter: (text: string) => text,
}))

// MCP manager mock：getTools 返回测试注入的句柄；wrapMcpTool 返回固定的 mcp 工具。
vi.mock("@/agent/mcp/mcpManager", () => ({
  mcpManager: {
    ensureConnected: async () => {},
    getTools: () =>
      mcpHolder.handles.map((handle) => ({
        server: handle.server,
        def: { name: handle.fullName },
        client: {},
        timeout: 1000,
        fullName: handle.fullName,
      })),
  },
  wrapMcpTool: () => ({
    name: "fs_read",
    label: "read_file",
    description: "mcp mock 工具",
    inputSchema: z.object({}),
    execute: async () => ({ content: [{ type: "text", text: "mcp ok" }] }),
  }),
}))

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

// 脚本化 streamFn：子代理与父共用同一响应队列。
vi.mock("@/agent/stream/aiSdkStreamFn", async () => {
  const { createAssistantMessageEventStream } = await import("@/agent/core/event-stream")
  return {
    createAiSdkStreamFn: () => async () => {
      const response = holder.streamResponses.shift()
      if (!response) throw new Error("No more mock responses")
      const stream = createAssistantMessageEventStream()
      stream.push({ type: "start", partial: response })
      stream.push({ type: "done", reason: response.stopReason, message: response })
      stream.end()
      return stream
    },
  }
})

const EMPTY_USAGE: Usage = { input: 0, output: 0, totalTokens: 0 }

const assistant = (blocks: AssistantMessage["content"], stopReason: StopReason = "stop") => ({
  role: "assistant" as const,
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

describe("agent_call kind 区分与子代理 provenance", () => {
  beforeEach(async () => {
    vi.resetModules()
    tmpDir = mkdtempSync(join(tmpdir(), "lx-runner-kind-"))
    holder.configPath = join(tmpDir, "config.json")
    holder.appDataRoot = join(tmpDir, "appdata")
    holder.db = null
    holder.streamResponses = []
    mcpHolder.handles = []
  })

  afterEach(() => {
    holder.db?.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  const importRunner = (): Promise<typeof import("@/agent/agentRunner")> =>
    import("@/agent/agentRunner")

  // 子代理内部调用落 provenance：parent_call_id 指向父 task 调用行，entry_id 恒 null。
  it("task 委托子代理，子代理内部工具调用落 agent_call 且 parent_call_id 指向父 task 行", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [
      assistant(
        [toolCallBlock("tc-task", "task", { description: "调研", prompt: "调研并总结" })],
        "toolUse",
      ),
      assistant([toolCallBlock("tc-inner", "time", {})], "toolUse"),
      assistant([{ type: "text", text: "子代理完成" }]),
      assistant([{ type: "text", text: "父汇总完成" }]),
    ]
    const result = await agentRunner.send("帮我调研", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const calls = holder
      .db!.prepare(
        "SELECT external_id, name, kind, status, parent_call_id, entry_id FROM agent_call WHERE session_id = ? ORDER BY rowid ASC",
      )
      .all(result.sessionId) as Array<{
      external_id: string
      name: string
      kind: string
      status: string
      parent_call_id: string | null
      entry_id: string | null
    }>

    // 父 task 调用行：kind=subagent，parent=null，关联触发 entry。
    const parent = calls.find((call) => call.name === "task")
    expect(parent).toBeDefined()
    expect(parent).toMatchObject({ kind: "subagent", parent_call_id: null })
    expect(parent!.entry_id).not.toBeNull()

    // 子代理内部 time 调用行：kind=builtin，parent_call_id=父行 external_id，entry_id=null。
    const child = calls.find((call) => call.name === "time")
    expect(child).toBeDefined()
    expect(child).toMatchObject({
      kind: "builtin",
      parent_call_id: parent!.external_id,
      entry_id: null,
      status: "success",
    })
  })

  // MCP 工具 → kind=mcp + mcp_server 反查（工具名 ∈ activeMcp）。
  it("MCP 工具调用落 kind=mcp 且补 mcp_server", async () => {
    mcpHolder.handles = [{ server: "filesystem", fullName: "fs_read" }]
    const { agentRunner } = await importRunner()
    holder.streamResponses = [
      assistant([toolCallBlock("tc-mcp", "fs_read", {})], "toolUse"),
      assistant([{ type: "text", text: "已读取" }]),
    ]
    const result = await agentRunner.send("读文件", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const rows = holder
      .db!.prepare("SELECT name, kind, mcp_server, status FROM agent_call WHERE session_id = ?")
      .all(result.sessionId) as Array<{
      name: string
      kind: string
      mcp_server: string | null
      status: string
    }>
    expect(rows).toEqual([
      { name: "fs_read", kind: "mcp", mcp_server: "filesystem", status: "success" },
    ])
  })

  // read_skill → kind=skill（skill 注入激活 read_skill；未命中返回文本仍成功落库）。
  it("read_skill 调用落 kind=skill", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [
      assistant([toolCallBlock("tc-skill", "read_skill", { name: "test-skill" })], "toolUse"),
      assistant([{ type: "text", text: "已读取 skill" }]),
    ]
    const result = await agentRunner.send("读取 skill", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const rows = holder
      .db!.prepare("SELECT name, kind, mcp_server, status FROM agent_call WHERE session_id = ?")
      .all(result.sessionId) as Array<{
      name: string
      kind: string
      mcp_server: string | null
      status: string
    }>
    expect(rows).toEqual([
      { name: "read_skill", kind: "skill", mcp_server: null, status: "success" },
    ])
  })

  // 普通内置工具 → kind=builtin（回归保护）。
  it("time 调用落 kind=builtin", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [
      assistant([toolCallBlock("tc-time", "time", {})], "toolUse"),
      assistant([{ type: "text", text: "时间" }]),
    ]
    const result = await agentRunner.send("几点", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const rows = holder
      .db!.prepare("SELECT name, kind, mcp_server FROM agent_call WHERE session_id = ?")
      .all(result.sessionId) as Array<{ name: string; kind: string; mcp_server: string | null }>
    expect(rows).toEqual([{ name: "time", kind: "builtin", mcp_server: null }])
  })
})

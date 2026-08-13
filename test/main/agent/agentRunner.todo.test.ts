import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  AgentEvent,
  AssistantMessage,
  StopReason,
  TodoList,
  Usage,
} from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { LlmMessage } from "@/agent/core/types"

// 共享状态：临时路径、内存 DB、脚本化 stream 响应与每次 streamFn 收到的 LLM 上下文。
const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as AssistantMessage[],
  llmMessages: [] as LlmMessage[][],
  sinkEvents: [] as AgentEvent[],
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
  getPermissionSettings: () => ({ defaultMode: "default", allow: [], deny: [], ask: [] }),
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

// 脚本化 streamFn：捕获每次收到的 LLM 上下文（断言 todoState 注入），逐次返回预设响应。
vi.mock("@/agent/stream/aiSdkStreamFn", async () => {
  const { createAssistantMessageEventStream } = await import("@/agent/core/event-stream")
  return {
    createAiSdkStreamFn: () => async (_model: unknown, context: { messages: LlmMessage[] }) => {
      holder.llmMessages.push(context.messages)
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

// 清单整表替换的调用参数。
const TODO_LIST: TodoList = [
  { content: "读取现有配置", status: "completed" },
  { content: "实现 todowrite", status: "in_progress" },
  { content: "补充单测", status: "pending" },
]

let tmpDir: string

describe("agentRunner todo 清单", () => {
  beforeEach(async () => {
    vi.resetModules()
    tmpDir = mkdtempSync(join(tmpdir(), "lx-runner-todo-"))
    holder.configPath = join(tmpDir, "config.json")
    holder.appDataRoot = join(tmpDir, "appdata")
    holder.db = null
    holder.streamResponses = []
    holder.llmMessages = []
    holder.sinkEvents = []
  })

  afterEach(() => {
    holder.db?.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  const importRunner = (): Promise<typeof import("@/agent/agentRunner")> =>
    import("@/agent/agentRunner")

  // 建一个调用过 todowrite 的会话（返回 sessionId）。
  const buildTodoSession = async (): Promise<string> => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [
      assistant([toolCallBlock("tc1", "todowrite", { todos: TODO_LIST })], "toolUse"),
      assistant([{ type: "text", text: "已建立任务清单" }]),
    ]
    const result = await agentRunner.send("把任务拆成步骤", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("buildTodoSession failed")
    return result.sessionId
  }

  it("todowrite 调用落 todo entry（追加型，payload=JSON(TodoList)）并推送 todo_updated 事件", async () => {
    const { agentRunner } = await importRunner()
    agentRunner.attachEventSink((event) => holder.sinkEvents.push(event))
    const sessionId = await buildTodoSession()

    // todo entry 追加在 message entries 之后。
    const rows = holder
      .db!.prepare(
        "SELECT type, payload, seq FROM agent_session_entry WHERE session_id = ? ORDER BY seq ASC",
      )
      .all(sessionId) as Array<{ type: string; payload: string; seq: number }>
    const todoRows = rows.filter((row) => row.type === "todo")
    expect(todoRows).toHaveLength(1)
    expect(todoRows[0]).toMatchObject({ type: "todo" })
    expect(JSON.parse(todoRows[0].payload)).toEqual(TODO_LIST)
    // 在 active_capabilities + user + assistant(toolCall) + toolResult + assistant 之后。
    expect(rows.map((row) => row.type)).toEqual([
      "active_capabilities",
      "message",
      "message",
      "message",
      "message",
      "todo",
    ])

    // todowrite 调用落 agent_call（kind=builtin，未进门控）。
    const calls = holder
      .db!.prepare("SELECT name, kind, status FROM agent_call WHERE session_id = ?")
      .all(sessionId) as Array<{ name: string; kind: string; status: string }>
    expect(calls).toEqual([{ name: "todowrite", kind: "builtin", status: "success" }])

    // todo_updated 事件推送整表清单。
    const updated = holder.sinkEvents.find((event) => event.type === "todo_updated")
    expect(updated).toBeDefined()
    if (updated?.type === "todo_updated") expect(updated.todos).toEqual(TODO_LIST)
  })

  it("restoreSession 返回 todos；后续 send 的 transformContext 注入 [任务清单]", async () => {
    const { agentRunner } = await importRunner()
    const sessionId = await buildTodoSession()
    holder.llmMessages = [] // 清空建会话期间的注入记录。

    const restored = await agentRunner.restoreSession(sessionId)
    expect(restored.todos).toEqual(TODO_LIST)

    // 恢复后继续对话：todoList 非空，首轮 streamFn 的 LLM 上下文即含 [任务清单]。
    holder.streamResponses = [assistant([{ type: "text", text: "继续执行" }])]
    const continued = await agentRunner.send("继续", undefined, { page: "/", cwd: "/tmp" })
    expect(continued.ok).toBe(true)
    if (!continued.ok) return

    const lastContext = holder.llmMessages.at(-1)
    expect(lastContext).toBeDefined()
    expect(
      lastContext?.some(
        (message) =>
          message.role === "user" &&
          typeof message.content === "string" &&
          message.content.includes("[任务清单]") &&
          message.content.includes("#2 [in_progress] 实现 todowrite"),
      ),
    ).toBe(true)
  })

  it("deleteMessageTurn 删除带 todo 的轮后，todo entry 随轮删除且内存清单回退", async () => {
    const { agentRunner } = await importRunner()
    const sessionId = await buildTodoSession()

    // 第二轮：普通消息（不更新 todo）。
    holder.streamResponses = [assistant([{ type: "text", text: "无清单更新" }])]
    const second = await agentRunner.send("再来一轮", undefined, { page: "/", cwd: "/tmp" })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    // 删除第一轮（含 todowrite 调用）：todo entry 被删除区间带走。
    const firstUserTimestamp = (
      holder
        .db!.prepare(
          "SELECT payload FROM agent_session_entry WHERE session_id = ? AND type = 'message' ORDER BY seq ASC",
        )
        .all(sessionId) as Array<{ payload: string }>
    )
      .map((row) => JSON.parse(row.payload) as { role: string; timestamp: number })
      .find((message) => message.role === "user")!.timestamp

    holder.llmMessages = []
    holder.streamResponses = [assistant([{ type: "text", text: "删轮后的新对话" }])]
    agentRunner.deleteMessageTurn(sessionId, firstUserTimestamp)

    // todo entry 已随轮删除。
    const todoRows = holder
      .db!.prepare("SELECT * FROM agent_session_entry WHERE session_id = ? AND type = 'todo'")
      .all(sessionId)
    expect(todoRows).toHaveLength(0)

    // 内存清单已回退（空）：后续 send 不再注入 [任务清单]。
    const third = await agentRunner.send("继续", undefined, { page: "/", cwd: "/tmp" })
    expect(third.ok).toBe(true)
    if (!third.ok) return
    const lastContext = holder.llmMessages.at(-1)
    expect(
      lastContext?.some(
        (message) =>
          message.role === "user" &&
          typeof message.content === "string" &&
          message.content.includes("[任务清单]"),
      ),
    ).toBe(false)
  })

  it("fork 复制 todo entry，分支会话恢复携带同一清单", async () => {
    const { agentRunner } = await importRunner()
    const sessionId = await buildTodoSession()

    const fork = agentRunner.forkSession(sessionId)
    expect(fork.ok).toBe(true)
    if (!fork.ok) return

    const restored = await agentRunner.restoreSession(fork.sessionId)
    expect(restored.todos).toEqual(TODO_LIST)
    // 分支会话 todo entry 独立存在（随 entries 复制）。
    const todoRows = holder
      .db!.prepare("SELECT payload FROM agent_session_entry WHERE session_id = ? AND type = 'todo'")
      .all(fork.sessionId) as Array<{ payload: string }>
    expect(todoRows).toHaveLength(1)
    expect(JSON.parse(todoRows[0].payload)).toEqual(TODO_LIST)
  })

  it("deleteSession 清空 todo 并推送空事件", async () => {
    const { agentRunner } = await importRunner()
    agentRunner.attachEventSink((event) => holder.sinkEvents.push(event))
    const sessionId = await buildTodoSession()

    agentRunner.deleteSession(sessionId)
    expect(agentRunner.listSessions()).toHaveLength(0)
    const cleared = holder.sinkEvents.filter((event) => event.type === "todo_updated").at(-1)
    expect(cleared).toBeDefined()
    if (cleared?.type === "todo_updated") expect(cleared.todos).toEqual([])
  })
})

import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  AgentEvent,
  AssistantMessage,
  StopReason,
  ToolResultMessage,
  Usage,
} from "@shared/contracts/agent"
import { streamText } from "ai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 共享状态：临时 config/appData 路径、内存 DB 句柄与脚本化 stream 响应。
const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as import("@shared/contracts/agent").AssistantMessage[],
  compaction: {
    enabled: true,
    contextWindow: 128000,
    keepRecentTokens: 20000,
    reserveTokens: 16384,
  } as import("@shared/settings").CompactionSettings,
}))

// mock ai.streamText：压缩摘要生成的可控返回（避免真实 LLM 调用）。
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return {
    ...actual,
    streamText: vi.fn(),
  }
})

// config/appData 指向临时目录（隔离真实用户配置与 ~/.lx/skills）。
vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getConfigPath: () => holder.configPath,
    getAppDataRoot: () => holder.appDataRoot,
  }
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
    streamIdleTimeoutMs: 60000,
  }),
  // 权限配置：允许 task 委托与 write（子代理/快照回滚测试不经弹窗）；其余工具走默认门控。
  getPermissionSettings: () => ({
    defaultMode: "default",
    allow: ["Task()", "Write()"],
    deny: [],
    ask: [],
  }),
  // 压缩配置（按用例切换阈值/预算）。
  getCompactionSettings: () => holder.compaction,
}))

vi.mock("@/services/projectService", () => ({
  projectService: { listProjects: () => [] },
}))

// agentSessionService 挂到内存 DB（隔离真实用户库）。
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

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, totalTokens: 0 }

// 构造助手消息。
const assistant = (
  blocks: AssistantMessage["content"],
  stopReason: StopReason = "stop",
  errorMessage?: string,
): AssistantMessage => ({
  role: "assistant",
  content: blocks,
  provider: "test",
  model: "test-model",
  usage: EMPTY_USAGE,
  stopReason,
  timestamp: 0,
  ...(errorMessage ? { errorMessage } : {}),
})

// 构造带 token 用量的助手消息（驱动上下文估计锚点）。
const assistantWithUsage = (
  blocks: AssistantMessage["content"],
  usage: Usage,
  stopReason: StopReason = "stop",
): AssistantMessage => ({ ...assistant(blocks, stopReason), usage })

// 压缩摘要生成的 mock streamText 句柄。
const streamTextMock = vi.mocked(streamText)

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
    holder.appDataRoot = join(tmpDir, "appdata")
    holder.db = null
    holder.streamResponses = []
    holder.compaction = {
      enabled: true,
      contextWindow: 128000,
      keepRecentTokens: 20000,
      reserveTokens: 16384,
    }
    streamTextMock.mockReset()
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

    const sessions = agentRunner.listSessions()
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
    // 全量能力快照（无页面/项目裁剪）。
    expect(JSON.parse(entries[0].payload)).toEqual({
      tools: [
        "read",
        "ls",
        "grep",
        "find",
        "write",
        "edit",
        "apply_patch",
        "bash",
        "time",
        "todowrite",
        "switch_mode",
        "web_search",
        "webfetch",
        "task",
        "question",
        "memory",
        "render_svg",
        "render_ascii",
        "render_html",
        "lsp",
        "job_output",
        "job_list",
        "job_kill",
      ],
      mcp: [],
      skills: [],
    })
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
    expect(agentRunner.listSessions()).toHaveLength(1)
  })

  it("绑定变化不影响会话归属（仍续接原会话）", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "a" }])]
    const first = await agentRunner.send("msg1", undefined, { page: "/", cwd: "/tmp" })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    holder.streamResponses = [assistant([{ type: "text", text: "b" }])]
    const second = await agentRunner.send("msg2", undefined, { page: "/settings", cwd: "/tmp" })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    // 归属冻结：切绑定继续聊 A 会话，不新建。
    expect(second.sessionId).toBe(first.sessionId)
    expect(agentRunner.listSessions()).toHaveLength(1)
  })

  it("restoreSession 重建消息与能力快照", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "你好" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const restored = await agentRunner.restoreSession(result.sessionId)
    expect(restored.messages.map((message) => message.role)).toEqual(["user", "assistant"])
    expect(restored.activeCapabilities.tools).toEqual([
      "read",
      "ls",
      "grep",
      "find",
      "write",
      "edit",
      "apply_patch",
      "bash",
      "time",
      "todowrite",
      "switch_mode",
      "web_search",
      "webfetch",
      "task",
      "question",
      "memory",
      "render_svg",
      "render_ascii",
      "render_html",
      "lsp",
      "job_output",
      "job_list",
      "job_kill",
    ])
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
    const sessions = agentRunner.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(result.sessionId)
  })

  // 读取会话消息 entries 的原始角色序列。
  const readRoles = (sessionId: string): string[] =>
    (
      holder
        .db!.prepare(
          "SELECT payload FROM agent_session_entry WHERE session_id = ? AND type = 'message' ORDER BY seq ASC",
        )
        .all(sessionId) as Array<{ payload: string }>
    ).map((entry) => {
      const message = JSON.parse(entry.payload) as { role: string }
      return message.role
    })

  // 读取会话全部用户消息时间戳。
  const readUserTimestamps = (sessionId: string): number[] =>
    (
      holder
        .db!.prepare(
          "SELECT payload FROM agent_session_entry WHERE session_id = ? AND type = 'message' ORDER BY seq ASC",
        )
        .all(sessionId) as Array<{ payload: string }>
    )
      .map((entry) => JSON.parse(entry.payload) as { role: string; timestamp: number })
      .filter((message) => message.role === "user")
      .map((message) => message.timestamp)

  it("renameSession 重命名会话标题", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "你好" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    agentRunner.renameSession(result.sessionId, "自定义标题")
    expect(agentRunner.listSessions()[0].title).toBe("自定义标题")
  })

  it("deleteSession 级联删除消息与调用", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [
      assistant([toolCallBlock("tc1", "time", {})], "toolUse"),
      assistant([{ type: "text", text: "完成" }]),
    ]
    const result = await agentRunner.send("现在几点", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    agentRunner.deleteSession(result.sessionId)
    expect(agentRunner.listSessions()).toHaveLength(0)
    expect(
      holder
        .db!.prepare("SELECT * FROM agent_session_entry WHERE session_id = ?")
        .all(result.sessionId),
    ).toHaveLength(0)
    expect(
      holder.db!.prepare("SELECT * FROM agent_call WHERE session_id = ?").all(result.sessionId),
    ).toHaveLength(0)
  })

  it("deleteMessageTurn 删除一轮（问题+回答+工具调用），保留后续轮", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [
      assistant([toolCallBlock("tc1", "time", {})], "toolUse"),
      assistant([{ type: "text", text: "第一轮回答" }]),
    ]
    const first = await agentRunner.send("第一问", undefined, { page: "/", cwd: "/tmp" })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    holder.streamResponses = [assistant([{ type: "text", text: "第二轮回答" }])]
    const second = await agentRunner.send("第二问", undefined, { page: "/", cwd: "/tmp" })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.sessionId).toBe(first.sessionId)

    // 首轮：user + assistant(toolCall) + toolResult + assistant；次轮：user + assistant。
    expect(readRoles(second.sessionId)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "assistant",
      "user",
      "assistant",
    ])
    const [firstTurnTimestamp] = readUserTimestamps(second.sessionId)

    agentRunner.deleteMessageTurn(second.sessionId, firstTurnTimestamp)

    expect(readRoles(second.sessionId)).toEqual(["user", "assistant"])
    expect(
      holder.db!.prepare("SELECT * FROM agent_call WHERE session_id = ?").all(second.sessionId),
    ).toHaveLength(0)
    expect(agentRunner.listSessions()).toHaveLength(1)
  })

  it("deleteMessageTurn 删除最后一轮后会话清空则整体删除", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "回答" }])]
    const result = await agentRunner.send("问题", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    agentRunner.deleteMessageTurn(result.sessionId, readUserTimestamps(result.sessionId)[0]!)

    expect(agentRunner.listSessions()).toHaveLength(0)
    expect(
      holder
        .db!.prepare("SELECT * FROM agent_session_entry WHERE session_id = ?")
        .all(result.sessionId),
    ).toHaveLength(0)
  })

  it("deleteMessageTurn 未命中时间戳时不动库", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "你好" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    agentRunner.deleteMessageTurn(result.sessionId, -1)
    const entries = holder
      .db!.prepare("SELECT * FROM agent_session_entry WHERE session_id = ?")
      .all(result.sessionId)
    expect(entries).toHaveLength(3) // active_capabilities + user + assistant
    expect(agentRunner.listSessions()).toHaveLength(1)
  })

  it("continue 续写 length 截断轮：注入可见 user 续写气泡并续跑落库", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "被截断的部分内容" }], "length")]
    const result = await agentRunner.send("问题", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    holder.streamResponses = [assistant([{ type: "text", text: "续写完成" }])]
    const continued = await agentRunner.continue()
    expect(continued.ok).toBe(true)
    if (!continued.ok) return
    expect(continued.sessionId).toBe(result.sessionId)

    // state.messages 追加 [user 续写, assistant 续写]（续写指令作为可见 user 气泡）。
    const roles = agentRunner.getMessages().map((message) => message.role)
    expect(roles).toEqual(["user", "assistant", "user", "assistant"])
    expect(agentRunner.getMessages()[2]).toMatchObject({
      role: "user",
      content: "请继续输出刚才被中断的内容。",
    })

    // 落库同样含续写 user 气泡（可见 + 如实）。
    expect(readRoles(result.sessionId)).toEqual(["user", "assistant", "user", "assistant"])
  })

  it("continue 对 aborted 空输出（合成错误消息）仍可续写", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "" }], "aborted")]
    const result = await agentRunner.send("问题", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    holder.streamResponses = [assistant([{ type: "text", text: "重新生成" }])]
    const continued = await agentRunner.continue()
    expect(continued.ok).toBe(true)
    expect(agentRunner.getMessages()).toHaveLength(4)
  })

  it("continue 对 stopReason=stop 的正常轮返回拒绝且不注入消息", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "正常回答" }], "stop")]
    const result = await agentRunner.send("问题", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const continued = await agentRunner.continue()
    expect(continued.ok).toBe(false)
    expect(agentRunner.getMessages()).toHaveLength(2)
  })

  it("continue 无会话时返回拒绝", async () => {
    const { agentRunner } = await importRunner()
    const continued = await agentRunner.continue()
    expect(continued.ok).toBe(false)
  })

  it("context-overflow 错误轮不落库，自动压缩后续跑重试", async () => {
    const { agentRunner } = await importRunner()
    // 压缩预算极小，使 force 压缩实际切分早期历史。
    holder.compaction = {
      enabled: true,
      contextWindow: 1000,
      keepRecentTokens: 10,
      reserveTokens: 0,
    }
    holder.streamResponses = [assistant([{ type: "text", text: "第一轮回答" }])]
    const first = await agentRunner.send("第一轮问题", undefined, { page: "/", cwd: "/tmp" })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    // 第二轮：返回 context-overflow 错误；压缩摘要生成成功；续跑重试成功。
    holder.streamResponses = [
      assistant([{ type: "text", text: "" }], "error", "context_length_exceeded"),
      assistant([{ type: "text", text: "重试成功" }]),
    ]
    streamTextMock.mockReturnValueOnce({
      text: Promise.resolve("早期对话摘要"),
      usage: Promise.resolve({ promptTokens: 10, completionTokens: 10, totalTokens: 20 }),
    } as never)
    const second = await agentRunner.send("再问".repeat(30), undefined, {
      page: "/",
      cwd: "/tmp",
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    // overflow 错误轮不落库；user2 + 重试成功落库（无 error 角色）。
    expect(readRoles(second.sessionId)).toEqual(["user", "assistant", "user", "assistant"])
    // compaction entry 已写入（摘要 payload）。
    const compactionRows = holder
      .db!.prepare(
        "SELECT payload FROM agent_session_entry WHERE session_id = ? AND type = 'compaction'",
      )
      .all(second.sessionId) as Array<{ payload: string }>
    expect(compactionRows).toHaveLength(1)
    expect(JSON.parse(compactionRows[0].payload)).toMatchObject({
      summary: "早期对话摘要",
      firstKeptSeq: expect.any(Number),
    })
  })

  it("阈值触发压缩并落 compaction entry；restoreSession 重建可见摘要块", async () => {
    const { agentRunner } = await importRunner()
    holder.compaction = {
      enabled: true,
      contextWindow: 100,
      keepRecentTokens: 10,
      reserveTokens: 0,
    }
    holder.streamResponses = [assistant([{ type: "text", text: "第一轮回答".repeat(20) }])]
    const first = await agentRunner.send("第一轮问题".repeat(20), undefined, {
      page: "/",
      cwd: "/tmp",
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    // 第二轮 assistant 带大 usage：估计上下文超阈值触发压缩。
    streamTextMock.mockReturnValueOnce({
      text: Promise.resolve("早期对话摘要"),
      usage: Promise.resolve({ promptTokens: 10, completionTokens: 10, totalTokens: 20 }),
    } as never)
    holder.streamResponses = [
      assistantWithUsage([{ type: "text", text: "第二轮回答".repeat(20) }], {
        input: 300,
        output: 200,
        cacheRead: 0,
        totalTokens: 500,
      }),
    ]
    const second = await agentRunner.send("第二轮问题".repeat(30), undefined, {
      page: "/",
      cwd: "/tmp",
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    // compaction entry 落库。
    const compactionRows = holder
      .db!.prepare(
        "SELECT payload FROM agent_session_entry WHERE session_id = ? AND type = 'compaction'",
      )
      .all(second.sessionId) as Array<{ payload: string }>
    expect(compactionRows).toHaveLength(1)
    const boundary = JSON.parse(compactionRows[0].payload) as {
      summary: string
      firstKeptSeq: number
    }
    expect(boundary.summary).toBe("早期对话摘要")
    expect(typeof boundary.firstKeptSeq).toBe("number")

    // 恢复会话：UI 消息列表在压缩边界处插入可见摘要块。
    const restored = await agentRunner.restoreSession(second.sessionId)
    expect(
      restored.messages.filter((message) => message.role === "compactionSummary"),
    ).toHaveLength(1)
  })

  it("手动 compact() 落 manual 边界，恢复摘要带 manual，undoCompaction 可撤销", async () => {
    const { agentRunner } = await importRunner()
    holder.compaction = {
      enabled: true,
      contextWindow: 1000,
      keepRecentTokens: 10,
      reserveTokens: 0,
    }
    holder.streamResponses = [assistant([{ type: "text", text: "第一轮回答".repeat(20) }])]
    const first = await agentRunner.send("第一轮问题".repeat(20), undefined, {
      page: "/",
      cwd: "/tmp",
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    holder.streamResponses = [assistant([{ type: "text", text: "第二轮回答".repeat(20) }])]
    const second = await agentRunner.send("第二轮问题".repeat(20), undefined, {
      page: "/",
      cwd: "/tmp",
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    // 手动压缩：摘要生成成功，返回 ok: true。
    const events: AgentEvent[] = []
    agentRunner.attachEventSink((event) => events.push(event))
    streamTextMock.mockReturnValueOnce({
      text: Promise.resolve("手动压缩摘要"),
      usage: Promise.resolve({ promptTokens: 10, completionTokens: 10, totalTokens: 20 }),
    } as never)
    const compacted = await agentRunner.compact()
    expect(compacted).toEqual({ ok: true })
    const start = events.find((event) => event.type === "compaction_start")
    const summaryEvent = events.find((event) => event.type === "compaction_summary")
    expect(start).toMatchObject({ type: "compaction_start", manual: true })
    expect(summaryEvent).toMatchObject({
      type: "compaction_summary",
      message: { manual: true },
    })
    if (start?.type === "compaction_start" && summaryEvent?.type === "compaction_summary") {
      expect(summaryEvent.compactionId).toBe(start.compactionId)
    }
    if (!compacted.ok) return

    // compaction entry 落库且带 manual=true。
    const rows = holder
      .db!.prepare(
        "SELECT payload FROM agent_session_entry WHERE session_id = ? AND type = 'compaction'",
      )
      .all(second.sessionId) as Array<{ payload: string }>
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0].payload)).toMatchObject({ manual: true })

    // 恢复会话：摘要追加到消息底部且带 manual=true。
    const restored = await agentRunner.restoreSession(second.sessionId)
    const summaries = restored.messages.filter((message) => message.role === "compactionSummary")
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ manual: true })

    // 撤销手动压缩：清边界/删 entry，恢复后不再有摘要。
    const undone = await agentRunner.undoCompaction()
    expect(undone.ok).toBe(true)
    const restoredAfterUndo = await agentRunner.restoreSession(second.sessionId)
    expect(
      restoredAfterUndo.messages.filter((message) => message.role === "compactionSummary"),
    ).toHaveLength(0)
  })

  it("短对话手动 compact() 也强制产生摘要（切分点 ≤1 时压缩首条）", async () => {
    const { agentRunner } = await importRunner()
    holder.compaction = {
      enabled: true,
      contextWindow: 1000,
      keepRecentTokens: 10,
      reserveTokens: 0,
    }
    holder.streamResponses = [assistant([{ type: "text", text: "回答".repeat(20) }])]
    const first = await agentRunner.send("问题".repeat(20), undefined, { page: "/", cwd: "/tmp" })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    // 单轮（2 条消息）标准切分点 ≤1，手动压缩回退到压缩首条，仍产生摘要。
    streamTextMock.mockReturnValueOnce({
      text: Promise.resolve("短对话摘要"),
      usage: Promise.resolve({ promptTokens: 10, completionTokens: 10, totalTokens: 20 }),
    } as never)
    const compacted = await agentRunner.compact()
    expect(compacted).toEqual({ ok: true })

    const restored = await agentRunner.restoreSession(first.sessionId)
    expect(
      restored.messages.filter((message) => message.role === "compactionSummary"),
    ).toHaveLength(1)
  })

  it("多次压缩时 readCompactionEntry 正确读取最新的一条 compaction entry", async () => {
    const { agentRunner } = await importRunner()
    holder.compaction = {
      enabled: true,
      contextWindow: 1000,
      keepRecentTokens: 10,
      reserveTokens: 0,
    }
    holder.streamResponses = [assistant([{ type: "text", text: "第一轮回答" }])]
    const first = await agentRunner.send("第一轮问题", undefined, { page: "/", cwd: "/tmp" })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    // 第一次：手动压缩摘要 1 (manual=true)
    streamTextMock.mockReturnValueOnce({
      text: Promise.resolve("手动摘要1"),
      usage: Promise.resolve({ promptTokens: 10, completionTokens: 10, totalTokens: 20 }),
    } as never)
    await agentRunner.compact()

    // 第二轮 QA
    holder.streamResponses = [assistant([{ type: "text", text: "第二轮回答" }])]
    await agentRunner.send("第二轮问题", undefined, { page: "/", cwd: "/tmp" })

    // 第二次：手动压缩摘要 2 (manual=true)
    streamTextMock.mockReturnValueOnce({
      text: Promise.resolve("手动摘要2"),
      usage: Promise.resolve({ promptTokens: 10, completionTokens: 10, totalTokens: 20 }),
    } as never)
    await agentRunner.compact()

    // restoreSession 应读取到最新的手动摘要2
    const restored = await agentRunner.restoreSession(first.sessionId)
    const summaries = restored.messages.filter((message) => message.role === "compactionSummary")
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ summary: "手动摘要2", manual: true })

    // 撤销应删除最新的手动摘要2
    const undone = await agentRunner.undoCompaction()
    expect(undone.ok).toBe(true)
  })

  // 从 toolResult 消息提取文本内容。
  const toolResultText = (message: ToolResultMessage): string =>
    message.content.map((block) => (block.type === "text" ? block.text : "")).join("")

  it("task 工具委托子代理并回传结果，agent_call 落 kind=subagent", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [
      assistant(
        [
          toolCallBlock("tc1", "task", {
            description: "调研子任务",
            prompt: "请调研相关资料并总结",
          }),
        ],
        "toolUse",
      ),
      assistant([{ type: "text", text: "子代理总结：找到 3 份资料" }]),
      assistant([{ type: "text", text: "父代理已完成汇总" }]),
    ]
    const result = await agentRunner.send("帮我调研", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // agent_call 落 kind=subagent（name=task）。
    const calls = holder
      .db!.prepare("SELECT name, kind, status FROM agent_call WHERE session_id = ?")
      .all(result.sessionId) as Array<{ name: string; kind: string; status: string }>
    expect(calls.some((call) => call.name === "task" && call.kind === "subagent")).toBe(true)

    // 父上下文包含 task 工具结果（子代理最终文本回灌）。
    const taskResult = agentRunner
      .getMessages()
      .find(
        (message): message is ToolResultMessage =>
          message.role === "toolResult" && message.toolName === "task",
      )
    expect(taskResult).toBeDefined()
    expect(toolResultText(taskResult!)).toContain("子代理总结")
  })

  it("子代理输出超限写入 tool-output 文件并有界回传", async () => {
    const { agentRunner } = await importRunner()
    const bigText = "重复内容".repeat(20000) // 80k 字符，远超 50KB 上限。
    holder.streamResponses = [
      assistant([toolCallBlock("tc1", "task", { description: "d", prompt: "p" })], "toolUse"),
      assistant([{ type: "text", text: bigText }]),
      assistant([{ type: "text", text: "父完成" }]),
    ]
    const result = await agentRunner.send("调研", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const taskResult = agentRunner
      .getMessages()
      .find(
        (message): message is ToolResultMessage =>
          message.role === "toolResult" && message.toolName === "task",
      )
    expect(taskResult).toBeDefined()
    const text = toolResultText(taskResult!)
    // 有界预览 + 路径标记（完整内容写入 spill 文件）。
    expect(text).toContain("Output truncated")
    expect(text).toContain(".lx/spill")
  })

  it("删除最后轮回滚该轮文件改动（git 快照）", async () => {
    const { agentRunner } = await importRunner()
    // 临时 git 仓库 cwd（快照回滚前置条件）。
    const gitDir = mkdtempSync(join(tmpdir(), "lx-git-runner-"))
    execFileSync("git", ["init", "-q"], { cwd: gitDir, stdio: "ignore" })
    writeFileSync(join(gitDir, "base.txt"), "base\n", "utf8")
    execFileSync("git", ["add", "-A"], { cwd: gitDir, stdio: "ignore" })
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"],
      { cwd: gitDir, stdio: "ignore" },
    )
    try {
      // 第一轮正常（无工具调用，无文件变更）。
      holder.streamResponses = [assistant([{ type: "text", text: "第一轮" }])]
      const first = await agentRunner.send("问题1", undefined, { page: "/", cwd: gitDir })
      expect(first.ok).toBe(true)
      if (!first.ok) return

      // 第二轮：write 工具真实写文件，触发快照（hash_start → hash_end 变更）。
      holder.streamResponses = [
        assistant(
          [toolCallBlock("tc1", "write", { path: "test.txt", content: "content\n" })],
          "toolUse",
        ),
        assistant([{ type: "text", text: "第二轮完成" }]),
      ]
      const second = await agentRunner.send("问题2", undefined, { page: "/", cwd: gitDir })
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(existsSync(join(gitDir, "test.txt"))).toBe(true)

      // 快照行已落库。
      const snapshotRows = holder
        .db!.prepare("SELECT * FROM agent_snapshot WHERE session_id = ?")
        .all(second.sessionId) as Array<{ user_message_timestamp: number; files_changed: string }>
      expect(snapshotRows).toHaveLength(1)
      expect(JSON.parse(snapshotRows[0].files_changed)).toEqual([{ status: "A", file: "test.txt" }])

      // 删除最后轮 → 该轮新增文件回滚（删除）。
      const userTimestamps = readUserTimestamps(second.sessionId)
      agentRunner.deleteMessageTurn(second.sessionId, userTimestamps[1]!)
      expect(existsSync(join(gitDir, "test.txt"))).toBe(false)
      // 快照随轮删除一并清理。
      expect(
        holder
          .db!.prepare("SELECT * FROM agent_snapshot WHERE session_id = ?")
          .all(second.sessionId),
      ).toHaveLength(0)
    } finally {
      rmSync(gitDir, { recursive: true, force: true })
    }
  })

  it("发送附件文件并写入 message.files，并在删除消息轮时一并清理物理文件和文件夹", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "你好" }])]

    // 创建测试临时文件
    const srcFileDir = mkdtempSync(join(tmpdir(), "lx-src-attachment-"))
    const srcFilePath = join(srcFileDir, "test-attachment.txt")
    writeFileSync(srcFilePath, "附件正文内容")

    try {
      const result = await agentRunner.send("hello with attachments", undefined, {
        page: "/",
        cwd: "/tmp",
        files: [
          {
            name: "test-attachment.txt",
            path: srcFilePath,
            type: "text",
          },
        ],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      // 验证物理文件是否成功复制到 ~/.lx/session/<sessionId>/text/ 目录中
      const destDir = join(holder.appDataRoot, "session", result.sessionId)
      const destFilePath = join(destDir, "text", "test-attachment.txt")
      expect(existsSync(destFilePath)).toBe(true)
      expect(readFileSync(destFilePath, "utf8")).toBe("附件正文内容")

      // 验证数据库中 payload 存储了 files 列表
      const entries = holder
        .db!.prepare(
          "SELECT * FROM agent_session_entry WHERE session_id = ? AND type = 'message' ORDER BY seq ASC",
        )
        .all(result.sessionId) as Array<{ type: string; payload: string }>

      const userMsgEntry = entries.find((e) => {
        const p = JSON.parse(e.payload)
        return p.role === "user"
      })
      expect(userMsgEntry).toBeDefined()
      const payload = JSON.parse(userMsgEntry!.payload)
      expect(payload.files).toBeDefined()
      expect(payload.files[0]).toMatchObject({
        name: "test-attachment.txt",
        type: "text",
        path: destFilePath,
      })

      // 验证当唯一一轮被删除后，会话因只剩初始模型/无消息而被整体删除，附件随之被彻底清理
      const userTimestamps = readUserTimestamps(result.sessionId)
      expect(userTimestamps).toHaveLength(1)
      agentRunner.deleteMessageTurn(result.sessionId, userTimestamps[0]!)
      expect(existsSync(destFilePath)).toBe(false)
      expect(existsSync(destDir)).toBe(false) // 空目录应当一并被清理
    } finally {
      rmSync(srcFileDir, { recursive: true, force: true })
    }
  })
})

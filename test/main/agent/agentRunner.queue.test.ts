import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentEvent, AssistantMessage, StopReason, Usage } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 共享状态：临时 config/appData 路径、内存 DB 句柄、脚本化流式响应与每轮 gate。
const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as AssistantMessage[],
  // 每个 streamFn 调用把"释放 gate"函数压入此数组（测试按序释放控制 run 结束时机）。
  releases: [] as (() => void)[],
}))

// mock ai.streamText：压缩摘要生成的可控返回（避免真实 LLM 调用）。
vi.mock("ai", () => ({ streamText: vi.fn() }))

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
  }),
  getPermissionSettings: () => ({ defaultMode: "default", allow: [], deny: [], ask: [] }),
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

// 可 gate 的脚本化 mock streamFn：推 start 后挂起，测试调用 release 后才推 done/end。
// 以此让 prompt() 停留在 isStreaming=true（模拟长流式输出），驱动"流式中发送"场景。
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
      await new Promise<void>((resolve) => holder.releases.push(resolve))
      stream.push({ type: "done", reason: response.stopReason, message: response })
      stream.end()
      return stream
    },
  }
})

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, totalTokens: 0 }

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

// 等待下一个 streamFn 调用挂起（releases 非空），随后释放其 gate（run 结束）。
const releaseNext = async (): Promise<void> => {
  await vi.waitFor(() => expect(holder.releases.length).toBeGreaterThan(0))
  holder.releases.shift()!()
}

// 收集 runner 事件（eventSink；断言 queue_changed 序列）。
const collectEvents = (agentRunner: {
  attachEventSink: (sink: (event: AgentEvent) => void) => void
}): AgentEvent[] => {
  const events: AgentEvent[] = []
  agentRunner.attachEventSink((event) => events.push(event))
  return events
}

const queueLengths = (events: AgentEvent[]): number[] =>
  events
    .filter(
      (event): event is AgentEvent & { type: "queue_changed" } => event.type === "queue_changed",
    )
    .map((event) => event.length)

// 提取 user 消息文本（prompt 路径的 user 消息 content 为文本块数组）。
const userTexts = (messages: import("@shared/contracts/agent").AgentMessage[]): string[] =>
  messages
    .filter((message) => message.role === "user")
    .map((message) => {
      const content = message.content
      if (typeof content === "string") return content
      return content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
    })

const waitForAgentStart = async (events: AgentEvent[]): Promise<void> => {
  await vi.waitFor(() => expect(events.some((event) => event.type === "agent_start")).toBe(true))
}

let tmpDir: string

describe("agentRunner 消息队列（deferred queue）", () => {
  beforeEach(async () => {
    vi.resetModules()
    tmpDir = mkdtempSync(join(tmpdir(), "lx-agent-queue-"))
    holder.configPath = join(tmpDir, "config.json")
    holder.appDataRoot = join(tmpDir, "appdata")
    holder.db = null
    holder.streamResponses = []
    holder.releases = []
  })

  afterEach(() => {
    holder.db?.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  const importRunner = async () => {
    const { agentRunner } = await import("@/agent/agentRunner")
    const events = collectEvents(agentRunner)
    return { agentRunner, events }
  }

  it("流式输出期间发送入队，run 结束后按 FIFO 逐条作为独立 turn 自动发送", async () => {
    const { agentRunner, events } = await importRunner()
    holder.streamResponses = [
      assistant([{ type: "text", text: "A 回答" }]),
      assistant([{ type: "text", text: "B 回答" }]),
      assistant([{ type: "text", text: "C 回答" }]),
      assistant([{ type: "text", text: "D 回答" }]),
    ]

    const sendA = agentRunner.send("A", undefined, { page: "/", cwd: "/tmp" })
    await waitForAgentStart(events)

    // 流式中排队 B、C、D：返回 queued + queueLength，不入时间线。
    for (const [index, message] of ["B", "C", "D"].entries()) {
      const result = await agentRunner.send(message, undefined, { page: "/", cwd: "/tmp" })
      expect(result).toMatchObject({ ok: true, queued: true, queueLength: index + 1 })
    }
    expect(queueLengths(events).slice(0, 3)).toEqual([1, 2, 3])
    // queue_changed 携带队列原文（输入区 tooltip 展示各条排队问题）。
    const lastQueueEvent = events.findLast((event) => event.type === "queue_changed")
    expect(lastQueueEvent).toMatchObject({ length: 3, messages: ["B", "C", "D"] })
    // 排队中不产生任何 user 气泡（未 drain）。
    expect(agentRunner.getMessages().filter((message) => message.role === "user")).toHaveLength(1)

    // 结束 A 的 run → 触发 drain：B、C、D 依次作为独立 run 发送。
    await releaseNext()
    await sendA
    await releaseNext()
    await releaseNext()
    await releaseNext()

    await vi.waitFor(() =>
      expect(agentRunner.getMessages().filter((message) => message.role === "user")).toHaveLength(
        4,
      ),
    )
    // FIFO 顺序：A → B → C → D。
    expect(userTexts(agentRunner.getMessages())).toEqual(["A", "B", "C", "D"])
    // 出队序列：3 → 2 → 1 → 0。
    expect(queueLengths(events).slice(3)).toEqual([2, 1, 0])
  })

  it("排队超过上限拒绝并明确报错，不覆盖不静默丢", async () => {
    const { agentRunner, events } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "A 回答" }])]

    const sendA = agentRunner.send("A", undefined, { page: "/", cwd: "/tmp" })
    await waitForAgentStart(events)

    for (let index = 1; index <= 20; index++) {
      const result = await agentRunner.send(`q${index}`, undefined, { page: "/", cwd: "/tmp" })
      expect(result).toMatchObject({ ok: true, queued: true, queueLength: index })
    }
    const rejected = await agentRunner.send("overflow", undefined, { page: "/", cwd: "/tmp" })
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) {
      expect(rejected.error).toContain("消息队列已满")
    }

    // 收尾：停止清空队列，释放 A 让 run 正常结束。
    agentRunner.abort()
    await releaseNext()
    await sendA
    // 队列已清空：A 的 20 条排队消息未被发送。
    expect(agentRunner.getMessages().filter((message) => message.role === "user")).toHaveLength(1)
    expect(queueLengths(events).at(-1)).toBe(0)
  })

  it("stop 清空排队消息且不再发送", async () => {
    const { agentRunner, events } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "A 回答" }])]

    const sendA = agentRunner.send("A", undefined, { page: "/", cwd: "/tmp" })
    await waitForAgentStart(events)
    await agentRunner.send("B", undefined, { page: "/", cwd: "/tmp" })
    await agentRunner.send("C", undefined, { page: "/", cwd: "/tmp" })
    expect(queueLengths(events).at(-1)).toBe(2)

    // 停止：清空队列（queue_changed{0}），B/C 永不发送。
    agentRunner.abort()
    expect(queueLengths(events).at(-1)).toBe(0)
    await releaseNext()
    await sendA
    expect(userTexts(agentRunner.getMessages())).toEqual(["A"])
  })

  it("会话上下文切换（新建对话 restoreMessages 空）清空排队消息", async () => {
    const { agentRunner, events } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "A 回答" }])]

    const sendA = agentRunner.send("A", undefined, { page: "/", cwd: "/tmp" })
    await waitForAgentStart(events)
    await agentRunner.send("B", undefined, { page: "/", cwd: "/tmp" })
    expect(queueLengths(events).at(-1)).toBe(1)

    // 新建对话：脱离当前会话并清空队列（B 不随旧会话残留）。
    agentRunner.restoreMessages([])
    expect(queueLengths(events).at(-1)).toBe(0)
    await releaseNext()
    await sendA
    expect(userTexts(agentRunner.getMessages())).not.toContain("B")
  })

  it("单轮模型错误只结束该轮，队列继续 drain 后续消息", async () => {
    const { agentRunner } = await importRunner()
    // B 轮返回模型错误；C 轮正常——错误不中断队列。
    holder.streamResponses = [
      assistant([{ type: "text", text: "A 回答" }]),
      assistant([{ type: "text", text: "B 错误" }], "error", "provider 调用失败"),
      assistant([{ type: "text", text: "C 回答" }]),
    ]

    const sendA = agentRunner.send("A", undefined, { page: "/", cwd: "/tmp" })
    await vi.waitFor(() => expect(holder.releases.length).toBeGreaterThan(0))
    await agentRunner.send("B", undefined, { page: "/", cwd: "/tmp" })
    await agentRunner.send("C", undefined, { page: "/", cwd: "/tmp" })

    // 依次释放：A 正常、B 报错、C 正常。
    holder.releases.shift()!()
    await sendA
    await releaseNext()
    await releaseNext()

    await vi.waitFor(() => expect(agentRunner.getMessages()).toHaveLength(6))
    expect(userTexts(agentRunner.getMessages())).toEqual(["A", "B", "C"])
    // B 的错误助手轮已落库（可见错误气泡），C 正常轮紧随其后。
    const errorAssistant = agentRunner
      .getMessages()
      .find(
        (message): message is AssistantMessage =>
          message.role === "assistant" && message.stopReason === "error",
      )
    expect(errorAssistant).toBeDefined()
    expect(errorAssistant?.errorMessage).toBe("provider 调用失败")
    const roles = agentRunner.getMessages().map((message) => message.role)
    expect(roles.filter((role) => role === "assistant")).toHaveLength(3)
  })
})

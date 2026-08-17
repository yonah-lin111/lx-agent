import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  AgentEvent,
  AssistantMessage,
  StopReason,
  Usage,
  UserMessage,
} from "@shared/contracts/agent"
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

const collectEvents = (agentRunner: {
  attachEventSink: (sink: (event: AgentEvent) => void) => void
}): AgentEvent[] => {
  const events: AgentEvent[] = []
  agentRunner.attachEventSink((event) => events.push(event))
  return events
}

const waitForAgentStart = async (events: AgentEvent[]): Promise<void> => {
  await vi.waitFor(() => expect(events.some((event) => event.type === "agent_start")).toBe(true))
}

let tmpDir: string

describe("agentRunner Steer 即时插话与打断", () => {
  beforeEach(async () => {
    vi.resetModules()
    holder.streamResponses = []
    holder.releases = []
    if (holder.db) {
      holder.db.close()
      holder.db = null
    }
    tmpDir = mkdtempSync(join(tmpdir(), "lx-agent-runner-steer-test-"))
    holder.configPath = join(tmpDir, "config.json")
    holder.appDataRoot = join(tmpDir, "appdata")
  })

  afterEach(() => {
    if (holder.db) {
      holder.db.close()
      holder.db = null
    }
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("在流式运行中发送 delivery='steer' 时直接注入 steer 队列，返回 steered=true", async () => {
    const { agentRunner } = await import("@/agent/agentRunner")
    const events = collectEvents(agentRunner)

    // 第一轮工具调用触发 turn 边界
    holder.streamResponses.push(
      assistant([
        {
          type: "toolCall",
          id: "call-1",
          name: "time",
          arguments: {},
        },
      ]),
      // 第二轮回复（读取 steer 后的下一次循环）
      assistant([{ type: "text", text: "已转向处理" }]),
    )

    const runPromise = agentRunner.send("开始任务", undefined, { page: "/" })
    await waitForAgentStart(events)

    // 在第一轮思考尚未结束时触发即时插话
    const steerResult = await agentRunner.send("不要查时间，改为直接回答", undefined, undefined, {
      delivery: "steer",
    })

    expect(steerResult).toEqual({
      ok: true,
      steered: true,
      sessionId: expect.any(String),
    })

    // 释放第一轮与第二轮
    await releaseNext()
    await releaseNext()
    await runPromise

    // 验证事件流中包含 isSteer 标记的 user 消息
    const steerMessageEvent = events.find(
      (e): e is AgentEvent & { type: "message_start"; message: UserMessage } =>
        e.type === "message_start" && e.message.role === "user" && e.message.isSteer === true,
    )
    expect(steerMessageEvent).toBeDefined()
  })

  it("非流式空闲状态下收到 delivery='steer' 时退化为普通 send 启动新 turn", async () => {
    const { agentRunner } = await import("@/agent/agentRunner")
    const events = collectEvents(agentRunner)

    holder.streamResponses.push(assistant([{ type: "text", text: "好的" }]))

    const resultPromise = agentRunner.send(
      "新任务",
      undefined,
      { page: "/" },
      {
        delivery: "steer",
      },
    )
    await waitForAgentStart(events)
    await releaseNext()
    const result = await resultPromise

    expect(result.ok).toBe(true)
    expect((result as { steered?: boolean }).steered).toBeUndefined()
  })
})

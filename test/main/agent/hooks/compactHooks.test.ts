import type { AgentEvent, AgentMessage, HookEventName } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  dispatch: vi.fn(async () => ({ runs: [] as unknown[] })),
  insertedEntries: [] as Array<Record<string, unknown>>,
  streamText: vi.fn(),
}))

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return { ...actual, streamText: holder.streamText }
})

vi.mock("@/services/settingsService", () => ({
  getCompactionSettings: () => ({
    enabled: true,
    contextWindow: 1000,
    keepRecentTokens: 1,
    reserveTokens: 0,
  }),
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
    compactionModel: { provider: "", model: "" },
  }),
}))

vi.mock("@/services/agentSessionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/agentSessionService")>()
  return {
    ...actual,
    agentSessionService: {
      transaction: (fn: () => void) => fn(),
      nextSeq: () => 1,
      insertEntry: (entry: Record<string, unknown>) => holder.insertedEntries.push(entry),
      listEntries: () => [],
      deleteEntries: () => {},
    },
  }
})

vi.mock("@/agent/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/agent/hooks")>()
  return {
    ...actual,
    hooksManager: {
      dispatch: holder.dispatch,
      getHooks: () => [],
    },
  }
})

import { ContextCompactor } from "@/agent/contextCompactor"
import type { Agent } from "@/agent/core/agent"

const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, totalTokens: 0 }

const assistant = (text: string): AgentMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
  provider: "p",
  model: "m",
  usage: EMPTY_USAGE,
  stopReason: "stop",
  timestamp: 0,
})

const hookRun = (
  event: HookEventName,
  text: string,
  status: "completed" | "blocked" = "completed",
) => ({
  hook: { name: `${event}-hook`, event },
  status,
  message: {
    role: "hookContext",
    event,
    hookName: `${event}-hook`,
    status,
    text,
    timestamp: 1,
  },
  ...(status === "blocked" ? { block: { reason: text } } : {}),
})

let events: AgentEvent[] = []
let messages: AgentMessage[] = []

const createCompactor = (): ContextCompactor =>
  new ContextCompactor({
    getAgent: () => ({ state: { messages } }) as unknown as Agent,
    getMessageSeqs: () => messages.map((_, index) => index),
    getSessionId: () => "s1",
    getRequestedModel: () => ({ provider: "p", model: "m" }),
    isBusy: () => false,
    emit: (event) => events.push(event),
    getCwd: () => "/tmp/proj",
  })

const hookMessages = (): Array<{ event?: string; text?: string }> =>
  events
    .filter((event) => event.type === "message_end")
    .map((event) => (event as { message: { event?: string; text?: string } }).message)
    .filter((message) => message.event?.startsWith("Pre") || message.event?.startsWith("Post"))

describe("compaction hooks", () => {
  beforeEach(() => {
    events = []
    messages = [
      assistant("start"),
      { role: "user", content: "问题", timestamp: 0 },
      assistant("a".repeat(40)),
      { role: "user", content: "b".repeat(40), timestamp: 0 },
    ]
    holder.dispatch.mockReset()
    holder.dispatch.mockResolvedValue({ runs: [] })
    holder.insertedEntries = []
    holder.streamText.mockReset()
    holder.streamText.mockReturnValue({
      text: Promise.resolve("压缩摘要"),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("PreCompact/PostCompact 产生 Flow 消息，压缩正常完成", async () => {
    holder.dispatch
      .mockResolvedValueOnce({ runs: [hookRun("PreCompact", "pre-ctx")] })
      .mockResolvedValueOnce({ runs: [hookRun("PostCompact", "post-ctx")] })

    const compactor = createCompactor()
    await expect(compactor.compactIfNeeded(true)).resolves.toBe(true)

    // 压缩照常落库。
    expect(holder.insertedEntries.some((entry) => entry.type === "compaction")).toBe(true)
    // hook 消息出现在 compaction_start 之前（Pre）与 compaction_summary 之后（Post）。
    const eventTypes = events.map((event) => event.type)
    const preHookIndex = events.findIndex(
      (event) =>
        event.type === "message_end" &&
        (event as { message: { event?: string } }).message.event === "PreCompact",
    )
    const compactionStartIndex = eventTypes.indexOf("compaction_start")
    const compactionSummaryIndex = eventTypes.indexOf("compaction_summary")
    const postHookIndex = events.findIndex(
      (event) =>
        event.type === "message_end" &&
        (event as { message: { event?: string } }).message.event === "PostCompact",
    )
    expect(preHookIndex).toBeGreaterThanOrEqual(0)
    expect(preHookIndex).toBeLessThan(compactionStartIndex)
    expect(postHookIndex).toBeGreaterThan(compactionSummaryIndex)
    expect(hookMessages().map((message) => message.text)).toEqual(["pre-ctx", "post-ctx"])
    expect(holder.dispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "PreCompact",
        cwd: "/tmp/proj",
        payload: { trigger: "auto" },
      }),
    )
  })

  it("hook 阻断信号 / continue:false 不阻断压缩（fail-open）", async () => {
    holder.dispatch
      .mockResolvedValueOnce({ runs: [hookRun("PreCompact", "blocked", "blocked")] })
      .mockResolvedValueOnce({ runs: [hookRun("PostCompact", "done")] })

    const compactor = createCompactor()
    await expect(compactor.compactIfNeeded(true)).resolves.toBe(true)
    expect(holder.insertedEntries.some((entry) => entry.type === "compaction")).toBe(true)
  })

  it("hook 超时/异常不阻断压缩（fail-open）", async () => {
    holder.dispatch.mockRejectedValue(new Error("hook timeout"))
    const compactor = createCompactor()
    await expect(compactor.compactIfNeeded(true)).resolves.toBe(true)
    expect(holder.insertedEntries.some((entry) => entry.type === "compaction")).toBe(true)
  })

  it("摘要生成失败时不派发 PostCompact", async () => {
    holder.streamText.mockReturnValue({
      text: Promise.reject(new Error("llm down")),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    })
    const compactor = createCompactor()
    await expect(compactor.compactIfNeeded(true)).resolves.toBe(false)
    expect(holder.dispatch).toHaveBeenCalledTimes(1)
    expect(holder.dispatch).toHaveBeenCalledWith(expect.objectContaining({ event: "PreCompact" }))
    expect(holder.insertedEntries).toHaveLength(0)
  })

  it("手动 compact 派发 manual trigger 并完成", async () => {
    holder.dispatch
      .mockResolvedValueOnce({ runs: [hookRun("PreCompact", "pre-manual")] })
      .mockResolvedValueOnce({ runs: [hookRun("PostCompact", "post-manual")] })

    const compactor = createCompactor()
    await expect(compactor.compact()).resolves.toEqual({ ok: true })
    expect(holder.dispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ event: "PreCompact", payload: { trigger: "manual" } }),
    )
    expect(hookMessages().map((message) => message.text)).toEqual(["pre-manual", "post-manual"])
  })
})

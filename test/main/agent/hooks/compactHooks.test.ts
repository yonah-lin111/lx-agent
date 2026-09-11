import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentEvent, AgentMessage, HookEventName } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  configPath: "",
  insertedEntries: [] as Array<Record<string, unknown>>,
  streamText: vi.fn(),
}))

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return { ...actual, streamText: holder.streamText }
})

// 真实 hooksManager 读取临时 config.json（不 mock hooks 模块，覆盖配置→子进程→解析全链路）。
vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return { ...actual, getConfigPath: () => holder.configPath }
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

import { ContextCompactor } from "@/agent/contextCompactor"
import type { Agent } from "@/agent/core/agent"
import { hookConfig } from "@/agent/hooks/hookConfig"

const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }

const assistant = (text: string): AgentMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
  provider: "p",
  model: "m",
  usage: EMPTY_USAGE,
  stopReason: "stop",
  timestamp: 0,
})

const hookJson = (output: unknown): string => `printf '%s' '${JSON.stringify(output)}'`

let events: AgentEvent[] = []
let messages: AgentMessage[] = []
let tmpDir = ""

const writeHooks = (hooks: Partial<Record<HookEventName, unknown>>): void => {
  writeFileSync(holder.configPath, JSON.stringify({ agent: { hooks } }, null, 2))
}

const createCompactor = (): ContextCompactor =>
  new ContextCompactor({
    getAgent: () => ({ state: { messages } }) as unknown as Agent,
    getMessageSeqs: () => messages.map((_, index) => index),
    getSessionId: () => "s1",
    getRequestedModel: () => ({ provider: "p", model: "m" }),
    isBusy: () => false,
    emit: (event) => events.push(event),
    getCwd: () => tmpDir,
  })

const hookMessages = (): Array<{ event?: string; text?: string }> =>
  events
    .filter((event) => event.type === "message_end")
    .map((event) => (event as { message: { event?: string; text?: string } }).message)
    .filter((message) => message.event?.startsWith("Pre") || message.event?.startsWith("Post"))

describe("compaction hooks（真实派发）", () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "lx-compact-hooks-"))
    holder.configPath = join(tmpDir, "config.json")
    events = []
    messages = [
      assistant("start"),
      { role: "user", content: "问题", timestamp: 0 },
      assistant("a".repeat(40)),
      { role: "user", content: "b".repeat(40), timestamp: 0 },
    ]
    holder.insertedEntries = []
    holder.streamText.mockReset()
    holder.streamText.mockReturnValue({
      text: Promise.resolve("压缩摘要"),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
    })
    hookConfig.reset()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it("PreCompact/PostCompact 真实子进程派发 → 状态与文本归一，压缩正常完成", async () => {
    writeHooks({
      PreCompact: [
        { hooks: [{ name: "pre-hook", command: hookJson({ systemMessage: "pre-ctx" }) }] },
      ],
      PostCompact: [
        { hooks: [{ name: "post-hook", command: hookJson({ systemMessage: "post-ctx" }) }] },
      ],
    })

    const compactor = createCompactor()
    await expect(compactor.compactIfNeeded(true)).resolves.toBe(true)

    expect(holder.insertedEntries.some((entry) => entry.type === "compaction")).toBe(true)
    expect(hookMessages().map((message) => message.text)).toEqual(["pre-ctx", "post-ctx"])

    // Pre 消息先于 compaction_start；Post 消息在 compaction_summary 之后。
    const eventTypes = events.map((event) => event.type)
    const preIndex = events.findIndex(
      (event) =>
        event.type === "message_end" &&
        (event as { message: { event?: string } }).message.event === "PreCompact",
    )
    const postIndex = events.findIndex(
      (event) =>
        event.type === "message_end" &&
        (event as { message: { event?: string } }).message.event === "PostCompact",
    )
    expect(preIndex).toBeLessThan(eventTypes.indexOf("compaction_start"))
    expect(postIndex).toBeGreaterThan(eventTypes.indexOf("compaction_summary"))
  })

  it("真实 hook 输出 continue:false / decision:block / 非零退出 → 均不阻断压缩（fail-open）", async () => {
    writeHooks({
      PreCompact: [
        {
          hooks: [
            { name: "stop-hook", command: hookJson({ continue: false, stopReason: "halt" }) },
            { name: "block-hook", command: hookJson({ decision: "block", reason: "nope" }) },
            { name: "exit-hook", command: "echo broken >&2; exit 3" },
          ],
        },
      ],
    })

    const compactor = createCompactor()
    await expect(compactor.compactIfNeeded(true)).resolves.toBe(true)
    expect(holder.insertedEntries.some((entry) => entry.type === "compaction")).toBe(true)
    // 三条运行均产生审计消息（failed 不产生效果）。
    expect(hookMessages()).toHaveLength(3)
  })

  it("真实 hook 超时 → 不阻断压缩", async () => {
    writeHooks({
      PreCompact: [{ hooks: [{ name: "slow-hook", command: "sleep 30", timeout: 1 }] }],
    })
    const startedAt = Date.now()
    const compactor = createCompactor()
    await expect(compactor.compactIfNeeded(true)).resolves.toBe(true)
    expect(Date.now() - startedAt).toBeLessThan(10_000)
  })

  it("摘要生成失败时不派发 PostCompact（真实副作用文件不存在）", async () => {
    const postEvidence = join(tmpDir, "post-ran.txt")
    writeHooks({
      PreCompact: [{ hooks: [{ name: "pre-hook", command: hookJson({ systemMessage: "pre" }) }] }],
      PostCompact: [{ hooks: [{ name: "post-hook", command: `echo ran >> ${postEvidence}` }] }],
    })
    holder.streamText.mockReturnValue({
      // 惰性拒绝：真实 PreCompact 子进程有耗时，避免 Promise 在 await 前触发 unhandledRejection。
      get text() {
        return Promise.reject(new Error("llm down"))
      },
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    })

    const compactor = createCompactor()
    await expect(compactor.compactIfNeeded(true)).resolves.toBe(false)
    expect(existsSync(postEvidence)).toBe(false)
    expect(hookMessages().map((message) => message.text)).toEqual(["pre"])
  })

  it("手动 compact 派发 manual trigger 并完成", async () => {
    const preEvidence = join(tmpDir, "pre-manual.json")
    writeHooks({
      PreCompact: [
        {
          hooks: [
            {
              name: "pre-manual",
              command: `cat > ${preEvidence} && ${hookJson({ systemMessage: "pre-manual" })}`,
            },
          ],
        },
      ],
      PostCompact: [
        { hooks: [{ name: "post-manual", command: hookJson({ systemMessage: "post-manual" }) }] },
      ],
    })

    const compactor = createCompactor()
    await expect(compactor.compact()).resolves.toEqual({ ok: true })
    expect(hookMessages().map((message) => message.text)).toEqual(["pre-manual", "post-manual"])
    // stdin 协议：trigger=manual。
    const payload = JSON.parse(readFileSync(preEvidence, "utf8")) as Record<string, unknown>
    expect(payload).toMatchObject({ hook_event_name: "PreCompact", trigger: "manual" })
  })
})

import type { AgentEvent, AgentMessage, AssistantMessage } from "@shared/contracts/agent"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  insertedEntries: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/services/settingsService", () => ({
  getCompactionSettings: () => ({
    enabled: true,
    contextWindow: 1000,
    keepRecentTokens: 1000,
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
      nextSeq: () => 99,
      insertEntry: (entry: Record<string, unknown>) => holder.insertedEntries.push(entry),
      listEntries: () => [],
      deleteEntries: () => {},
    },
  }
})

// hook 派发与真实子进程解耦；压缩摘要生成固定成功。
vi.mock("@/agent/hooks", () => ({
  hookResultMessages: () => [],
  hooksManager: { dispatch: vi.fn().mockResolvedValue({}) },
}))

vi.mock("@/agent/compaction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/agent/compaction")>()
  return {
    ...actual,
    generateCompactionSummary: vi.fn().mockResolvedValue({
      summary: "压缩摘要",
      model: "m",
      usage: { input: 1, output: 1 },
    }),
  }
})

import { ContextCompactor } from "@/agent/contextCompactor"
import type { Agent } from "@/agent/core/agent"

const assistant = (content: AssistantMessage["content"]): AgentMessage => ({
  role: "assistant",
  content,
  provider: "p",
  model: "m",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
  stopReason: "toolUse",
  timestamp: 0,
})

const toolResult = (toolCallId: string): AgentMessage => ({
  role: "toolResult",
  toolCallId,
  toolName: "read",
  content: [{ type: "text", text: "文件内容" }],
  isError: false,
  timestamp: 0,
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
  })

describe("ContextCompactor 手动压缩边界", () => {
  beforeEach(() => {
    events = []
    holder.insertedEntries = []
  })

  it("fallback 保留起点不得落在 toolResult 上（否则产生孤儿工具结果）", async () => {
    messages = [
      { role: "user", content: "请读取文件", timestamp: 0 },
      assistant([{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "a.ts" } }]),
      toolResult("call-1"),
    ]
    const compactor = createCompactor()

    const result = await compactor.compact()

    expect(result.ok).toBe(true)
    const boundary = compactor.getBoundary()
    expect(boundary).not.toBeNull()
    const firstKept = messages[boundary!.firstKeptSeq]
    expect(firstKept?.role).not.toBe("toolResult")
    // 保留的 assistant toolCall 与其 toolResult 必须成组保留。
    expect(boundary!.firstKeptSeq).toBe(1)
  })

  it("fallback 保留起点落在末尾 assistant 上时行为不变", async () => {
    messages = [
      { role: "user", content: "问题", timestamp: 0 },
      { role: "user", content: "补充", timestamp: 0 },
      assistant([{ type: "text", text: "回答" }]),
    ]
    const compactor = createCompactor()

    const result = await compactor.compact()

    expect(result.ok).toBe(true)
    expect(compactor.getBoundary()?.firstKeptSeq).toBe(2)
  })
})

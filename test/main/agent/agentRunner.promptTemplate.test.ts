import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  AssistantMessage,
  StopReason,
  TextContent,
  Usage,
  UserMessage,
} from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as import("@shared/contracts/agent").AssistantMessage[],
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
  getPermissionSettings: () => ({
    defaultMode: "default",
    allow: [],
    deny: [],
    ask: [],
  }),
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

const assistant = (text = "回复", stopReason: StopReason = "stop"): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
  provider: "test",
  model: "test-model",
  usage: EMPTY_USAGE,
  stopReason,
  timestamp: Date.now(),
})

let tmpDir = ""
let cwd = ""

beforeEach(async () => {
  vi.resetModules()
  tmpDir = mkdtempSync(join(tmpdir(), "lx-prompt-runner-"))
  holder.configPath = join(tmpDir, "config.json")
  holder.appDataRoot = tmpDir
  holder.db = null
  holder.streamResponses = []
  cwd = join(tmpDir, "proj")
  mkdirSync(cwd, { recursive: true })
})

afterEach(() => {
  holder.db?.close()
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe("agentRunner with Prompt Templates", () => {
  it("expands prompt template when user sends /template <args>", async () => {
    // 写入项目级模板
    const promptDir = join(cwd, ".lx", "prompts")
    mkdirSync(promptDir, { recursive: true })
    writeFileSync(
      join(promptDir, "audit.md"),
      `---
description: 审计代码
---
请审查模块 $1。重点：$@
`,
    )

    const { agentRunner } = await import("@/agent/agentRunner")
    holder.streamResponses.push(assistant("审计完成"))

    const result = await agentRunner.send("/audit src/core.ts 关注性能", undefined, {
      page: "/",
      cwd,
    })

    expect(result.ok).toBe(true)
    const sessionId = (result as { sessionId: string }).sessionId
    expect(sessionId).toBeTruthy()

    // 验证 LLM 历史消息中收到的是展开后的 prompt
    const messages = agentRunner.getMessages()
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe("user")
    const userMsg = messages[0] as UserMessage
    const text = Array.isArray(userMsg.content)
      ? (userMsg.content[0] as TextContent).text
      : userMsg.content
    expect(text).toBe("请审查模块 src/core.ts。重点：src/core.ts 关注性能")
  })
})

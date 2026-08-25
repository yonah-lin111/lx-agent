import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AssistantMessage } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultSystemPromptManager } from "@/agent/prompts/systemPromptManager"

const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as AssistantMessage[],
  capturedSystemPrompts: [] as string[],
}))

vi.mock("ai", () => ({ streamText: vi.fn() }))

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
    enabled: false,
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
    createAiSdkStreamFn: () => async (_model: unknown, context: { systemPrompt?: string }) => {
      if (context.systemPrompt) {
        holder.capturedSystemPrompts.push(context.systemPrompt)
      }
      const response = holder.streamResponses.shift() ?? {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "ok" }],
        provider: "p",
        model: "m",
        usage: { input: 1, output: 1, cacheRead: 0, totalTokens: 2 },
        stopReason: "stop" as const,
        timestamp: Date.now(),
      }
      const stream = createAssistantMessageEventStream()
      queueMicrotask(() => {
        stream.push({ type: "start", partial: response })
        stream.push({
          type: "text_start",
          contentIndex: 0,
          content: "ok",
          partial: response,
        })
        stream.push({
          type: "done",
          reason: "stop",
          message: response,
        })
        stream.end()
      })
      return stream
    },
  }
})

describe("AgentRunner 动态分层系统提示词端到端生效验证", () => {
  let projectDir: string

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), "lx-prompt-runner-"))
    holder.configPath = join(root, "config.json")
    holder.appDataRoot = root
    projectDir = mkdtempSync(join(tmpdir(), "lx-project-"))
    holder.capturedSystemPrompts = []
    holder.streamResponses = []
  })

  afterEach(() => {
    if (holder.db) {
      holder.db.close()
      holder.db = null
    }
    rmSync(holder.appDataRoot, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  it("默认装配：包含基础身份、核心指导规范以及项目 AGENTS.md 指令", async () => {
    const { agentRunner } = await import("@/agent/agentRunner")
    // 写入项目级 AGENTS.md 指令
    writeFileSync(
      join(projectDir, "AGENTS.md"),
      "# Project Specific Rule\nDo not break production.",
    )

    await agentRunner.send("hello", undefined, { page: "/", cwd: projectDir })

    expect(holder.capturedSystemPrompts.length).toBeGreaterThan(0)
    const prompt = holder.capturedSystemPrompts[0]!
    expect(prompt).toContain("You are LX Agent")
    expect(prompt).toContain("Read a file to confirm its content before modifying it")
    expect(prompt).toContain("Instructions from:")
    expect(prompt).toContain("Do not break production.")
  })

  it("会话级作用域覆盖：按 sessionId 覆盖 persona，不污染其他会话", async () => {
    const { agentRunner } = await import("@/agent/agentRunner")
    // 1. 创建第一个会话
    const res1 = await agentRunner.send("init", undefined, { page: "/p1", cwd: projectDir })
    expect(res1.ok).toBe(true)
    if (!res1.ok) return
    const sessionId = res1.sessionId

    // 为该特定会话注册专属 Persona 覆盖
    const unregister = defaultSystemPromptManager.registerSection(
      {
        name: "deployment:persona",
        order: 0,
        text: "You are a JSON-only code analysis engine.",
      },
      sessionId,
    )

    try {
      holder.capturedSystemPrompts = []
      // 在同一会话发送第二条消息（触发动态提示词装配）
      await agentRunner.send("analyze", undefined, { page: "/p1", cwd: projectDir })

      expect(holder.capturedSystemPrompts.length).toBeGreaterThan(0)
      const prompt = holder.capturedSystemPrompts[0]!
      expect(prompt).toContain("You are LX Agent")
      expect(prompt).toContain("You are a JSON-only code analysis engine.")
      expect(prompt).not.toContain("Read a file to confirm its content before modifying it") // 默认 persona 被覆盖
    } finally {
      unregister()
    }

    // 2. 创建一个新会话，验证默认 persona 自动恢复
    holder.capturedSystemPrompts = []
    const otherProjectDir = mkdtempSync(join(tmpdir(), "lx-project-other-"))
    try {
      await agentRunner.send("hello other", undefined, { page: "/p2", cwd: otherProjectDir })
      expect(holder.capturedSystemPrompts.length).toBeGreaterThan(0)
      const normalPrompt = holder.capturedSystemPrompts[0]!
      expect(normalPrompt).toContain("Read a file to confirm its content before modifying it")
    } finally {
      rmSync(otherProjectDir, { recursive: true, force: true })
    }
  })

  it("拦截器动态注入：拦截器可为对话追加 LSP 诊断等上下文", async () => {
    const { agentRunner } = await import("@/agent/agentRunner")
    const unregisterInterceptor = defaultSystemPromptManager.registerInterceptor({
      name: "lsp-mock-interceptor",
      apply: (assembly) => {
        return {
          ...assembly,
          rendered: `${assembly.rendered}\n\n[LSP Diagnostics: 0 errors detected]`,
        }
      },
    })

    try {
      await agentRunner.send("check types", undefined, { page: "/p3", cwd: projectDir })

      expect(holder.capturedSystemPrompts.length).toBeGreaterThan(0)
      const prompt = holder.capturedSystemPrompts[0]!
      expect(prompt).toContain("[LSP Diagnostics: 0 errors detected]")
    } finally {
      unregisterInterceptor()
    }
  })
})

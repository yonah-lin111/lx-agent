import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentEvent } from "@shared/contracts/agent"
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
      openai: {
        id: "openai",
        type: "openai",
        name: "OpenAI",
        options: { apiKey: "mock-key" },
        models: { "gpt-4o": { id: "gpt-4o", name: "GPT-4o" } },
      },
      anthropic: {
        id: "anthropic",
        type: "anthropic",
        name: "Anthropic",
        options: { apiKey: "mock-key" },
        models: { "claude-3-5-sonnet-20241022": { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" } },
      },
    },
    enabledProviders: ["openai", "anthropic"],
  }),
  getCompactionSettings: () => ({
    enabled: true,
    contextWindow: 128000,
    keepRecentTokens: 20000,
    reserveTokens: 16384,
  }),
  getPermissionSettings: () => ({
    defaultMode: "bypass",
    allow: [],
    deny: [],
    ask: [],
  }),
  savePermissionSettings: vi.fn(),
  getEffectivePersonality: () => "engineer",
  getEffectiveCustomInstructions: () => "",
}))

vi.mock("@/services/agentSessionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/agentSessionService")>()
  const Database = (await import("better-sqlite3")).default
  const { runMigrations } = await import("@/db/migrate")
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

vi.mock("@/agent/stream/aiSdkStreamFn", () => ({
  createAiSdkStreamFn: () => (_messages: any, _options: any, callbacks: any) => {
    const next = holder.streamResponses.shift() ?? {
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
    }
    for (const block of next.content) {
      if (block.type === "text") {
        callbacks.onTextDelta?.(block.text)
      }
    }
    return Promise.resolve(next)
  },
}))

describe("Model Switch and Initial Model Entries", () => {
  let tmpWorkspace: string

  beforeEach(async () => {
    vi.resetModules()
    tmpWorkspace = mkdtempSync(join(tmpdir(), "model-switch-test-"))
    holder.configPath = join(tmpWorkspace, "config.json")
    holder.appDataRoot = join(tmpWorkspace, "appData")
    holder.db = null
    holder.streamResponses = []
    writeFileSync(holder.configPath, JSON.stringify({}))
  })

  afterEach(() => {
    if (holder.db) {
      try {
        holder.db.close()
      } catch {}
      holder.db = null
    }
    if (existsSync(tmpWorkspace)) {
      rmSync(tmpWorkspace, { recursive: true, force: true })
    }
  })

  const importModules = async () => {
    const { agentRunner } = await import("@/agent/agentRunner")
    const { agentSessionService } = await import("@/services/agentSessionService")
    return { agentRunner, agentSessionService }
  }

  it("新会话首条消息创建会话时注入初始模型 entry", async () => {
    const { agentRunner, agentSessionService } = await importModules()
    const events: AgentEvent[] = []
    agentRunner.attachEventSink((ev) => events.push(ev as AgentEvent))

    const res = await agentRunner.send("Hello world", { provider: "openai", model: "gpt-4o" }, { cwd: tmpWorkspace })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.sessionId).toBeDefined()

    const sessionId = res.sessionId!
    const entries = agentSessionService.listEntries(sessionId)

    // 验证 entries 包含 active_capabilities 和初始 model_change
    const capEntry = entries.find((e) => e.type === "active_capabilities")
    const modelEntry = entries.find((e) => e.type === "model_change")

    expect(capEntry).toBeDefined()
    expect(modelEntry).toBeDefined()

    const parsedModel = JSON.parse(modelEntry!.payload)
    expect(parsedModel.role).toBe("modelSwitch")
    expect(parsedModel.provider).toBe("openai")
    expect(parsedModel.model).toBe("gpt-4o")
    expect(parsedModel.family).toBe("gpt")
    expect(parsedModel.isInitial).toBe(true)
    expect(parsedModel.instructions).toContain("Editing constraints")

    // 验证事件流是否实时推送了初始模型的 model_switch 事件（无需刷新立即展示）
    const initialEvent = events.find((e) => e.type === "model_switch")
    expect(initialEvent).toBeDefined()
    if (initialEvent && initialEvent.type === "model_switch") {
      expect(initialEvent.message.isInitial).toBe(true)
      expect(initialEvent.message.model).toBe("gpt-4o")
    }

    // 验证 restoreSession 能够恢复出 modelSwitch 消息
    const restored = await agentRunner.restoreSession(sessionId)
    const initialSwitch = restored.messages.find((m) => m.role === "modelSwitch")
    expect(initialSwitch).toBeDefined()
    expect(initialSwitch?.role).toBe("modelSwitch")
    if (initialSwitch?.role === "modelSwitch") {
      expect(initialSwitch.isInitial).toBe(true)
      expect(initialSwitch.model).toBe("gpt-4o")
    }
  })

  it("已有会话中切换模型时落库 model_change entry 并广播 model_switch 事件", async () => {
    const { agentRunner, agentSessionService } = await importModules()
    const events: AgentEvent[] = []
    agentRunner.attachEventSink((ev) => events.push(ev as AgentEvent))

    // 先发送一条消息建立会话
    const res = await agentRunner.send("First message", { provider: "openai", model: "gpt-4o" }, { cwd: tmpWorkspace })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const sessionId = res.sessionId!

    // 切换为 claude
    const switchRes = agentRunner.switchModel({
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
    })
    expect(switchRes.ok).toBe(true)

    // 检查事件流是否推送了初始与切换后的 model_switch 事件
    const modelSwitchEvents = events.filter((e): e is Extract<AgentEvent, { type: "model_switch" }> => e.type === "model_switch")
    expect(modelSwitchEvents).toHaveLength(2)
    expect(modelSwitchEvents[0].message.isInitial).toBe(true)
    expect(modelSwitchEvents[0].message.provider).toBe("openai")

    const switchEvent = modelSwitchEvents[1]
    expect(switchEvent.message.provider).toBe("anthropic")
    expect(switchEvent.message.model).toBe("claude-3-5-sonnet-20241022")
    expect(switchEvent.message.family).toBe("claude")
    expect(switchEvent.message.isInitial).toBe(false)
    expect(switchEvent.message.instructions).toContain("Anthropic Claude Architecture")

    // 检查 DB 中是否有新的 model_change entry
    const entries = agentSessionService.listEntries(sessionId)
    const modelEntries = entries.filter((e) => e.type === "model_change")
    expect(modelEntries.length).toBe(2) // 1 initial + 1 switch

    const secondModel = JSON.parse(modelEntries[1].payload)
    expect(secondModel.model).toBe("claude-3-5-sonnet-20241022")
    expect(secondModel.isInitial).toBe(false)
  })
})

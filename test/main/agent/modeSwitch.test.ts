import { existsSync, mkdtempSync, rmSync } from "node:fs"
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

vi.mock("@/services/settingsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/settingsService")>()
  return {
    ...actual,
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
          models: {
            "claude-3-5-sonnet-20241022": {
              id: "claude-3-5-sonnet-20241022",
              name: "Claude 3.5 Sonnet",
            },
          },
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
  }
})

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

describe("Collaboration Mode Switch Entries", () => {
  let tmpWorkspace: string

  beforeEach(async () => {
    vi.resetModules()
    tmpWorkspace = mkdtempSync(join(tmpdir(), "mode-switch-test-"))
    holder.configPath = join(tmpWorkspace, "config.json")
    holder.appDataRoot = join(tmpWorkspace, "appData")
    holder.db = null
    holder.streamResponses = []
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

  const createSession = async (
    agentRunner: Awaited<ReturnType<typeof importModules>>["agentRunner"],
  ) => {
    const res = await agentRunner.send(
      "First message",
      { provider: "openai", model: "gpt-4o" },
      { cwd: tmpWorkspace },
    )
    if (!res.ok) throw new Error("send failed")
    return res.sessionId!
  }

  it("已有会话切换协作模式时落库 mode_change entry 并广播带 message 的事件", async () => {
    const { agentRunner, agentSessionService } = await importModules()
    const events: AgentEvent[] = []
    agentRunner.attachEventSink((ev) => events.push(ev as AgentEvent))
    const sessionId = await createSession(agentRunner)

    const switchRes = agentRunner.setCollaborationMode("plan", sessionId)
    expect(switchRes.ok).toBe(true)

    const modeEvents = events.filter(
      (e): e is Extract<AgentEvent, { type: "collaboration_mode_changed" }> =>
        e.type === "collaboration_mode_changed",
    )
    expect(modeEvents).toHaveLength(1)
    expect(modeEvents[0].mode).toBe("plan")
    expect(modeEvents[0].message?.role).toBe("modeSwitch")
    expect(modeEvents[0].message?.mode).toBe("plan")

    const entries = agentSessionService.listEntries(sessionId)
    const modeEntries = entries.filter((e) => e.type === "mode_change")
    expect(modeEntries).toHaveLength(1)
    expect(JSON.parse(modeEntries[0].payload).mode).toBe("plan")

    // 恢复会话：mode_change entry 还原为 modeSwitch 消息
    const restored = await agentRunner.restoreSession(sessionId)
    const restoredMode = restored.messages.find((m) => m.role === "modeSwitch")
    expect(restoredMode?.role).toBe("modeSwitch")
    if (restoredMode?.role === "modeSwitch") {
      expect(restoredMode.mode).toBe("plan")
    }
  })

  it("连续切换协作模式原地合并同一条 entry（不新增条目，payload 为最后一次模式）", async () => {
    const { agentRunner, agentSessionService } = await importModules()
    const events: AgentEvent[] = []
    agentRunner.attachEventSink((ev) => events.push(ev as AgentEvent))
    const sessionId = await createSession(agentRunner)

    agentRunner.setCollaborationMode("plan", sessionId)
    agentRunner.setCollaborationMode("review", sessionId)
    agentRunner.setCollaborationMode("build", sessionId)

    const entries = agentSessionService.listEntries(sessionId)
    const modeEntries = entries.filter((e) => e.type === "mode_change")
    expect(modeEntries).toHaveLength(1)
    expect(JSON.parse(modeEntries[0].payload).mode).toBe("build")

    const modeEvents = events.filter(
      (e): e is Extract<AgentEvent, { type: "collaboration_mode_changed" }> =>
        e.type === "collaboration_mode_changed",
    )
    // 三次切换都广播事件，但后两次合并到同一条 message 上（mode 依次更新）。
    expect(modeEvents.map((e) => e.mode)).toEqual(["plan", "review", "build"])
    expect(modeEvents[2].message?.mode).toBe("build")

    // 会话恢复后只有一条模式切换消息
    const restored = await agentRunner.restoreSession(sessionId)
    expect(restored.messages.filter((m) => m.role === "modeSwitch")).toHaveLength(1)
  })

  it("真实消息打断后再次切换会新增条目；模式未变化时不产生条目", async () => {
    const { agentRunner, agentSessionService } = await importModules()
    const sessionId = await createSession(agentRunner)

    agentRunner.setCollaborationMode("plan", sessionId)
    // 模式未变化：不新增条目、不广播 item message。
    agentRunner.setCollaborationMode("plan", sessionId)

    const before = agentSessionService
      .listEntries(sessionId)
      .filter((e) => e.type === "mode_change")
    expect(before).toHaveLength(1)

    // 追加一条真实对话消息后，尾部连续切换被打断 → 再切换会新增条目。
    const res = await agentRunner.send("Second message", undefined, { cwd: tmpWorkspace })
    expect(res.ok).toBe(true)
    agentRunner.setCollaborationMode("review", sessionId)

    const after = agentSessionService.listEntries(sessionId).filter((e) => e.type === "mode_change")
    expect(after).toHaveLength(2)
    expect(JSON.parse(after[1].payload).mode).toBe("review")
  })

  it("auto 基础模式：setEffectiveMode 只改有效模式并把 viaAuto 条目并入尾部切换消息", async () => {
    const { agentRunner, agentSessionService } = await importModules()
    const events: AgentEvent[] = []
    agentRunner.attachEventSink((ev) => events.push(ev as AgentEvent))
    const sessionId = await createSession(agentRunner)

    agentRunner.setCollaborationMode("auto", sessionId)
    const autoEvent = events.at(-1) as Extract<AgentEvent, { type: "collaboration_mode_changed" }>
    expect(autoEvent.mode).toBe("auto")
    expect(autoEvent.effectiveMode).toBe("build")

    const res = agentRunner.setEffectiveMode("plan", sessionId)
    expect(res.ok).toBe(true)
    const planEvent = events.at(-1) as Extract<AgentEvent, { type: "collaboration_mode_changed" }>
    expect(planEvent.mode).toBe("auto")
    expect(planEvent.effectiveMode).toBe("plan")
    expect(planEvent.message?.mode).toBe("plan")
    expect(planEvent.message?.viaAuto).toBe(true)

    // 尾部连续切换合并为同一条 mode_change entry（payload 为有效模式 + viaAuto）。
    const modeEntries = agentSessionService
      .listEntries(sessionId)
      .filter((entry) => entry.type === "mode_change")
    expect(modeEntries).toHaveLength(1)
    const payload = JSON.parse(modeEntries[0].payload) as { mode: string; viaAuto?: boolean }
    expect(payload.mode).toBe("plan")
    expect(payload.viaAuto).toBe(true)

    // 会话恢复后还原为带 viaAuto 的 modeSwitch 消息。
    const restored = await agentRunner.restoreSession(sessionId)
    const restoredMode = restored.messages.find((message) => message.role === "modeSwitch")
    if (restoredMode?.role === "modeSwitch") {
      expect(restoredMode.mode).toBe("plan")
      expect(restoredMode.viaAuto).toBe(true)
    } else {
      throw new Error("restored modeSwitch message missing")
    }
  })

  it("非 auto 基础模式下 setEffectiveMode 等价于基础模式切换（卡片采纳统一入口）", async () => {
    const { agentRunner } = await importModules()
    const events: AgentEvent[] = []
    agentRunner.attachEventSink((ev) => events.push(ev as AgentEvent))
    const sessionId = await createSession(agentRunner)

    agentRunner.setCollaborationMode("plan", sessionId)
    const res = agentRunner.setEffectiveMode("build", sessionId)
    expect(res.ok).toBe(true)

    const event = events.at(-1) as Extract<AgentEvent, { type: "collaboration_mode_changed" }>
    expect(event.mode).toBe("build")
    expect(event.effectiveMode).toBe("build")
  })

  it("setEffectiveMode 拒绝 minimal / auto 等不可达目标", async () => {
    const { agentRunner } = await importModules()
    const sessionId = await createSession(agentRunner)
    agentRunner.setCollaborationMode("auto", sessionId)

    const minimal = agentRunner.setEffectiveMode("minimal", sessionId)
    expect(minimal.ok).toBe(false)
    const auto = agentRunner.setEffectiveMode("auto", sessionId)
    expect(auto.ok).toBe(false)
  })

  it("切换基础模式重置有效模式：auto + plan 有效模式下切到 review", async () => {
    const { agentRunner } = await importModules()
    const events: AgentEvent[] = []
    agentRunner.attachEventSink((ev) => events.push(ev as AgentEvent))
    const sessionId = await createSession(agentRunner)

    agentRunner.setCollaborationMode("auto", sessionId)
    agentRunner.setEffectiveMode("plan", sessionId)
    agentRunner.setCollaborationMode("review", sessionId)

    const event = events.at(-1) as Extract<AgentEvent, { type: "collaboration_mode_changed" }>
    expect(event.mode).toBe("review")
    expect(event.effectiveMode).toBe("review")
    expect(event.message?.viaAuto).toBeUndefined()
  })

  it("auto 有效模式下每轮系统提示词保留有效模式契约（回归：runSessionTurn 曾漏传 effective）", async () => {
    const { agentRunner } = await importModules()
    const sessionId = await createSession(agentRunner)

    agentRunner.setCollaborationMode("auto", sessionId)
    agentRunner.setEffectiveMode("plan", sessionId)

    const res = await agentRunner.send("下一步", undefined, { cwd: tmpWorkspace })
    expect(res.ok).toBe(true)

    const prompt = agentRunner.getRunner(sessionId)?.agent?.state.systemPrompt ?? ""
    expect(prompt).toContain("# Collaboration Mode: Auto Orchestration")
    expect(prompt).toContain("# Collaboration Mode: Plan Mode (Strictly Non-Mutating)")
    expect(prompt).not.toContain('<collaboration_mode name="build">')
  })
})

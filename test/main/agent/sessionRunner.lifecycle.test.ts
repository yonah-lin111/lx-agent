import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 共享状态：临时 config/appData 路径与内存 DB 句柄。
const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
}))

// ai.streamText 不参与生命周期用例，直接 mock 避免真实调用。
vi.mock("ai", () => ({ streamText: vi.fn() }))

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
  }
})

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

const { AgentSessionRunner } = await import("@/agent/sessionRunner")
const { agentSessionService } = await import("@/services/agentSessionService")
const { hooksManager } = await import("@/agent/hooks")
const { permissionManager } = await import("@/agent/permissions/permissionManager")

describe("AgentSessionRunner 生命周期与工作区/项目切换", () => {
  beforeEach(() => {
    holder.configPath = join(mkdtempSync(join(tmpdir(), "lx-cfg-")), "config.json")
    holder.appDataRoot = mkdtempSync(join(tmpdir(), "lx-app-"))
    holder.db = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (holder.appDataRoot) rmSync(holder.appDataRoot, { recursive: true, force: true })
  })

  it("freezeNewSession 在草稿态冻结 binding、cwd 与默认能力", () => {
    const runner = new AgentSessionRunner({ sessionId: null, tabId: "tab-1" })

    runner.freezeNewSession({ projectId: "project-1", page: "/project", cwd: "/tmp" })

    expect(runner.sessionBinding).toEqual({ projectId: "project-1", page: "/project" })
    expect(runner.requestedCwd).toBe("/tmp")
    expect(runner.getEffectiveCwd()).toBe("/tmp")
    expect(runner.activeCapabilities.length).toBeGreaterThan(0)
  })

  it("freezeNewSession 已有会话时不生效", () => {
    const runner = new AgentSessionRunner({ sessionId: "session-1", tabId: "tab-1" })

    runner.freezeNewSession({ projectId: "project-1", page: "/project", cwd: "/tmp" })

    expect(runner.sessionBinding).toBeNull()
    expect(runner.requestedCwd).toBeUndefined()
  })

  it("switchWorktree 忙时拒绝，空闲时清理队列并更新 cwd", () => {
    const runner = new AgentSessionRunner({ sessionId: "session-2", tabId: "tab-1" })
    runner.messageQueue.push({ text: "排队消息" })

    const busyResult = runner.switchWorktree("/tmp/busy")
    expect(busyResult.ok).toBe(false)
    expect(runner.messageQueue).toHaveLength(1)

    runner.messageQueue = []
    const updateCwd = vi.spyOn(agentSessionService, "updateSessionCwd")
    const result = runner.switchWorktree("/tmp/worktree-a")

    expect(result).toEqual({ ok: true })
    expect(runner.requestedCwd).toBe("/tmp/worktree-a")
    expect(updateCwd).toHaveBeenCalledWith("session-2", "/tmp/worktree-a", expect.any(String))
  })

  it("switchProject 忙时拒绝，空闲时更新 binding 与项目持久化", () => {
    const runner = new AgentSessionRunner({ sessionId: "session-3", tabId: "tab-1" })
    runner.messageQueue.push({ text: "排队消息" })
    expect(runner.switchProject("project-9", "/tmp/p9").ok).toBe(false)

    runner.messageQueue = []
    const updateProject = vi.spyOn(agentSessionService, "updateSessionProject")
    const result = runner.switchProject("project-9", "/tmp/p9")

    expect(result).toEqual({ ok: true })
    expect(runner.sessionBinding?.projectId).toBe("project-9")
    expect(runner.requestedCwd).toBe("/tmp/p9")
    expect(updateProject).toHaveBeenCalledWith(
      "session-3",
      "project-9",
      "/tmp/p9",
      expect.any(String),
    )
  })

  it("cleanUp 清理会话资源与守卫提醒", () => {
    const runner = new AgentSessionRunner({ sessionId: "session-4", tabId: "tab-1" })
    runner.guardReminders.set("tool-1", "重复调用提醒")
    const clearSession = vi.spyOn(permissionManager, "clearSession")

    runner.cleanUp()

    expect(clearSession).toHaveBeenCalledWith("session-4")
    expect(runner.guardReminders.size).toBe(0)
  })

  it("dispose 派发 SessionEnd、清理运行态并重置 SessionStart 标记", () => {
    const runner = new AgentSessionRunner({ sessionId: "session-5", tabId: "tab-1" })
    runner.sessionStartFired = true
    const dispatchBestEffort = vi.spyOn(hooksManager, "dispatchBestEffort")

    runner.dispose("quit")

    expect(dispatchBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "SessionEnd",
        sessionId: "session-5",
        payload: { reason: "quit" },
      }),
    )
    expect(runner.sessionStartFired).toBe(false)
  })

  it("setSessionId 切换会话时清理旧会话资源并重置 SessionStart", () => {
    const runner = new AgentSessionRunner({ sessionId: "session-6", tabId: "tab-1" })
    runner.sessionStartFired = true
    const clearSession = vi.spyOn(permissionManager, "clearSession")

    runner.setSessionId("session-7")

    expect(runner.currentSessionId).toBe("session-7")
    expect(clearSession).toHaveBeenCalledWith("session-6")
    expect(runner.sessionStartFired).toBe(false)
  })
})

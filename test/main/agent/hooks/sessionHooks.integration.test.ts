import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AssistantMessage, StopReason, Usage } from "@shared/contracts/agent"
import { streamText } from "ai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 共享状态：临时 config/appData、内存 DB、脚本化助手响应。
const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as import("@shared/contracts/agent").AssistantMessage[],
  compaction: {
    enabled: true,
    contextWindow: 128000,
    keepRecentTokens: 20000,
    reserveTokens: 16384,
  } as import("@shared/settings").CompactionSettings,
}))

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return { ...actual, streamText: vi.fn() }
})

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
      streamIdleTimeoutMs: 60000,
    }),
    getPermissionSettings: () => ({
      defaultMode: "default",
      allow: [],
      deny: [],
      ask: [],
    }),
    getCompactionSettings: () => holder.compaction,
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

vi.mock("@/agent/stream/aiSdkStreamFn", async () => {
  const { createAssistantMessageEventStream } = await import("@/agent/core/event-stream")
  return {
    createAiSdkStreamFn: () => async () => {
      const response = holder.streamResponses.shift()
      if (!response) throw new Error("No more mock responses")
      const stream = createAssistantMessageEventStream()
      stream.push({ type: "start", partial: response })
      stream.push({ type: "done", reason: response.stopReason, message: response })
      stream.end()
      return stream
    },
  }
})

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }

const assistant = (
  blocks: AssistantMessage["content"],
  stopReason: StopReason = "stop",
): AssistantMessage => ({
  role: "assistant",
  content: blocks,
  provider: "test",
  model: "test-model",
  usage: EMPTY_USAGE,
  stopReason,
  timestamp: 0,
})

// 将 agent.hooks 配置写入临时 config.json。
const writeHooks = (hooks: Record<string, unknown>): void => {
  writeFileSync(holder.configPath, JSON.stringify({ agent: { hooks } }, null, 2))
}

const jsonHook = (output: unknown): string => `printf '%s' '${JSON.stringify(output)}'`

// 轮询等待 best-effort SessionEnd 落盘。
const waitFor = async (check: () => boolean, timeoutMs = 3000): Promise<void> => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error("waitFor timeout")
}

let tmpDir = ""

describe("session 生命周期 hooks", () => {
  beforeEach(() => {
    vi.resetModules()
    tmpDir = mkdtempSync(join(tmpdir(), "lx-hooks-session-"))
    holder.configPath = join(tmpDir, "config.json")
    holder.appDataRoot = join(tmpDir, "appdata")
    holder.db = null
    holder.streamResponses = []
  })

  afterEach(() => {
    holder.db?.close()
    rmSync(tmpDir, { recursive: true, force: true })
    vi.mocked(streamText).mockReset()
  })

  const importRunner = (): Promise<typeof import("@/agent/agentRunner")> =>
    import("@/agent/agentRunner")

  const readMessages = (sessionId: string): Array<Record<string, unknown>> =>
    (
      holder
        .db!.prepare(
          "SELECT payload FROM agent_session_entry WHERE session_id = ? AND type = 'message' ORDER BY seq ASC",
        )
        .all(sessionId) as Array<{ payload: string }>
    ).map((entry) => JSON.parse(entry.payload) as Record<string, unknown>)

  it("SessionStart / UserPromptSubmit 注入消息位于用户消息之前，SessionStart 只派发一次", async () => {
    writeHooks({
      SessionStart: [
        {
          hooks: [
            {
              name: "start-ctx",
              command: jsonHook({
                hookSpecificOutput: {
                  hookEventName: "SessionStart",
                  additionalContext: "session-start-ctx",
                },
              }),
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              name: "prompt-ctx",
              command: jsonHook({
                hookSpecificOutput: {
                  hookEventName: "UserPromptSubmit",
                  additionalContext: "prompt-ctx",
                },
              }),
            },
          ],
        },
      ],
    })

    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "a" }])]
    const first = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const messages = readMessages(first.sessionId)
    expect(messages.map((message) => message.role)).toEqual([
      "hookContext",
      "hookContext",
      "user",
      "assistant",
    ])
    expect(messages[0]).toMatchObject({
      event: "SessionStart",
      hookName: "start-ctx",
      text: "session-start-ctx",
    })
    expect(messages[1]).toMatchObject({
      event: "UserPromptSubmit",
      hookName: "prompt-ctx",
      text: "prompt-ctx",
    })

    // 第二轮：SessionStart 不再派发，UserPromptSubmit 仍派发。
    holder.streamResponses = [assistant([{ type: "text", text: "b" }])]
    const second = await agentRunner.send("again", undefined, { sessionId: first.sessionId })
    expect(second.ok).toBe(true)
    const all = readMessages(first.sessionId)
    expect(all.filter((message) => message.event === "SessionStart")).toHaveLength(1)
    expect(all.filter((message) => message.event === "UserPromptSubmit")).toHaveLength(2)
  })

  it("UserPromptSubmit continue:false 拒绝提交且不创建会话", async () => {
    writeHooks({
      UserPromptSubmit: [
        {
          hooks: [
            {
              name: "reject",
              command: jsonHook({ continue: false, stopReason: "maintenance window" }),
            },
          ],
        },
      ],
    })

    const { agentRunner } = await importRunner()
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("maintenance window")
    expect(agentRunner.listSessions()).toHaveLength(0)
    expect(holder.streamResponses).toHaveLength(0)
  })

  it("Stop 在 turn 正常结束时产生落库 Flow 消息", async () => {
    writeHooks({
      Stop: [
        { hooks: [{ name: "stop-audit", command: jsonHook({ systemMessage: "turn-done" }) }] },
      ],
    })

    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "answer" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const messages = readMessages(result.sessionId)
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "hookContext"])
    expect(messages[2]).toMatchObject({ event: "Stop", hookName: "stop-audit", text: "turn-done" })
  })

  it("deleteSession best-effort 派发 SessionEnd（dispose）", async () => {
    const evidence = join(tmpDir, "session-end.jsonl")
    writeHooks({
      SessionEnd: [{ hooks: [{ name: "end-audit", command: `cat >> ${evidence}` }] }],
    })

    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "a" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    agentRunner.deleteSession(result.sessionId)
    await waitFor(
      () => existsSync(evidence) && readFileSync(evidence, "utf8").includes("SessionEnd"),
    )
    const payload = JSON.parse(readFileSync(evidence, "utf8").trim()) as Record<string, unknown>
    expect(payload).toMatchObject({
      hook_event_name: "SessionEnd",
      reason: "dispose",
      session_id: result.sessionId,
    })
  })

  it("disposeAll best-effort 派发 SessionEnd（quit）", async () => {
    const evidence = join(tmpDir, "quit-end.jsonl")
    writeHooks({
      SessionEnd: [{ hooks: [{ name: "end-audit", command: `cat >> ${evidence}` }] }],
    })

    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "a" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)

    agentRunner.disposeAll("quit")
    await waitFor(() => existsSync(evidence) && readFileSync(evidence, "utf8").includes("quit"))
    const payload = JSON.parse(readFileSync(evidence, "utf8").trim()) as Record<string, unknown>
    expect(payload).toMatchObject({ hook_event_name: "SessionEnd", reason: "quit" })
  })

  it("UserPromptSubmit stdin 携带 prompt；SessionStart stdin 携带 source=startup", async () => {
    const promptEvidence = join(tmpDir, "prompt-submit.json")
    const startEvidence = join(tmpDir, "session-start.json")
    writeHooks({
      SessionStart: [
        {
          hooks: [
            {
              name: "start-capture",
              command: `cat > ${startEvidence} && ${jsonHook({ systemMessage: "started" })}`,
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              name: "prompt-capture",
              command: `cat > ${promptEvidence} && ${jsonHook({ systemMessage: "submitted" })}`,
            },
          ],
        },
      ],
    })

    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "a" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)

    const startPayload = JSON.parse(readFileSync(startEvidence, "utf8")) as Record<string, unknown>
    expect(startPayload).toMatchObject({ hook_event_name: "SessionStart", source: "startup" })
    const promptPayload = JSON.parse(readFileSync(promptEvidence, "utf8")) as Record<
      string,
      unknown
    >
    expect(promptPayload).toMatchObject({ hook_event_name: "UserPromptSubmit", prompt: "hello" })
  })

  it("含 hookContext 的会话恢复不丢消息（restoreSession 字段完整）", async () => {
    writeHooks({
      UserPromptSubmit: [
        {
          hooks: [
            {
              name: "prompt-ctx",
              command: jsonHook({
                hookSpecificOutput: {
                  hookEventName: "UserPromptSubmit",
                  additionalContext: "restore-ctx",
                },
              }),
            },
          ],
        },
      ],
    })

    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "a" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const restored = await agentRunner.restoreSession(result.sessionId)
    const hooks = restored.messages.filter((message) => message.role === "hookContext")
    expect(hooks).toHaveLength(1)
    expect(hooks[0]).toMatchObject({
      event: "UserPromptSubmit",
      hookName: "prompt-ctx",
      status: "completed",
      text: "restore-ctx",
    })
  })

  it("UserPromptSubmit hook 失败（伪 JSON）→ fail-open：照常提交，failed 审计存在", async () => {
    writeHooks({
      UserPromptSubmit: [{ hooks: [{ name: "broken", command: "printf '%s' '{ broken'" }] }],
    })

    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant([{ type: "text", text: "a" }])]
    const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const messages = readMessages(result.sessionId)
    expect(messages.map((message) => message.role)).toEqual(["hookContext", "user", "assistant"])
    expect(messages[0]).toMatchObject({
      event: "UserPromptSubmit",
      hookName: "broken",
      status: "failed",
    })
  })

  it("非法 agent.hooks 配置：会话正常启动、hooks 降级为空并告警", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      writeFileSync(
        holder.configPath,
        JSON.stringify({
          agent: {
            hooks: {
              NotAnEvent: [{ hooks: [{ command: "echo x" }] }],
              PreToolUse: [
                { hooks: [{ type: "prompt", command: "" }] },
                { hooks: [{ type: "command", command: "   " }] },
                "not-a-group",
              ],
            },
          },
        }),
      )

      const { agentRunner } = await importRunner()
      holder.streamResponses = [assistant([{ type: "text", text: "ok" }])]
      const result = await agentRunner.send("hello", undefined, { page: "/", cwd: "/tmp" })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      // 降级为空：会话照常落库，无 hookContext 消息。
      const messages = readMessages(result.sessionId)
      expect(messages.map((message) => message.role)).toEqual(["user", "assistant"])
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

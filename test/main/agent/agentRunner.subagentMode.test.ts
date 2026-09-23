import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  AssistantMessage,
  CollaborationMode,
  StopReason,
  SubagentData,
  Usage,
} from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { repeatToolGuard } from "@/agent/guard/repeatToolGuard"
import { hooksManager } from "@/agent/hooks"
import { writeConfigTree } from "../../helpers/configLayout"

// 共享状态：临时 config/appData、内存 DB、脚本化 stream 响应、捕获子代理提示词与门禁模式。
const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as AssistantMessage[],
  capturedSystemPrompts: [] as string[],
  capturedMessages: [] as Array<Array<{ role: string; content: unknown }>>,
  gateModes: [] as Array<CollaborationMode | undefined>,
  gateParentModes: [] as Array<CollaborationMode | undefined>,
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
  }
})

vi.mock("@/services/projectService", () => ({
  projectService: {
    listProjects: () => [
      {
        id: "proj-1",
        name: "test-proj",
        type: "filesystem",
        path: "/tmp",
        updatedAt: new Date().toISOString(),
      },
    ],
  },
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

// 脚本化 streamFn：捕获每次请求的 systemPrompt 与 messages（主 agent 与子代理共用）。
vi.mock("@/agent/stream/aiSdkStreamFn", async () => {
  const { createAssistantMessageEventStream } = await import("@/agent/core/event-stream")
  return {
    createAiSdkStreamFn:
      () => async (_model: unknown, context: { systemPrompt?: string; messages?: unknown[] }) => {
        if (context.systemPrompt) {
          holder.capturedSystemPrompts.push(context.systemPrompt)
        }
        holder.capturedMessages.push(
          (context.messages ?? []) as Array<{ role: string; content: unknown }>,
        )
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

// 权限门控 mock：记录 gate 收到的协作模式，始终放行。
vi.mock("@/agent/permissions/permissionManager", () => ({
  permissionManager: {
    load: vi.fn(),
    getSandboxPolicy: vi.fn(() => "workspace-write"),
    setMcpTools: vi.fn(),
    clearSession: vi.fn(),
    gate: vi.fn(
      (
        _ctx: unknown,
        _sessionId: string | null,
        _signal?: AbortSignal,
        options?: { collaborationMode?: CollaborationMode; parentMode?: CollaborationMode },
      ) => {
        holder.gateModes.push(options?.collaborationMode)
        holder.gateParentModes.push(options?.parentMode)
        return undefined
      },
    ),
  },
}))

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }

const assistant = (
  blocks: AssistantMessage["content"],
  stopReason: StopReason = "stop",
): AssistantMessage => ({
  role: "assistant",
  content: blocks,
  provider: "p",
  model: "m",
  usage: EMPTY_USAGE,
  stopReason,
  timestamp: Date.now(),
})

const assistantText = (text: string): AssistantMessage => assistant([{ type: "text", text }])

const toolCallBlock = (id: string, name: string, args: Record<string, unknown>) => ({
  type: "toolCall" as const,
  id,
  name,
  arguments: args,
})

const resultText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("")

describe("AgentRunner 子代理协作模式隔离", () => {
  let projectDir: string

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), "lx-subagent-mode-"))
    holder.configPath = join(root, "config.json")
    holder.appDataRoot = root
    projectDir = mkdtempSync(join(tmpdir(), "lx-subagent-mode-project-"))
    holder.streamResponses = []
    holder.capturedSystemPrompts = []
    holder.capturedMessages = []
    holder.gateModes = []
    holder.gateParentModes = []
  })

  afterEach(() => {
    if (holder.db) {
      holder.db.close()
      holder.db = null
    }
    rmSync(holder.appDataRoot, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  // 预热一轮：装配 registry（taskDeps 快照子代理模式），并返回可用的 task 工具。
  const primeRunner = async (sessionId: string) => {
    const { agentRunner } = await import("@/agent/agentRunner")
    const runner = agentRunner.getOrCreateRunner(sessionId)
    runner.setCollaborationMode("plan")
    holder.streamResponses = [assistantText("warmup")]
    await runner.send("warmup", undefined, { page: "/", cwd: projectDir })
    const taskTool = runner.getActiveTools().find((tool) => tool.name === "task")
    expect(taskTool).toBeDefined()
    return { runner, taskTool: taskTool! }
  }

  it("主 agent 处于 plan 时子代理按配置的 review 模式装配（提示词与门禁均不继承）", async () => {
    writeConfigTree(holder.configPath, { agent: { subagents: { mode: "review" } } })
    const { taskTool } = await primeRunner("sess-subagent-mode-review")

    // 主 agent 提示词确为 Plan Mode，作为对照基线。
    expect(
      holder.capturedSystemPrompts.some((prompt) =>
        prompt.includes("# Collaboration Mode: Plan Mode"),
      ),
    ).toBe(true)

    holder.capturedSystemPrompts = []
    holder.gateModes = []
    holder.gateParentModes = []
    // 子代理：先调用一个工具（触发子代理门禁），再输出最终结论。
    holder.streamResponses = [
      assistant([toolCallBlock("child-tool-1", "time", {})], "toolUse"),
      assistantText("child done"),
    ]

    const result = await taskTool.execute("parent-task-1", {
      name: "mode-child",
      description: "模式隔离",
      prompt: "检查时间",
    })

    // 提示词：子代理使用配置的 Review Mode，且不残留主 agent 的 Plan Mode。
    const childPrompts = holder.capturedSystemPrompts.filter((prompt) =>
      prompt.includes("You are now a sub-agent"),
    )
    expect(childPrompts.length).toBeGreaterThan(0)
    expect(childPrompts[0]).toContain("# Collaboration Mode: Review Mode")
    expect(childPrompts[0]).not.toContain("# Collaboration Mode: Plan Mode")

    // 门禁：子代理工具调用传入子代理模式 review，而非主 agent 的 plan。
    expect(holder.gateModes).toContain("review")
    expect(holder.gateModes).not.toContain("plan")
    // 父模式基线单独传递：子代理工具调用携带 parentMode = plan（自身模式仍为 review）。
    expect(holder.gateParentModes[holder.gateModes.indexOf("review")]).toBe("plan")

    expect(resultText(result)).toContain("child done")
  })

  it("未配置 mode 时子代理回退 build，不继承主 agent 的 plan", async () => {
    writeConfigTree(holder.configPath, { agent: {} })
    const { taskTool } = await primeRunner("sess-subagent-mode-default")

    holder.capturedSystemPrompts = []
    holder.gateModes = []
    holder.gateParentModes = []
    holder.streamResponses = [
      assistant([toolCallBlock("child-tool-2", "time", {})], "toolUse"),
      assistantText("child ok"),
    ]

    const result = await taskTool.execute("parent-task-2", {
      name: "default-child",
      description: "默认模式",
      prompt: "检查时间",
    })

    const childPrompts = holder.capturedSystemPrompts.filter((prompt) =>
      prompt.includes("You are now a sub-agent"),
    )
    expect(childPrompts.length).toBeGreaterThan(0)
    expect(childPrompts[0]).toContain('<collaboration_mode name="build">')
    expect(childPrompts[0]).not.toContain("# Collaboration Mode: Plan Mode")

    expect(holder.gateModes).toContain("build")
    expect(holder.gateModes).not.toContain("plan")
    // 子代理自身缺省 build，但父模式基线仍以 plan 传递。
    expect(holder.gateParentModes[holder.gateModes.indexOf("build")]).toBe("plan")

    expect(resultText(result)).toContain("child ok")
  })

  it("子代理工具调用共用会话守卫与 Pre/PostToolUse hooks：第 3/5 次提醒、第 7 次硬阻断", async () => {
    writeConfigTree(holder.configPath, { agent: {} })
    const { runner, taskTool } = await primeRunner("sess-subagent-guard")
    const sessionId = runner.getCurrentSessionId()
    expect(sessionId).toBe("sess-subagent-guard")

    const recordSpy = vi.spyOn(repeatToolGuard, "record")
    const dispatchSpy = vi.spyOn(hooksManager, "dispatch")
    try {
      // 单轮内 7 次完全相同的 time 调用：阈值 3/5 提醒，第 7 次硬阻断。
      const repeatedCalls = Array.from({ length: 7 }, (_, index) =>
        toolCallBlock(`guard-${index}`, "time", {}),
      )
      holder.streamResponses = [
        assistant(repeatedCalls, "toolUse"),
        assistantText("guard child done"),
      ]

      const result = await taskTool.execute("parent-guard-1", {
        name: "guard-child",
        description: "重复熔断",
        prompt: "重复调用 time",
      })

      // 子代理工具走同一会话的守卫计数（task 自身透明不计）。
      expect(recordSpy.mock.calls.some(([sid, name]) => sid === sessionId && name === "time")).toBe(
        true,
      )
      // Pre/PostToolUse hook 在子代理工具上派发。
      expect(
        dispatchSpy.mock.calls.some(
          ([input]) => input.event === "PreToolUse" && input.toolName === "time",
        ),
      ).toBe(true)
      expect(
        dispatchSpy.mock.calls.some(
          ([input]) => input.event === "PostToolUse" && input.toolName === "time",
        ),
      ).toBe(true)

      // 6 次放行、第 7 次阻断。
      const subagent = (result.details as { subagent: SubagentData }).subagent
      expect(subagent.steps).toHaveLength(7)
      expect(subagent.steps.filter((step) => step.status === "done")).toHaveLength(6)
      const blockedStep = subagent.steps.find((step) => step.status === "error")
      expect(blockedStep?.result).toContain("Execution blocked")

      // 第 3/5 次提醒随工具结果送达模型（子代理第二次请求的 toolResult 内容）。
      const childRequest = [...holder.capturedMessages]
        .reverse()
        .find((messages) => messages.some((message) => message.role === "toolResult"))
      const toolResultTexts = (childRequest ?? [])
        .filter((message) => message.role === "toolResult")
        .map((message) => {
          if (typeof message.content === "string") return message.content
          if (!Array.isArray(message.content)) return ""
          return message.content
            .map((block) =>
              block && typeof block === "object" && "text" in block
                ? String((block as { text: unknown }).text)
                : "",
            )
            .join("")
        })
      expect(toolResultTexts.some((text) => text.includes("Warning: You are repeating"))).toBe(true)
      expect(toolResultTexts.some((text) => text.includes("Critical Warning"))).toBe(true)
    } finally {
      recordSpy.mockRestore()
      dispatchSpy.mockRestore()
    }
  })
})

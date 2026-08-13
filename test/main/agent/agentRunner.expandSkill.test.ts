import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AssistantMessage, StopReason, TextContent, Usage } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 共享状态：临时 config/appData 路径、内存 DB 句柄与脚本化 stream 响应。
const holder = vi.hoisted(() => ({
  configPath: "",
  appDataRoot: "",
  db: null as import("better-sqlite3").Database | null,
  streamResponses: [] as import("@shared/contracts/agent").AssistantMessage[],
}))

// config/appData 指向临时目录（隔离真实用户配置与 ~/.lx/skills）。
vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getConfigPath: () => holder.configPath,
    getAppDataRoot: () => holder.appDataRoot,
  }
})

// 模型解析回退到固定 Provider。
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
  // 权限配置默认（agentRunner 装配时 permissionManager.load 读取）。
  getPermissionSettings: () => ({
    defaultMode: "default",
    allow: [],
    deny: [],
    ask: [],
  }),
  // 压缩配置（默认值；测试上下文小，阈值不会触发）。
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

// agentSessionService 挂到内存 DB（隔离真实用户库）。
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

// 脚本化的 mock streamFn。
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

const EMPTY_USAGE: Usage = { input: 0, output: 0, totalTokens: 0 }

const assistant = (stopReason: StopReason = "stop"): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text: "回答" }],
  provider: "test",
  model: "test-model",
  usage: EMPTY_USAGE,
  stopReason,
  timestamp: 0,
})

let tmpDir = ""
let cwd = ""

// 写入项目级 skill：<cwd>/.lx/skills/<name>/SKILL.md。
const writeProjectSkill = (
  name: string,
  frontmatter: string,
  body: string,
): { filePath: string; dir: string } => {
  const dir = join(cwd, ".lx", "skills", name)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, "SKILL.md")
  writeFileSync(filePath, `---\n${frontmatter}\n---\n\n${body}\n`)
  return { filePath, dir }
}

beforeEach(async () => {
  vi.resetModules()
  tmpDir = mkdtempSync(join(tmpdir(), "lx-skill-expand-"))
  holder.configPath = join(tmpDir, "config.json")
  holder.appDataRoot = tmpDir
  holder.db = null
  holder.streamResponses = []
  cwd = join(tmpDir, "proj")
  mkdirSync(cwd, { recursive: true })
})

afterEach(() => {
  holder.db?.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

const importRunner = (): Promise<typeof import("@/agent/agentRunner")> =>
  import("@/agent/agentRunner")

// 提取发送后首条用户消息的文本内容。
const firstUserText = (runner: {
  getMessages: () => import("@shared/contracts/agent").AgentMessage[]
}): string => {
  const first = runner.getMessages()[0]
  if (!first || first.role !== "user") return ""
  const content = first.content
  return Array.isArray(content) ? ((content[0] as TextContent)?.text ?? "") : content
}

describe("agentRunner /skill: 展开", () => {
  it("命中 skill：展开为正文块 + args", async () => {
    const { agentRunner } = await importRunner()
    const { dir } = writeProjectSkill(
      "test-skill",
      "name: test-skill\ndescription: 测试",
      "技能正文",
    )
    holder.streamResponses = [assistant()]

    const result = await agentRunner.send("/skill:test-skill 附加", undefined, { page: "/", cwd })
    expect(result.ok).toBe(true)

    const expanded = firstUserText(agentRunner)
    expect(expanded).toContain('<skill name="test-skill"')
    expect(expanded).toContain("References are relative to")
    expect(expanded).toContain("技能正文")
    expect(expanded).toContain(dir)
    expect(expanded).toMatch(/<\/skill>\n\n附加$/)
  })

  it("未命中 skill：原样透传", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant()]

    const result = await agentRunner.send("/skill:missing 参数", undefined, { page: "/", cwd })
    expect(result.ok).toBe(true)
    expect(firstUserText(agentRunner)).toBe("/skill:missing 参数")
  })

  it("disable-model-invocation 的 skill 显式 /skill: 仍生效", async () => {
    const { agentRunner } = await importRunner()
    writeProjectSkill(
      "quiet",
      "name: quiet\ndescription: 仅显式\ndisable-model-invocation: true",
      "隐式正文",
    )
    holder.streamResponses = [assistant()]

    const result = await agentRunner.send("/skill:quiet", undefined, { page: "/", cwd })
    expect(result.ok).toBe(true)
    expect(firstUserText(agentRunner)).toContain("隐式正文")
  })

  it("普通消息不受 /skill: 逻辑影响", async () => {
    const { agentRunner } = await importRunner()
    holder.streamResponses = [assistant()]

    const result = await agentRunner.send("帮我写一段 prompt", undefined, { page: "/", cwd })
    expect(result.ok).toBe(true)
    expect(firstUserText(agentRunner)).toBe("帮我写一段 prompt")
  })
})

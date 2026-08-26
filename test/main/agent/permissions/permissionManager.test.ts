import type { PermissionSettings } from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BeforeToolCallContext } from "@/agent/core/types"

// 配置源：permissionManager 经 settingsService 读取，测试用内存态替换。
const holder = vi.hoisted(() => ({
  permissionSettings: {
    defaultMode: "default",
    allow: [],
    deny: [],
    ask: [],
  } as PermissionSettings,
  capturedRequests: [] as Array<{
    requestId: string
    toolName: string
    summary: string
    mode: PermissionSettings["defaultMode"]
  }>,
}))

vi.mock("@/services/settingsService", () => ({
  getPermissionSettings: () => holder.permissionSettings,
  savePermissionSettings: (input: PermissionSettings) => {
    holder.permissionSettings = input
    return input
  },
}))

import { permissionManager } from "@/agent/permissions/permissionManager"

// 重置单例内部状态（module 级单例，测试间清空）。
const resetManager = (): void => {
  const manager = permissionManager as unknown as {
    settings: PermissionSettings
    parsed: { allow: unknown[]; deny: unknown[]; ask: unknown[] }
    mcpTools: Set<string>
    sessionAllowed: Map<string, Set<string>>
    sessionAllowAll: Set<string>
    pending: Map<string, unknown>
    sendRequest: unknown
    requestSequence: number
  }
  manager.settings = { defaultMode: "default", allow: [], deny: [], ask: [] }
  manager.parsed = { allow: [], deny: [], ask: [] }
  manager.mcpTools = new Set()
  manager.sessionAllowed = new Map()
  manager.sessionAllowAll = new Set()
  manager.pending = new Map()
  manager.sendRequest = null
  manager.requestSequence = 0
  holder.permissionSettings = { defaultMode: "default", allow: [], deny: [], ask: [] }
  holder.capturedRequests = []
}

// 应用权限配置并刷新解析结果。
const applySettings = (settings: PermissionSettings): void => {
  holder.permissionSettings = settings
  permissionManager.load()
}

// 构造 beforeToolCall 上下文。
const gateContext = (toolName: string, args: unknown): BeforeToolCallContext => ({
  assistantMessage: {
    role: "assistant",
    content: [
      {
        type: "toolCall",
        id: "tc1",
        name: toolName,
        arguments: (args ?? {}) as Record<string, unknown>,
      },
    ],
    provider: "p",
    model: "m",
    usage: { input: 0, output: 0, cacheRead: 0, totalTokens: 0 },
    stopReason: "toolUse",
    timestamp: 0,
  },
  toolCall: {
    type: "toolCall",
    id: "tc1",
    name: toolName,
    arguments: (args ?? {}) as Record<string, unknown>,
  },
  args,
  context: { systemPrompt: "", messages: [], tools: [] },
})

describe("permissionManager.evaluate", () => {
  beforeEach(resetManager)
  afterEach(resetManager)

  it("豁免集（web_search 与本地只读工具）永不询问", () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    expect(permissionManager.evaluate("read", { path: "a" })).toBe("allow")
    expect(permissionManager.evaluate("ls", { path: "." })).toBe("allow")
    expect(permissionManager.evaluate("web_search", { query: "x" })).toBe("allow")
    expect(permissionManager.evaluate("time", {})).toBe("allow")
  })

  it("未知/未注册工具默认放行", () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    expect(permissionManager.evaluate("future_tool", {})).toBe("allow")
  })

  it("default 模式未命中规则的门控工具 → ask", () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    expect(permissionManager.evaluate("bash", { command: "ls" })).toBe("ask")
    expect(permissionManager.evaluate("write", { path: "a.ts" })).toBe("ask")
    expect(permissionManager.evaluate("edit", { path: "a.ts" })).toBe("ask")
  })

  it("webfetch 进门控集：default 模式未命中规则 → ask", () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    expect(permissionManager.evaluate("webfetch", { url: "https://example.com" })).toBe("ask")
  })

  it("question 归豁免集：永不询问", () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    expect(permissionManager.evaluate("question", { questions: [{ question: "q" }] })).toBe("allow")
  })

  it("已注册 MCP 工具 → ask；未注册同名 → 放行", () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    permissionManager.setMcpTools(["codegraph_codegraph_search"])
    expect(permissionManager.evaluate("codegraph_codegraph_search", { query: "x" })).toBe("ask")
    expect(permissionManager.evaluate("some_other_mcp", { query: "x" })).toBe("allow")
  })

  it("deny 规则直接拒绝，优先级 deny > ask > allow", () => {
    applySettings({
      defaultMode: "default",
      allow: ["Bash(git status)"],
      deny: ["Bash(git *)"],
      ask: [],
    })
    expect(permissionManager.evaluate("bash", { command: "git status --short" })).toBe("deny")
  })

  it("ask 规则可覆盖 acceptEdits 的自动放行", () => {
    applySettings({
      defaultMode: "acceptEdits",
      allow: ["Bash(git *)"],
      deny: [],
      ask: ["Bash(git status)"],
    })
    expect(permissionManager.evaluate("bash", { command: "git status --short" })).toBe("ask")
  })

  it("acceptEdits 下 write/edit 自动允许，bash 仍询问", () => {
    applySettings({ defaultMode: "acceptEdits", allow: [], deny: [], ask: [] })
    expect(permissionManager.evaluate("write", { path: "a.ts" })).toBe("allow")
    expect(permissionManager.evaluate("edit", { path: "a.ts" })).toBe("allow")
    expect(permissionManager.evaluate("bash", { command: "ls" })).toBe("ask")
  })

  it("bypassPermissions：deny 规则仍生效，仅 allow 语义跳过", () => {
    applySettings({
      defaultMode: "bypassPermissions",
      allow: [],
      deny: ["Bash(rm *)"],
      ask: [],
    })
    // 命中 deny 的敏感命令在 bypass 下仍拦截（保护敏感路径）。
    expect(permissionManager.evaluate("bash", { command: "rm -rf /tmp/x" })).toBe("deny")
    // 未命中 deny 的命令全部放行。
    expect(permissionManager.evaluate("bash", { command: "ls" })).toBe("allow")
    expect(permissionManager.evaluate("edit", { path: "a.ts" })).toBe("allow")
  })

  it("allow 规则命中即放行", () => {
    applySettings({ defaultMode: "default", allow: ["Bash(git status)"], deny: [], ask: [] })
    expect(permissionManager.evaluate("bash", { command: "git status --short" })).toBe("allow")
  })
})

describe("permissionManager.gate", () => {
  beforeEach(() => {
    resetManager()
    permissionManager.attachSender((request) => {
      holder.capturedRequests.push({
        requestId: request.requestId,
        toolName: request.toolName,
        summary: request.summary,
        mode: request.mode,
      })
    })
  })

  it("deny 规则直接 block，不产生请求", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: ["Bash(rm *)"], ask: [] })
    const result = await permissionManager.gate(
      gateContext("bash", { command: "rm -rf /tmp/x" }),
      "s1",
    )
    expect(result).toEqual({ block: true, reason: "Action denied by permission rules." })
    expect(holder.capturedRequests).toHaveLength(0)
  })

  it("allow 直接放行", async () => {
    applySettings({ defaultMode: "acceptEdits", allow: [], deny: [], ask: [] })
    expect(
      await permissionManager.gate(gateContext("write", { path: "a.ts" }), "s1"),
    ).toBeUndefined()
  })

  it("ask：允许后同会话同工具不再询问，新会话恢复", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    const first = permissionManager.gate(gateContext("bash", { command: "npm install" }), "s1")
    expect(holder.capturedRequests).toHaveLength(1)

    permissionManager.respond({
      requestId: holder.capturedRequests[0].requestId,
      decision: "allow",
      rememberForSession: true,
    })
    expect(await first).toBeUndefined()

    // 同会话同工具：不再弹窗，直接放行。
    const second = permissionManager.gate(gateContext("bash", { command: "npm run build" }), "s1")
    expect(await second).toBeUndefined()
    expect(holder.capturedRequests).toHaveLength(1)

    // 新会话：恢复询问。
    const third = permissionManager.gate(gateContext("bash", { command: "npm install" }), "s2")
    expect(holder.capturedRequests).toHaveLength(2)
    permissionManager.respond({
      requestId: holder.capturedRequests[1].requestId,
      decision: "deny",
    })
    expect(await third).toEqual({ block: true, reason: "Action denied by user." })
  })

  it("ask：请求携带工具名/摘要/模式，拒绝回灌 block+reason", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    const pending = permissionManager.gate(
      gateContext("write", { path: "src/a.ts", content: "x" }),
      "s1",
    )
    expect(holder.capturedRequests[0]).toMatchObject({
      toolName: "write",
      summary: "write src/a.ts",
      mode: "default",
    })
    permissionManager.respond({ requestId: holder.capturedRequests[0].requestId, decision: "deny" })
    expect(await pending).toEqual({ block: true, reason: "Action denied by user." })
  })

  it("未知 requestId 响应返回 false", () => {
    expect(permissionManager.respond({ requestId: "unknown", decision: "allow" })).toBe(false)
  })

  it("abort：挂起请求按拒绝处理，pending 清理", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    const controller = new AbortController()
    const pending = permissionManager.gate(
      gateContext("bash", { command: "sleep 100" }),
      "s1",
      controller.signal,
    )
    expect(holder.capturedRequests).toHaveLength(1)
    controller.abort()
    expect(await pending).toEqual({ block: true, reason: "Action denied by user." })
    expect((permissionManager as unknown as { pending: Map<string, unknown> }).pending.size).toBe(0)
  })

  it("clearSession 清理会话内记忆与挂起请求", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    permissionManager.rememberForSession("s1", "write")
    const pending = permissionManager.gate(gateContext("bash", { command: "x" }), "s1")
    expect(holder.capturedRequests).toHaveLength(1)

    permissionManager.clearSession("s1")

    expect(await pending).toEqual({ block: true, reason: "Action denied by user." })
    const manager = permissionManager as unknown as {
      sessionAllowed: Map<string, Set<string>>
      pending: Map<string, unknown>
    }
    expect(manager.sessionAllowed.has("s1")).toBe(false)
    expect(manager.pending.size).toBe(0)

    // 清除后同会话同工具恢复询问。
    const second = permissionManager.gate(gateContext("bash", { command: "x" }), "s1")
    expect(holder.capturedRequests).toHaveLength(2)
    permissionManager.respond({
      requestId: holder.capturedRequests[1].requestId,
      decision: "allow",
    })
    expect(await second).toBeUndefined()
  })

  it("未接线推送目标（sendRequest 为空）时按拒绝处理（fail-safe）", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    ;(permissionManager as unknown as { sendRequest: unknown }).sendRequest = null
    const result = await permissionManager.gate(gateContext("bash", { command: "x" }), "s1")
    expect(result).toEqual({ block: true, reason: "Action denied by user." })
  })

  it("allowAll：会话级放行全部工具，但 deny 规则仍拦截，新会话恢复询问", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: ["Bash(rm *)"], ask: [] })
    // 首次触发 ask：不命中 deny 的命令。
    const first = permissionManager.gate(gateContext("bash", { command: "npm install" }), "s1")
    expect(holder.capturedRequests).toHaveLength(1)

    permissionManager.respond({
      requestId: holder.capturedRequests[0].requestId,
      decision: "allow",
      allowAll: true,
    })
    expect(await first).toBeUndefined()

    // 同会话 allowAll：不命中 deny 的命令放行不弹窗。
    const second = permissionManager.gate(gateContext("bash", { command: "npm run build" }), "s1")
    expect(await second).toBeUndefined()
    expect(holder.capturedRequests).toHaveLength(1)

    // 同会话 allowAll：命中 deny 的命令仍拦截（保护敏感路径）。
    const denied = permissionManager.gate(gateContext("bash", { command: "rm -rf /tmp" }), "s1")
    expect(await denied).toEqual({ block: true, reason: "Action denied by permission rules." })
    expect(holder.capturedRequests).toHaveLength(1)

    // 新会话：恢复询问（不命中 deny 的命令）。
    const third = permissionManager.gate(gateContext("bash", { command: "npm run build" }), "s2")
    expect(holder.capturedRequests).toHaveLength(2)
    permissionManager.respond({ requestId: holder.capturedRequests[1].requestId, decision: "deny" })
    expect(await third).toEqual({ block: true, reason: "Action denied by user." })

    // 新会话 deny 规则仍生效：命中 deny 直接 block，不弹窗。
    const fourth = permissionManager.gate(gateContext("bash", { command: "rm -rf x" }), "s2")
    expect(await fourth).toEqual({ block: true, reason: "Action denied by permission rules." })
    expect(holder.capturedRequests).toHaveLength(2)
  })

  it("clearSession 清理会话级 allow-all，恢复询问", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    const first = permissionManager.gate(gateContext("bash", { command: "x" }), "s1")
    permissionManager.respond({
      requestId: holder.capturedRequests[0].requestId,
      decision: "allow",
      allowAll: true,
    })
    expect(await first).toBeUndefined()

    permissionManager.clearSession("s1")
    const manager = permissionManager as unknown as { sessionAllowAll: Set<string> }
    expect(manager.sessionAllowAll.has("s1")).toBe(false)

    // 清理后同会话恢复询问。
    const second = permissionManager.gate(gateContext("bash", { command: "x" }), "s1")
    expect(holder.capturedRequests).toHaveLength(2)
    permissionManager.respond({
      requestId: holder.capturedRequests[1].requestId,
      decision: "allow",
    })
    expect(await second).toBeUndefined()
  })
})

describe("permissionManager 永久决策写回（G5）", () => {
  beforeEach(() => {
    resetManager()
    permissionManager.attachSender((request) => {
      holder.capturedRequests.push({
        requestId: request.requestId,
        toolName: request.toolName,
        summary: request.summary,
        mode: request.mode,
      })
    })
  })

  it("永久允许：精确参数写回 allow[]，写回后重载直接放行", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    const pending = permissionManager.gate(gateContext("edit", { path: "src/a.ts" }), "s1")
    expect(holder.capturedRequests).toHaveLength(1)
    permissionManager.respond({
      requestId: holder.capturedRequests[0].requestId,
      decision: "allow",
      permanent: true,
    })
    expect(await pending).toBeUndefined()

    expect(holder.permissionSettings.allow).toEqual(["Edit(src/a.ts)"])
    expect(holder.permissionSettings.deny).toEqual([])
    // 重载后相同调用直接 allow，不再弹窗。
    expect(permissionManager.evaluate("edit", { path: "src/a.ts" })).toBe("allow")
    expect(permissionManager.evaluate("edit", { path: "src/b.ts" })).toBe("ask")
  })

  it("永久允许 bash：命令规则写回 allow[]", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    const pending = permissionManager.gate(
      gateContext("bash", { command: "git status --short" }),
      "s1",
    )
    permissionManager.respond({
      requestId: holder.capturedRequests[0].requestId,
      decision: "allow",
      permanent: true,
    })
    expect(await pending).toBeUndefined()
    expect(holder.permissionSettings.allow).toEqual(["Bash(git status --short)"])
  })

  it("永久允许 webfetch：URL 规则写回 allow[]，重载后同前缀 URL 放行", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    const pending = permissionManager.gate(
      gateContext("webfetch", { url: "https://api.example.com/v1" }),
      "s1",
    )
    permissionManager.respond({
      requestId: holder.capturedRequests[0].requestId,
      decision: "allow",
      permanent: true,
    })
    expect(await pending).toBeUndefined()
    expect(holder.permissionSettings.allow).toEqual(["WebFetch(https://api.example.com/v1)"])
    // 重载后同前缀 URL 直接 allow（url.startsWith 语义），不同前缀仍 ask。
    expect(
      permissionManager.evaluate("webfetch", { url: "https://api.example.com/v1/deeper" }),
    ).toBe("allow")
    expect(permissionManager.evaluate("webfetch", { url: "https://api.example.com/v2" })).toBe(
      "ask",
    )
  })

  it("永久拒绝：精确参数写回 deny[]", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    const pending = permissionManager.gate(gateContext("bash", { command: "rm -rf /tmp/x" }), "s1")
    permissionManager.respond({
      requestId: holder.capturedRequests[0].requestId,
      decision: "deny",
      permanent: true,
    })
    expect(await pending).toEqual({ block: true, reason: "Action denied by user." })
    expect(holder.permissionSettings.deny).toEqual(["Bash(rm -rf /tmp/x)"])
    expect(holder.permissionSettings.allow).toEqual([])
    // 重载后相同命令直接拒绝。
    expect(permissionManager.evaluate("bash", { command: "rm -rf /tmp/x" })).toBe("deny")
  })

  it("永久写回去重：同规则已存在时不重复追加", async () => {
    // 规则同时存在于 ask 与 allow：ask 优先弹窗，永久允许时 allow 已有同规则则跳过追加。
    applySettings({
      defaultMode: "default",
      allow: ["Edit(src/a.ts)"],
      deny: [],
      ask: ["Edit(src/a.ts)"],
    })
    const pending = permissionManager.gate(gateContext("edit", { path: "src/a.ts" }), "s1")
    expect(holder.capturedRequests).toHaveLength(1)
    permissionManager.respond({
      requestId: holder.capturedRequests[0].requestId,
      decision: "allow",
      permanent: true,
    })
    expect(await pending).toBeUndefined()
    expect(holder.permissionSettings.allow).toEqual(["Edit(src/a.ts)"])
  })

  it("允许全部不写回配置（仅会话级内存态）", async () => {
    applySettings({ defaultMode: "default", allow: [], deny: [], ask: [] })
    const pending = permissionManager.gate(gateContext("bash", { command: "npm install" }), "s1")
    permissionManager.respond({
      requestId: holder.capturedRequests[0].requestId,
      decision: "allow",
      allowAll: true,
    })
    expect(await pending).toBeUndefined()
    expect(holder.permissionSettings.allow).toEqual([])
    expect(holder.permissionSettings.deny).toEqual([])
  })
})

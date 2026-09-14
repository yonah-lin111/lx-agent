/**
 * review.md 修复的跨模块回归：守卫 → 权限门控 → 规则持久化的链路组合。
 * 单模块细节见 test/main/agent/guard 与 test/main/agent/permissions 下的专职测试。
 */
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
  requestIds: [] as string[],
}))

vi.mock("@/services/settingsService", () => ({
  getPermissionSettings: () => holder.permissionSettings,
  savePermissionSettings: (input: PermissionSettings) => {
    holder.permissionSettings = input
    return input
  },
}))

// hook 派发可控且不读真实配置。
vi.mock("@/agent/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/agent/hooks")>()
  return {
    ...actual,
    hooksManager: {
      ...actual.hooksManager,
      dispatch: async () => ({ runs: [] }),
      getHooks: () => [],
    },
  }
})

import { permissionManager } from "@/agent/permissions/permissionManager"

// 重置单例内部状态（module 级单例，测试间清空）。
const resetManager = (): void => {
  const manager = permissionManager as unknown as {
    settings: PermissionSettings
    parsed: { allow: unknown[]; deny: unknown[]; ask: unknown[] }
    mcpToolsBySession: Map<string, Set<string>>
    sessionAllowed: Map<string, Set<string>>
    sessionAllowAll: Set<string>
    pending: Map<string, unknown>
    sendRequest: unknown
    requestSequence: number
  }
  manager.settings = { defaultMode: "default", allow: [], deny: [], ask: [] }
  manager.parsed = { allow: [], deny: [], ask: [] }
  manager.mcpToolsBySession = new Map()
  manager.sessionAllowed = new Map()
  manager.sessionAllowAll = new Set()
  manager.pending = new Map()
  manager.sendRequest = null
  manager.requestSequence = 0
  holder.permissionSettings = { defaultMode: "default", allow: [], deny: [], ask: [] }
  holder.requestIds = []
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
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
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

describe("review 修复的跨模块回归", () => {
  beforeEach(resetManager)
  afterEach(resetManager)

  it("复合命令绕过变体经权限链路全部 deny（F2）", () => {
    for (const command of [
      "true\ngit reset --hard",
      "bash -lc 'rm -rf /'",
      "eval 'rm -rf /'",
      "'rm' -rf /",
      "RM -rf /",
      "sh -c 'echo p > /tmp/lx-review-out.txt'",
    ]) {
      expect(permissionManager.evaluate("bash", { command })).toBe("deny")
    }
  })

  it("未注册会话的 mcp__ 工具由命名空间兜底进门控（F8）", () => {
    expect(
      permissionManager.evaluate("mcp__fs__read", { path: "a" }, { sessionId: "unknown" }),
    ).toBe("ask")
    expect(permissionManager.evaluate("mcp__core__read", { path: "a" })).toBe("ask")
  })

  it("mcp__ 工具与内置豁免同名也不放行（F8 判定顺序）", () => {
    permissionManager.setMcpTools("s1", [])
    expect(permissionManager.evaluate("mcp__fs__read", {}, { sessionId: "s1" })).toBe("ask")
  })

  it("apply_patch 永久允许写回单路径规则并闭环命中（F4/F13）", async () => {
    const patch = "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-a\n+b\n*** End Patch"
    const other = "*** Begin Patch\n*** Update File: src/b.ts\n@@\n-a\n+b\n*** End Patch"
    permissionManager.attachSender((request) => holder.requestIds.push(request.requestId))

    const pending = permissionManager.gate(gateContext("apply_patch", { patch }), "s1")
    await vi.waitFor(() => expect(holder.requestIds).toHaveLength(1))
    permissionManager.respond({
      requestId: holder.requestIds[0]!,
      decision: "allow",
      permanent: true,
    })
    await pending

    expect(holder.permissionSettings.allow).toContain("apply_patch(src/a.ts)")
    expect(permissionManager.evaluate("apply_patch", { patch })).toBe("allow")
    expect(permissionManager.evaluate("apply_patch", { patch: other })).toBe("ask")
  })
})

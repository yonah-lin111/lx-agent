import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { writeConfigTree } from "../../../helpers/configLayout"

// SDK mock 状态（hoisted：vi.mock 工厂先于模块导入执行）。
const sdk = vi.hoisted(() => ({
  clients: [] as Array<{
    onclose?: () => void
    connectCalls: number
    closeCalls: number
    listToolsCalls: number
  }>,
  // connect 注入桩：默认立即成功；测试内替换为受控 Promise。
  connectImpl: async (_client: unknown): Promise<void> => {},
}))

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    onclose?: () => void
    connectCalls = 0
    closeCalls = 0
    listToolsCalls = 0

    constructor() {
      sdk.clients.push(this)
    }

    async connect(): Promise<void> {
      this.connectCalls += 1
      await sdk.connectImpl(this)
    }

    async close(): Promise<void> {
      this.closeCalls += 1
    }

    async listTools(): Promise<{ tools: Array<Record<string, unknown>> }> {
      this.listToolsCalls += 1
      return { tools: [] }
    }

    setRequestHandler(): void {}

    async callTool(): Promise<unknown> {
      return { content: [], isError: false }
    }
  },
}))

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class MockTransport {
    async close(): Promise<void> {}
  },
}))

const holder = vi.hoisted(() => ({ configPath: "" }))

vi.mock("@/paths", () => ({
  getConfigPath: () => holder.configPath,
}))

import { McpManager, mcpToolName, wrapMcpTool } from "@/agent/mcp/mcpManager"

// 写入测试用 agent.mcp 配置。
const writeConfig = (mcp: Record<string, unknown>): void => {
  writeConfigTree(holder.configPath, { agent: { mcp } })
}

describe("mcpToolName", () => {
  it("使用 mcp__ 命名空间并与内置工具名隔离", () => {
    expect(mcpToolName("fs", "read")).toBe("mcp__fs__read")
    expect(mcpToolName("web", "search")).not.toBe("web_search")
  })

  it("名称段消毒并消除 __ 分隔歧义", () => {
    expect(mcpToolName("my server", "do:thing")).toBe("mcp__my_server__do_thing")
    // server/tool 含连续下划线时不会与另一组合碰撞。
    expect(mcpToolName("a__b", "c")).not.toBe(mcpToolName("a", "b__c"))
    // 首尾下划线被剥离，避免分隔符两侧出现歧义。
    expect(mcpToolName("_a_", "__b__")).toBe("mcp__a__b")
  })
})

describe("wrapMcpTool 输出截断", () => {
  const def = {
    name: "read",
    description: "",
    inputSchema: { type: "object", properties: {} },
  }

  it("超长文本输出头部截断并附加提示", async () => {
    const longText = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join("\n")
    const client = {
      callTool: vi.fn(async () => ({
        content: [{ type: "text", text: longText }],
        isError: false,
      })),
    }
    const tool = wrapMcpTool("fs", def as never, client as never, 1000)
    const result = (await tool.execute("t1", {}, undefined)) as {
      content: Array<{ text: string }>
    }
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("[Output truncated:")
    expect(text.split("\n").length).toBeLessThan(3000)
  })

  it("structuredContent 路径保留且被序列化", async () => {
    const client = {
      callTool: vi.fn(async () => ({
        content: [],
        structuredContent: { ok: true },
        isError: false,
      })),
    }
    const tool = wrapMcpTool("fs", def as never, client as never, 1000)
    const result = (await tool.execute("t1", {}, undefined)) as {
      content: Array<{ text: string }>
    }
    expect(result.content[0]?.text).toBe('{"ok":true}')
  })
})

describe("McpManager 连接并发", () => {
  let tmpDir: string
  let gates: Array<() => void>

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mcp-test-"))
    holder.configPath = join(tmpDir, "config.json")
    sdk.clients.length = 0
    sdk.connectImpl = async () => {}
    gates = []
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // 受控 connect：返回 Promise 并暴露释放函数。
  const gateNextConnect = (): void => {
    sdk.connectImpl = () =>
      new Promise<void>((resolve) => {
        gates.push(resolve)
      })
  }

  it("并发 ensureConnected 只连接一次", async () => {
    writeConfig({ fs: { command: ["node", "server.js"] } })
    const manager = new McpManager()
    await Promise.all([manager.ensureConnected(), manager.ensureConnected()])
    expect(sdk.clients).toHaveLength(1)
  })

  it("reload 与 ensureConnected 并发时不重复连接，过期 client 被关闭", async () => {
    writeConfig({ fs: { command: ["node", "server.js"] } })
    gateNextConnect()
    const manager = new McpManager()

    const connecting = manager.ensureConnected()
    const reloading = manager.reloadAndReconnect()
    const shared = manager.ensureConnected()
    // 旧世代 client 建连完成后才由 reload 建立新世代 client。
    await vi.waitFor(() => expect(sdk.clients).toHaveLength(2))

    gates[0]?.()
    gates[1]?.()
    await Promise.all([connecting, reloading, shared])

    // 只构造两个 client：旧世代一个（被关闭）、新世代一个（保留）。
    expect(sdk.clients).toHaveLength(2)
    expect(sdk.clients[0]?.connectCalls).toBe(1)
    expect(sdk.clients[0]?.closeCalls).toBeGreaterThanOrEqual(1)
    expect(sdk.clients[1]?.closeCalls).toBe(0)
    expect(manager.getStatus()).toMatchObject([{ name: "fs", status: "connected" }])
    // 旧 client 不得参与工具句柄。
    expect(manager.getTools()).toHaveLength(0)
  })

  it("旧 client 的 onclose 不误杀新连接", async () => {
    writeConfig({ fs: { command: ["node", "server.js"] } })
    const manager = new McpManager()
    await manager.ensureConnected()
    const oldClient = sdk.clients[0]

    await manager.reloadAndReconnect()
    const newClient = sdk.clients[1]
    expect(manager.getStatus()).toMatchObject([{ status: "connected" }])

    oldClient?.onclose?.()
    expect(manager.getStatus()).toMatchObject([{ status: "connected" }])

    newClient?.onclose?.()
    expect(manager.getStatus()).toMatchObject([{ status: "failed" }])
  })
})

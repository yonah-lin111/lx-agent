import { describe, expect, it } from "vitest"
import type { LspClient } from "@/agent/lsp/client"
import { LspManager } from "@/agent/lsp/lspManager"
import type { LspServerSpec } from "@/agent/lsp/server"

// 测试桩：记录 spawn/关闭次数，可注入初始化失败。
class FakeClient {
  initializeCalls = 0
  shutdownCalls = 0
  shouldFail = false

  constructor(readonly spec: LspServerSpec) {}

  async initialize(): Promise<void> {
    this.initializeCalls += 1
    if (this.shouldFail) throw new Error("init failed")
  }

  async shutdown(): Promise<void> {
    this.shutdownCalls += 1
  }

  get isCrashed(): boolean {
    return false
  }

  getStartupError(): string | null {
    return null
  }
}

const makeManager = (created: FakeClient[] = [], shouldFail = false): LspManager =>
  new LspManager((spec) => {
    const client = new FakeClient(spec)
    client.shouldFail = shouldFail
    created.push(client)
    return client as unknown as LspClient
  })

describe("LspManager", () => {
  it("同会话同语言缓存复用（getClient 两次只 spawn 一次）", async () => {
    const created: FakeClient[] = []
    const manager = makeManager(created)
    const file = "/tmp/lx-session/foo.ts"
    const first = await manager.getClient("s1", file, "/tmp/lx-session")
    const second = await manager.getClient("s1", file, "/tmp/lx-session")
    expect("client" in first && "client" in second).toBe(true)
    expect(created).toHaveLength(1)
    expect(created[0]?.initializeCalls).toBe(1)
  })

  it("同会话不同语言各自 spawn", async () => {
    const created: FakeClient[] = []
    const manager = makeManager(created)
    await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    await manager.getClient("s1", "/tmp/lx-session/b.py", "/tmp/lx-session")
    expect(created).toHaveLength(2)
  })

  it("clearSession 关闭该会话全部 client；再取同会话重新 spawn", async () => {
    const created: FakeClient[] = []
    const manager = makeManager(created)
    await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    await manager.getClient("s1", "/tmp/lx-session/b.py", "/tmp/lx-session")
    expect(created).toHaveLength(2)
    manager.clearSession("s1")
    expect(created.every((client) => client.shutdownCalls === 1)).toBe(true)
    await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    expect(created).toHaveLength(3)
  })

  it("clearSession 只清指定会话（其他会话 client 不受影响）", async () => {
    const created: FakeClient[] = []
    const manager = makeManager(created)
    await manager.getClient("s1", "/tmp/a/a.ts", "/tmp/a")
    await manager.getClient("s2", "/tmp/b/b.ts", "/tmp/b")
    manager.clearSession("s1")
    expect(created[0]?.shutdownCalls).toBe(1)
    expect(created[1]?.shutdownCalls).toBe(0)
  })

  it("dispose 关闭全部会话 client", async () => {
    const created: FakeClient[] = []
    const manager = makeManager(created)
    await manager.getClient("s1", "/tmp/a/a.ts", "/tmp/a")
    await manager.getClient("s2", "/tmp/b/b.ts", "/tmp/b")
    await manager.dispose()
    expect(created.every((client) => client.shutdownCalls === 1)).toBe(true)
  })

  it("未知扩展名返回错误", async () => {
    const manager = makeManager()
    const result = await manager.getClient("s1", "/tmp/lx-session/a.xyz", "/tmp/lx-session")
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toContain("不支持的文件类型")
    }
  })

  it("有映射无启动器（.go）返回错误", async () => {
    const manager = makeManager()
    const result = await manager.getClient("s1", "/tmp/lx-session/a.go", "/tmp/lx-session")
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toContain("未提供 LSP server 启动器")
    }
  })

  it("初始化失败返回错误并关闭 client，且不缓存", async () => {
    const created: FakeClient[] = []
    const manager = makeManager(created, true)
    const result = await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toContain("init failed")
    }
    expect(created[0]?.shutdownCalls).toBe(1)
    // 失败不缓存：再次调用重新 spawn。
    await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    expect(created).toHaveLength(2)
  })
})

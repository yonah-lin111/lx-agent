import { describe, expect, it } from "vitest"
import type { LspClient } from "@/agent/lsp/client"
import { LspManager, type PackageInstaller } from "@/agent/lsp/lspManager"
import type { LspServerSpec } from "@/agent/lsp/server"

// 测试桩：记录 spawn/关闭次数，可注入初始化失败（普通错误或 ENOENT 命令缺失）。
class FakeClient {
  initializeCalls = 0
  shutdownCalls = 0
  shouldFail = false
  failWithEnOent = false

  constructor(readonly spec: LspServerSpec) {}

  async initialize(): Promise<void> {
    this.initializeCalls += 1
    if (this.failWithEnOent) {
      const error = Object.assign(new Error(`spawn ${this.spec.command} ENOENT`), {
        code: "ENOENT",
      })
      throw error
    }
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

interface MakeManagerOptions {
  // 从首个 client 起连续多少个 client 以 ENOENT 失败（懒安装触发）。
  enoentClients?: number
  shouldFail?: boolean
  installer?: PackageInstaller
}

const makeManager = (
  created: FakeClient[] = [],
  options: MakeManagerOptions = {},
): { manager: LspManager; installs: string[] } => {
  const { enoentClients = 0, shouldFail = false, installer } = options
  const installs: string[] = []
  let enoentLeft = enoentClients
  const manager = new LspManager(
    (spec) => {
      const client = new FakeClient(spec)
      client.shouldFail = shouldFail
      if (enoentLeft > 0) {
        enoentLeft--
        client.failWithEnOent = true
      }
      created.push(client)
      return client as unknown as LspClient
    },
    installer ??
      (async (packageName) => {
        installs.push(packageName)
        return true
      }),
  )
  return { manager, installs }
}

describe("LspManager", () => {
  it("同会话同语言缓存复用（getClient 两次只 spawn 一次）", async () => {
    const created: FakeClient[] = []
    const { manager } = makeManager(created)
    const file = "/tmp/lx-session/foo.ts"
    const first = await manager.getClient("s1", file, "/tmp/lx-session")
    const second = await manager.getClient("s1", file, "/tmp/lx-session")
    expect("client" in first && "client" in second).toBe(true)
    expect(created).toHaveLength(1)
    expect(created[0]?.initializeCalls).toBe(1)
  })

  it("同会话不同语言各自 spawn", async () => {
    const created: FakeClient[] = []
    const { manager } = makeManager(created)
    await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    await manager.getClient("s1", "/tmp/lx-session/b.py", "/tmp/lx-session")
    expect(created).toHaveLength(2)
  })

  it("clearSession 关闭该会话全部 client；再取同会话重新 spawn", async () => {
    const created: FakeClient[] = []
    const { manager } = makeManager(created)
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
    const { manager } = makeManager(created)
    await manager.getClient("s1", "/tmp/a/a.ts", "/tmp/a")
    await manager.getClient("s2", "/tmp/b/b.ts", "/tmp/b")
    manager.clearSession("s1")
    expect(created[0]?.shutdownCalls).toBe(1)
    expect(created[1]?.shutdownCalls).toBe(0)
  })

  it("dispose 关闭全部会话 client", async () => {
    const created: FakeClient[] = []
    const { manager } = makeManager(created)
    await manager.getClient("s1", "/tmp/a/a.ts", "/tmp/a")
    await manager.getClient("s2", "/tmp/b/b.ts", "/tmp/b")
    await manager.dispose()
    expect(created.every((client) => client.shutdownCalls === 1)).toBe(true)
  })

  it("未知扩展名返回错误", async () => {
    const { manager } = makeManager()
    const result = await manager.getClient("s1", "/tmp/lx-session/a.xyz", "/tmp/lx-session")
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toContain("不支持的文件类型")
    }
  })

  it("有映射无启动器（.go）返回错误", async () => {
    const { manager } = makeManager()
    const result = await manager.getClient("s1", "/tmp/lx-session/a.go", "/tmp/lx-session")
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toContain("未提供 LSP server 启动器")
    }
  })

  it("初始化失败返回错误并关闭 client，且不缓存", async () => {
    const created: FakeClient[] = []
    const { manager, installs } = makeManager(created, { shouldFail: true })
    const result = await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toContain("init failed")
    }
    // 非命令缺失（普通启动失败）不触发懒安装。
    expect(installs).toEqual([])
    expect(created[0]?.shutdownCalls).toBe(1)
    // 失败不缓存：再次调用重新 spawn。
    await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    expect(created).toHaveLength(2)
  })

  it("命令缺失（ENOENT）时懒安装后重建 client 成功", async () => {
    const created: FakeClient[] = []
    const { manager, installs } = makeManager(created, { enoentClients: 1 })
    const result = await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    expect("client" in result).toBe(true)
    expect(installs).toEqual(["typescript-language-server"])
    // 首 client ENOENT 失败（关闭）后重建成功。
    expect(created[0]?.failWithEnOent).toBe(true)
    expect(created[0]?.shutdownCalls).toBe(1)
    expect(created[1]?.initializeCalls).toBe(1)
    expect(created).toHaveLength(2)
  })

  it("懒安装失败回退手动安装提示", async () => {
    let installCalls = 0
    const { manager } = makeManager([], {
      enoentClients: 1,
      installer: async () => {
        installCalls += 1
        return false
      },
    })
    const result = await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    expect("error" in result).toBe(true)
    expect(installCalls).toBe(1)
    if ("error" in result) {
      expect(result.error).toContain("自动安装失败")
      expect(result.error).toContain("npm install -g typescript-language-server")
    }
  })

  it("并行缺失并发去重安装（同一包只装一次）", async () => {
    const created: FakeClient[] = []
    const { manager, installs } = makeManager(created, { enoentClients: 2 })
    const [first, second] = await Promise.all([
      manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session"),
      manager.getClient("s1", "/tmp/lx-session/b.ts", "/tmp/lx-session"),
    ])
    expect("client" in first && "client" in second).toBe(true)
    expect(installs).toEqual(["typescript-language-server"])
    // 两个 ENOENT 失败 client + 各自重建成功 client。
    expect(created).toHaveLength(4)
  })
})

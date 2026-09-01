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
  enoentClients?: number
  shouldFail?: boolean
  installer?: PackageInstaller
  settings?: () => any
}

const makeManager = (
  created: FakeClient[] = [],
  options: MakeManagerOptions = {},
): { manager: LspManager; installs: string[] } => {
  const { enoentClients = 0, shouldFail = false, installer, settings } = options
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
    settings ?? (() => ({ languages: {} })),
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
    // 非命令缺失（普通启动失败）不触发安装。
    expect(installs).toEqual([])
    expect(created[0]?.shutdownCalls).toBe(1)
    // 失败不缓存：再次调用重新 spawn。
    await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    expect(created).toHaveLength(2)
  })

  it("命令缺失（ENOENT）时直接返回错误，不自动触发 npm 安装", async () => {
    const created: FakeClient[] = []
    const { manager, installs } = makeManager(created, { enoentClients: 1 })
    const result = await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    expect("error" in result).toBe(true)
    // 严禁自动执行 npm install
    expect(installs).toEqual([])
    expect(created[0]?.failWithEnOent).toBe(true)
    expect(created[0]?.shutdownCalls).toBe(1)
  })

  it("设置中禁用语言时 getClient 直接返回禁用错误", async () => {
    const created: FakeClient[] = []
    const { manager } = makeManager(created, {
      settings: () => ({
        languages: {
          typescript: { enabled: false },
        },
      }),
    })
    const result = await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    expect("error" in result).toBe(true)
    if ("error" in result) {
      expect(result.error).toContain("已在设置中禁用")
    }
    expect(created).toHaveLength(0)
  })

  it("支持使用自定义路径与参数启动", async () => {
    const created: FakeClient[] = []
    const { manager } = makeManager(created, {
      settings: () => ({
        languages: {
          typescript: {
            enabled: true,
            customPath: "/custom/bin/ts-lsp",
            args: ["--custom-arg"],
          },
        },
      }),
    })
    const result = await manager.getClient("s1", "/tmp/lx-session/a.ts", "/tmp/lx-session")
    expect("client" in result).toBe(true)
    expect(created[0]?.spec.command).toBe("/custom/bin/ts-lsp")
    expect(created[0]?.spec.args).toEqual(["--custom-arg"])
  })
})

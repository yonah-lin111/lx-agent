import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { GAME_PROTOCOL, GAME_WEBVIEW_PARTITION } from "@shared/contracts/game"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handleProtocol = vi.fn()
const handlePartitionProtocol = vi.fn()

vi.mock("electron", () => ({
  protocol: { handle: handleProtocol },
  session: { fromPartition: () => ({ protocol: { handle: handlePartitionProtocol } }) },
}))
vi.mock("@/lib/emulatorAssets", () => ({
  getEmulatorAssetsDir: () => resolve(process.cwd(), "resources", "emulator"),
}))
vi.mock("@/services/gameRomService", () => ({
  gameRomService: {
    getRomFilePath: vi.fn(),
    readSave: vi.fn(),
  },
}))

// 仅使用 request.url 的最小 Request 替身（自定义 scheme 无法用全局 Request 构造）。
const createRequest = (url: string): Request => ({ url }) as unknown as Request

const captureHandler = async (): Promise<(request: Request) => Response> => {
  const { registerGameProtocol } = await import("@/protocols/gameProtocol")
  registerGameProtocol()
  const [, handler] = handleProtocol.mock.calls[0] as [string, (request: Request) => Response]
  return handler
}

beforeEach(() => {
  handleProtocol.mockClear()
  handlePartitionProtocol.mockClear()
})

describe("gameProtocol", () => {
  it("协议常量规范为 lx-game，并在默认与 webview 分区 session 上都注册 handler", async () => {
    expect(GAME_PROTOCOL).toBe("lx-game")
    expect(GAME_WEBVIEW_PARTITION).toBe("persist:lx-game")

    await captureHandler()

    expect(handleProtocol).toHaveBeenCalledWith(GAME_PROTOCOL, expect.any(Function))
    expect(handlePartitionProtocol).toHaveBeenCalledWith(GAME_PROTOCOL, expect.any(Function))
  })

  it("宿主页返回 HTML 并附带放行 WASM 的独立 CSP", async () => {
    const handler = await captureHandler()

    const response = handler(createRequest("lx-game://emulator/wrapper.html"))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    const csp = response.headers.get("content-security-policy") ?? ""
    expect(csp).toContain("'wasm-unsafe-eval'")
    // EmulatorJS 解包 7z 核心与经 blob 装载核心脚本/实例化 wasm 所需。
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:")
    expect(csp).toContain("connect-src 'self' blob:")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(html).toContain("data/loader.js")
  })

  it("静态资产按扩展名返回 MIME，拒绝非 emulator 主机", async () => {
    const handler = await captureHandler()

    const script = handler(createRequest("lx-game://emulator/data/loader.js"))
    expect(script.status).toBe(200)
    expect(script.headers.get("content-type")).toContain("text/javascript")

    const otherHost = handler(createRequest("lx-game://evil/rom/1"))
    expect(otherHost.status).toBe(400)
  })

  it("目录遍历与不存在的资产不会读到资产目录之外的文件", async () => {
    const handler = await captureHandler()

    const traversal = handler(createRequest("lx-game://emulator/data/../../../../etc/passwd"))
    const encodedTraversal = handler(createRequest("lx-game://emulator/%2e%2e/%2e%2e/etc/passwd"))

    expect([403, 404]).toContain(traversal.status)
    expect([403, 404]).toContain(encodedTraversal.status)
    expect(await traversal.text()).not.toContain("root:")
    expect(await encodedTraversal.text()).not.toContain("root:")

    expect(handler(createRequest("lx-game://emulator/data/missing.js")).status).toBe(404)
  })

  it("ROM 路由只接受条目 id，返回文件字节", async () => {
    const { gameRomService } = await import("@/services/gameRomService")
    const romPath = join(mkdtempSync(join(tmpdir(), "lx-game-protocol-")), "1.gba")
    writeFileSync(romPath, Buffer.from([7, 8, 9]))
    vi.mocked(gameRomService.getRomFilePath).mockReturnValue(romPath)

    const handler = await captureHandler()

    const response = handler(createRequest("lx-game://emulator/rom/1"))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/octet-stream")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]))

    expect(handler(createRequest("lx-game://emulator/rom/abc")).status).toBe(400)
    expect(handler(createRequest("lx-game://emulator/rom/0")).status).toBe(400)
  })

  it("ROM 缺失时返回 404", async () => {
    const { gameRomService } = await import("@/services/gameRomService")
    vi.mocked(gameRomService.getRomFilePath).mockReturnValue(null)

    const handler = await captureHandler()
    expect(handler(createRequest("lx-game://emulator/rom/1")).status).toBe(404)
  })

  it("存档路由返回 SRAM 字节，缺失或条目不存在时返回 404", async () => {
    const { gameRomService } = await import("@/services/gameRomService")
    vi.mocked(gameRomService.readSave).mockReturnValue(Buffer.from([1, 2, 3]))

    const handler = await captureHandler()
    const response = handler(createRequest("lx-game://emulator/sav/2"))
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))

    vi.mocked(gameRomService.readSave).mockReturnValue(null)
    expect(handler(createRequest("lx-game://emulator/sav/2")).status).toBe(404)

    vi.mocked(gameRomService.readSave).mockImplementation(() => {
      throw new Error("GAME_ENTRY_NOT_FOUND")
    })
    expect(handler(createRequest("lx-game://emulator/sav/9")).status).toBe(404)
  })
})

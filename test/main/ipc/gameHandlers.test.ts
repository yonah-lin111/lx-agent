import { GAME_CHANNELS } from "@shared/ipc/gameChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()
const showOpenDialog = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle }, dialog: { showOpenDialog } }))
vi.mock("@/lib/emulatorAssets", () => ({
  getEmulatorAssetsDir: () => "/tmp/lx-emulator-assets",
}))
vi.mock("@/services/gameRomService", () => ({
  gameRomService: {
    list: vi.fn(),
    importFiles: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    markPlayed: vi.fn(),
    writeSave: vi.fn(),
  },
}))

const registerHandlers = async (): Promise<
  Map<string, (event: unknown, ...args: unknown[]) => unknown>
> => {
  const { registerGameHandlers } = await import("@/ipc/gameHandlers")
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  handle.mockImplementation((channel: string, handler) => {
    handlers.set(channel, handler)
  })
  registerGameHandlers()
  return handlers
}

beforeEach(() => {
  handle.mockClear()
  showOpenDialog.mockReset()
})

describe("game IPC handlers", () => {
  it("为共享游戏 channel 注册全部 handler", async () => {
    await registerHandlers()

    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(GAME_CHANNELS).sort(),
    )
  })

  it("导入弹窗取消时返回空数组，不触发导入", async () => {
    const { gameRomService } = await import("@/services/gameRomService")
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    const handlers = await registerHandlers()
    const result = await handlers.get(GAME_CHANNELS.importFromDialog)?.({})

    expect(result).toEqual([])
    expect(gameRomService.importFiles).not.toHaveBeenCalled()
  })

  it("导入弹窗选中文件后转发给 service 并透传结果", async () => {
    const { gameRomService } = await import("@/services/gameRomService")
    const results = [{ status: "imported", fileName: "demo.gba" }]
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/tmp/demo.gba"] })
    vi.mocked(gameRomService.importFiles).mockReturnValue(results as never)

    const handlers = await registerHandlers()
    const result = await handlers.get(GAME_CHANNELS.importFromDialog)?.({})

    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ properties: ["openFile", "multiSelections"] }),
    )
    expect(gameRomService.importFiles).toHaveBeenCalledWith(["/tmp/demo.gba"])
    expect(result).toEqual(results)
  })

  it("重命名 / 删除 / 标记游玩 / 写入存档转发给 service", async () => {
    const { gameRomService } = await import("@/services/gameRomService")
    const handlers = await registerHandlers()
    const saveBytes = new Uint8Array([1, 2, 3])

    handlers.get(GAME_CHANNELS.list)?.({})
    handlers.get(GAME_CHANNELS.rename)?.({}, 3, "新标题")
    handlers.get(GAME_CHANNELS.remove)?.({}, 3)
    handlers.get(GAME_CHANNELS.markPlayed)?.({}, 3)
    handlers.get(GAME_CHANNELS.writeSave)?.({}, 3, saveBytes)

    expect(gameRomService.list).toHaveBeenCalledTimes(1)
    expect(gameRomService.rename).toHaveBeenCalledWith(3, "新标题")
    expect(gameRomService.remove).toHaveBeenCalledWith(3)
    expect(gameRomService.markPlayed).toHaveBeenCalledWith(3)
    expect(gameRomService.writeSave).toHaveBeenCalledWith(3, saveBytes)
  })

  it("运行时配置返回 guest preload 的 file:// URL", async () => {
    const handlers = await registerHandlers()

    const config = (await handlers.get(GAME_CHANNELS.getRuntimeConfig)?.({})) as {
      guestPreloadUrl: string
    }

    expect(config.guestPreloadUrl.startsWith("file://")).toBe(true)
    expect(config.guestPreloadUrl.endsWith("/tmp/lx-emulator-assets/guest-preload.cjs")).toBe(true)
  })
})

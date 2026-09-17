// @vitest-environment jsdom
import type { GameRomEntry } from "@shared/contracts/game"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { act } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GameStage } from "@/features/game/components/GameStage"

const createEntry = (patch: Partial<GameRomEntry> = {}): GameRomEntry => ({
  id: 3,
  title: "Demo Game",
  romHash: "b".repeat(64),
  romSize: 1024,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
  lastPlayedAt: null,
  ...patch,
})

const createApiMock = () => ({
  getRuntimeConfig: vi.fn().mockResolvedValue({ guestPreloadUrl: "file:///tmp/guest-preload.cjs" }),
  markPlayed: vi.fn().mockResolvedValue(createEntry()),
  writeSave: vi.fn().mockResolvedValue(undefined),
})

const installApi = (api: ReturnType<typeof createApiMock>): void => {
  // @ts-expect-error Mock window.api
  window.api = { game: api }
}

// 等待 webview 挂载并注入 Electron 的 send 方法替身。
const mountStage = async (
  onExit = vi.fn(),
): Promise<{ webview: HTMLElement; send: ReturnType<typeof vi.fn>; onExit: typeof onExit }> => {
  render(<GameStage entry={createEntry()} onExit={onExit} />)

  const webview = await waitFor(() => {
    const element = document.querySelector("webview")
    expect(element).not.toBeNull()
    // webview 挂载后由 effect 异步写入 src，需等待属性出现再断言，避免竞态。
    expect(element?.getAttribute("src")).toBeTruthy()
    return element as HTMLElement
  })

  const send = vi.fn()
  Object.assign(webview, { send })
  return { webview, send, onExit }
}

const dispatchGuestMessage = (webview: HTMLElement, payload: unknown): void => {
  const event = new Event("ipc-message")
  Object.assign(event, { channel: "lx-game-guest", args: [payload] })
  act(() => {
    webview.dispatchEvent(event)
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("GameStage", () => {
  it("按运行时配置挂载 webview 并拼装 wrapper URL", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview } = await mountStage()

    const src = webview.getAttribute("src") ?? ""
    expect(src.startsWith("lx-game://emulator/wrapper.html?")).toBe(true)
    expect(src).toContain("entry=3")
    expect(src).toContain("lang=")
    expect(src).toContain("color=")
    expect(webview.getAttribute("preload")).toBe("file:///tmp/guest-preload.cjs")
  })

  it("收到 started 上报后标记最近游玩", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview } = await mountStage()
    dispatchGuestMessage(webview, { type: "started" })

    await waitFor(() => {
      expect(api.markPlayed).toHaveBeenCalledWith(3)
    })
  })

  it("收到 save 上报后写入应用侧存档", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview } = await mountStage()
    dispatchGuestMessage(webview, { type: "save", data: new Uint8Array([1, 2, 3]) })

    await waitFor(() => {
      expect(api.writeSave).toHaveBeenCalledWith(3, new Uint8Array([1, 2, 3]))
    })
  })

  it("收到 speed 上报后顶部徽标显示当前倍速", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview } = await mountStage()
    expect(screen.getByText("Speed ×1")).toBeDefined()

    dispatchGuestMessage(webview, { type: "speed", ratio: 8 })

    expect(screen.getByText("Speed ×8")).toBeDefined()
  })

  it("ESC 退出：先请求 flush，收到回执后退出", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview, send, onExit } = await mountStage()
    dispatchGuestMessage(webview, { type: "escape" })

    expect(send).toHaveBeenCalledWith("lx-game-host", { type: "flush" })
    expect(onExit).not.toHaveBeenCalled()

    dispatchGuestMessage(webview, { type: "flushed" })

    await waitFor(() => {
      expect(onExit).toHaveBeenCalledTimes(1)
    })
  })

  it("卸载兜底：请求 flush 并把随后的 SRAM 落盘", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview, send } = await mountStage()
    cleanup()

    expect(send).toHaveBeenCalledWith("lx-game-host", { type: "flush" })

    const event = new Event("ipc-message")
    Object.assign(event, {
      channel: "lx-game-guest",
      args: [{ type: "save", data: new Uint8Array([9, 9]) }],
    })
    webview.dispatchEvent(event)

    await waitFor(() => {
      expect(api.writeSave).toHaveBeenCalledWith(3, new Uint8Array([9, 9]))
    })
  })

  it("guest 迟迟不就绪时超时进入错误态", async () => {
    vi.useFakeTimers()
    try {
      const api = createApiMock()
      installApi(api)

      render(<GameStage entry={createEntry()} onExit={vi.fn()} />)
      await act(async () => {})
      expect(document.querySelector("webview")).not.toBeNull()

      await act(async () => {
        vi.advanceTimersByTime(20000)
      })

      expect(screen.getByText("Failed to load the emulator")).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("运行时错误上报后展示错误态与重试入口", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview } = await mountStage()
    dispatchGuestMessage(webview, { type: "error", message: "boom" })

    expect(await screen.findByText("Failed to load the emulator")).toBeDefined()
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined()
  })

  it("运行时配置读取失败时展示错误态", async () => {
    const api = createApiMock()
    api.getRuntimeConfig.mockRejectedValue(new Error("no config"))
    installApi(api)

    render(<GameStage entry={createEntry()} onExit={vi.fn()} />)

    expect(await screen.findByText("Failed to load the emulator")).toBeDefined()
  })
})

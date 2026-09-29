// @vitest-environment jsdom
import type { GameRomEntry } from "@shared/contracts/game"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GameStage, type GameStageProps } from "@/features/game/components/GameStage"

const createEntry = (patch: Partial<GameRomEntry> = {}): GameRomEntry => ({
  id: 3,
  title: "Demo Game",
  romHash: "b".repeat(64),
  romSize: 1024,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
  lastPlayedAt: null,
  keymap: null,
  ...patch,
})

const createApiMock = () => ({
  getRuntimeConfig: vi.fn().mockResolvedValue({ guestPreloadUrl: "file:///tmp/guest-preload.cjs" }),
  markPlayed: vi.fn().mockResolvedValue(createEntry()),
  writeSave: vi.fn().mockResolvedValue(undefined),
  writeState: vi.fn().mockResolvedValue(undefined),
  saveKeymap: vi.fn().mockResolvedValue(createEntry()),
})

// 从 wrapper URL 中解析宿主下发的键位表。
const readKeysParam = (src: string): Record<string, number> => {
  const query = src.split("?")[1] ?? ""
  return JSON.parse(new URLSearchParams(query).get("keys") ?? "{}")
}

const installApi = (api: ReturnType<typeof createApiMock>): void => {
  // @ts-expect-error Mock window.api
  window.api = { game: api }
}

type StageOverrides = Partial<GameStageProps>

// 等待 webview 挂载并注入 Electron 的 send 方法替身。
const mountStage = async (
  overrides: StageOverrides = {},
): Promise<{
  webview: HTMLElement
  send: ReturnType<typeof vi.fn>
  onMinimize: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
  rerender: (next: StageOverrides) => void
}> => {
  const onMinimize = (overrides.onMinimize ?? vi.fn()) as ReturnType<typeof vi.fn>
  const onClose = (overrides.onClose ?? vi.fn()) as ReturnType<typeof vi.fn>
  const props: GameStageProps = {
    entry: createEntry(),
    isSuspended: false,
    onMinimize: onMinimize as GameStageProps["onMinimize"],
    onClose: onClose as GameStageProps["onClose"],
    ...overrides,
  }

  const view = render(<GameStage {...props} />)

  const webview = await waitFor(() => {
    const element = document.querySelector("webview")
    expect(element).not.toBeNull()
    // webview 挂载后由 effect 异步写入 src，需等待属性出现再断言，避免竞态。
    expect(element?.getAttribute("src")).toBeTruthy()
    return element as HTMLElement
  })

  const send = vi.fn()
  Object.assign(webview, { send })
  return {
    webview,
    send,
    onMinimize,
    onClose,
    rerender: (next) => view.rerender(<GameStage {...props} {...next} />),
  }
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

  it("wrapper URL 携带默认键位表", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview } = await mountStage()
    const keys = readKeysParam(webview.getAttribute("src") ?? "")

    expect(keys.up).toBe(87)
    expect(keys.a).toBe(74)
    expect(keys.turboA).toBe(85)
    expect(keys.speed).toBe(9)
    expect(keys.pause).toBe(27)
  })

  it("条目覆盖键位时 URL 与就绪重发都使用覆盖值", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview, send } = await mountStage({
      entry: createEntry({ keymap: { a: "KeyX", pause: "KeyP" } }),
    })
    const keys = readKeysParam(webview.getAttribute("src") ?? "")
    expect(keys.a).toBe(88)
    expect(keys.pause).toBe(80)

    dispatchGuestMessage(webview, { type: "ready" })

    await waitFor(() => {
      expect(send).toHaveBeenCalledWith("lx-game-host", {
        type: "keymap",
        keys: expect.objectContaining({ a: 88, pause: 80 }),
      })
    })
  })

  it("顶部快捷键入口打开面板并自动暂停：改键保存后即时下发并关闭", async () => {
    const api = createApiMock()
    api.saveKeymap.mockResolvedValue(createEntry({ keymap: { up: "KeyP" } }))
    installApi(api)

    const { send } = await mountStage()
    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }))

    expect(screen.getByRole("heading", { name: "Shortcuts" })).toBeDefined()
    expect(screen.getByText("Paused")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Up" }))
    fireEvent.keyDown(window, { code: "KeyP", keyCode: 80 })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(api.saveKeymap).toHaveBeenCalledWith(3, { up: "KeyP" })
    })
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith("lx-game-host", {
        type: "keymap",
        keys: expect.objectContaining({ up: 80 }),
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Shortcuts" })).toBeNull()
    })
  })

  it("暂停面板的快捷键入口也可打开面板", async () => {
    const api = createApiMock()
    installApi(api)

    await mountStage()
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    const entries = screen.getAllByRole("button", { name: "Shortcuts" })
    fireEvent.click(entries[entries.length - 1] as HTMLElement)

    expect(screen.getByRole("heading", { name: "Shortcuts" })).toBeDefined()
  })

  it("快捷键保存失败时保持面板打开", async () => {
    const api = createApiMock()
    api.saveKeymap.mockRejectedValue(new Error("boom"))
    installApi(api)

    await mountStage()
    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(api.saveKeymap).toHaveBeenCalledWith(3, null)
    })
    expect(screen.getByRole("heading", { name: "Shortcuts" })).toBeDefined()
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

  it("收到 state 上报后按槽位写入快速存档", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview } = await mountStage()
    dispatchGuestMessage(webview, { type: "state", slot: 2, data: new Uint8Array([4, 5, 6]) })

    await waitFor(() => {
      expect(api.writeState).toHaveBeenCalledWith(3, 2, new Uint8Array([4, 5, 6]))
    })
  })

  it("state 上报缺少槽位或数据时不写入", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview } = await mountStage()
    dispatchGuestMessage(webview, { type: "state", data: new Uint8Array([4, 5, 6]) })
    dispatchGuestMessage(webview, { type: "state", slot: 2 })

    expect(api.writeState).not.toHaveBeenCalled()
  })

  it("收到 speed 上报后顶部徽标显示当前倍速", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview } = await mountStage()
    expect(screen.getByText("Speed ×1")).toBeDefined()

    dispatchGuestMessage(webview, { type: "speed", ratio: 8 })

    expect(screen.getByText("Speed ×8")).toBeDefined()
  })

  it("ESC 只切换暂停/恢复并下发 guest 命令，不关闭游戏", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview, send, onClose } = await mountStage()
    dispatchGuestMessage(webview, { type: "started" })

    dispatchGuestMessage(webview, { type: "escape" })

    expect(screen.getByText("Paused")).toBeDefined()
    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith("lx-game-host", { type: "pause" })
    })

    dispatchGuestMessage(webview, { type: "escape" })

    expect(screen.queryByText("Paused")).toBeNull()
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith("lx-game-host", { type: "resume" })
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it("暂停面板可最小化，最小化不销毁会话", async () => {
    const api = createApiMock()
    installApi(api)

    const { onMinimize } = await mountStage()
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }))

    expect(onMinimize).toHaveBeenCalledTimes(1)
  })

  it("暂停面板关闭游戏：先请求 flush，收到回执后关闭", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview, send, onClose } = await mountStage()
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    fireEvent.click(screen.getByRole("button", { name: "Close game" }))

    expect(send).toHaveBeenCalledWith("lx-game-host", { type: "flush" })
    expect(onClose).not.toHaveBeenCalled()

    dispatchGuestMessage(webview, { type: "flushed" })

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it("覆盖层最小化挂起时强制暂停并下发 pause", async () => {
    const api = createApiMock()
    installApi(api)

    const { webview, send, rerender } = await mountStage()
    dispatchGuestMessage(webview, { type: "started" })

    rerender({ isSuspended: true })

    expect(screen.getByText("Paused")).toBeDefined()
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith("lx-game-host", { type: "pause" })
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

      render(
        <GameStage
          entry={createEntry()}
          isSuspended={false}
          onMinimize={vi.fn()}
          onClose={vi.fn()}
        />,
      )
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
    expect(screen.getByRole("button", { name: "Close game" })).toBeDefined()
  })

  it("运行时配置读取失败时展示错误态", async () => {
    const api = createApiMock()
    api.getRuntimeConfig.mockRejectedValue(new Error("no config"))
    installApi(api)

    render(
      <GameStage
        entry={createEntry()}
        isSuspended={false}
        onMinimize={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByText("Failed to load the emulator")).toBeDefined()
  })
})

// @vitest-environment jsdom
import type { GameRomEntry } from "@shared/contracts/game"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GameOverlay, useGameSessionStore } from "@/features/game"

vi.mock("@/features/game/builtin/components/BuiltinGameCanvasHost", () => ({
  BuiltinGameCanvasHost: ({
    onGameOver,
    onPauseRequest,
  }: {
    onGameOver: (score: number) => void
    onPauseRequest: () => void
  }) => (
    <div>
      <span>canvas-host</span>
      <button type="button" onClick={onPauseRequest}>
        request-pause
      </button>
      <button type="button" onClick={() => onGameOver(120)}>
        finish-game
      </button>
    </div>
  ),
}))

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
  list: vi.fn().mockResolvedValue([createEntry()]),
  importFromDialog: vi.fn().mockResolvedValue([]),
  rename: vi.fn(),
  remove: vi.fn(),
  markPlayed: vi.fn(),
  writeSave: vi.fn(),
  getRuntimeConfig: vi.fn().mockResolvedValue({ guestPreloadUrl: "file:///tmp/guest-preload.cjs" }),
})

const installApi = (api: ReturnType<typeof createApiMock>): void => {
  // @ts-expect-error Mock window.api
  window.api = { game: api }
}

describe("GameOverlay", () => {
  beforeEach(() => {
    useGameSessionStore.setState({ session: null, isOpen: false })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("无会话时展开展示游戏库", async () => {
    installApi(createApiMock())

    render(<GameOverlay />)
    act(() => {
      useGameSessionStore.getState().toggle()
    })

    expect(await screen.findByText("Built-in games")).toBeDefined()
    expect(screen.getByText("Demo Game")).toBeDefined()
  })

  it("从游戏库点击内置卡片直接进入舞台，标题显示游戏名", async () => {
    installApi(createApiMock())

    render(<GameOverlay />)
    act(() => {
      useGameSessionStore.getState().toggle()
    })
    fireEvent.click(await screen.findByText("Stardust Dodge"))

    expect(screen.getByText("canvas-host")).toBeDefined()
    expect(screen.queryByText("Built-in games")).toBeNull()
    expect(screen.getAllByText("Stardust Dodge").length).toBeGreaterThanOrEqual(1)
    expect(useGameSessionStore.getState().session).toEqual({ kind: "builtin", gameId: "dodge" })
  })

  it("从游戏库点击导入卡片进入模拟器舞台并渲染 webview", async () => {
    installApi(createApiMock())

    render(<GameOverlay />)
    act(() => {
      useGameSessionStore.getState().toggle()
    })
    fireEvent.click(await screen.findByText("Demo Game"))

    const webview = await waitFor(() => {
      const element = document.querySelector("webview")
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    expect(webview.getAttribute("src")).toContain("entry=3")
    expect(screen.getAllByText("Demo Game").length).toBeGreaterThanOrEqual(1)
  })

  it("最小化只隐藏覆盖层并保留会话与舞台挂载，展开后原样恢复", () => {
    installApi(createApiMock())

    const { container } = render(<GameOverlay />)
    act(() => {
      useGameSessionStore.getState().startBuiltin("dodge")
    })
    expect(screen.getByText("canvas-host")).toBeDefined()

    const overlayClassTokens = (): string[] =>
      container.querySelector(".game-overlay")?.className.split(/\s+/) ?? []

    fireEvent.click(screen.getByRole("button", { name: "Minimize to header" }))
    expect(overlayClassTokens()).toContain("hidden")
    expect(screen.getByText("canvas-host")).toBeDefined()
    expect(useGameSessionStore.getState().session).toEqual({ kind: "builtin", gameId: "dodge" })

    act(() => {
      useGameSessionStore.getState().toggle()
    })
    expect(overlayClassTokens()).not.toContain("hidden")
  })

  it("关闭按钮结束会话并收起覆盖层", () => {
    installApi(createApiMock())

    const { container } = render(<GameOverlay />)
    act(() => {
      useGameSessionStore.getState().startBuiltin("dodge")
    })

    fireEvent.click(screen.getByRole("button", { name: "Close game" }))

    expect(container.querySelector(".game-overlay")).toBeNull()
    expect(useGameSessionStore.getState().session).toBeNull()
    expect(useGameSessionStore.getState().isOpen).toBe(false)
  })

  it("ESC 不再关闭游戏，内置舞台保持挂载", () => {
    installApi(createApiMock())

    render(<GameOverlay />)
    act(() => {
      useGameSessionStore.getState().startBuiltin("dodge")
    })

    fireEvent.keyDown(window, { key: "Escape" })

    expect(screen.getByText("canvas-host")).toBeDefined()
    expect(useGameSessionStore.getState().session).not.toBeNull()
  })

  it("结算面板换一个游戏：清空会话但保持覆盖层展示游戏库", async () => {
    installApi(createApiMock())

    render(<GameOverlay />)
    act(() => {
      useGameSessionStore.getState().startBuiltin("dodge")
    })
    fireEvent.click(screen.getByText("finish-game"))
    fireEvent.click(screen.getByRole("button", { name: "Pick another game" }))

    expect(await screen.findByText("Built-in games")).toBeDefined()
    expect(useGameSessionStore.getState().session).toBeNull()
    expect(useGameSessionStore.getState().isOpen).toBe(true)
  })
})

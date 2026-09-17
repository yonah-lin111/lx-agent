// @vitest-environment jsdom
import type { GameRomEntry } from "@shared/contracts/game"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GameDashboard } from "@/features/game"
import { BUILTIN_BEST_SCORES_STORAGE_KEY } from "@/features/game/builtin/constants"

vi.mock("@/features/game/builtin/components/BuiltinGameCanvasHost", () => ({
  BuiltinGameCanvasHost: ({ onGameOver }: { onGameOver: (score: number) => void }) => (
    <div>
      <span>builtin-canvas-host</span>
      <button type="button" onClick={() => onGameOver(120)}>
        finish-game
      </button>
    </div>
  ),
}))

const createEntry = (patch: Partial<GameRomEntry> = {}): GameRomEntry => ({
  id: 1,
  title: "Demo Game",
  romHash: "a".repeat(64),
  romSize: 1048576,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
  lastPlayedAt: null,
  ...patch,
})

const createApiMock = () => ({
  list: vi.fn().mockResolvedValue([]),
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

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("GameDashboard", () => {
  it("内置分区渲染三款内置游戏与类型标签，导入分区展示空态", async () => {
    installApi(createApiMock())

    render(<GameDashboard />)

    expect(await screen.findByText("Built-in games")).toBeDefined()
    expect(screen.getByText("Tetris")).toBeDefined()
    expect(screen.getByText("Stardust Dodge")).toBeDefined()
    expect(screen.getByText("Cake Stack")).toBeDefined()
    expect(screen.getAllByText("Built-in")).toHaveLength(3)

    expect(screen.getByText("Imported games")).toBeDefined()
    expect(screen.getByText("No imported games yet")).toBeDefined()
    expect(screen.getByText(/64MB/)).toBeDefined()
  })

  it("内置卡片展示本机最高分", async () => {
    localStorage.setItem(BUILTIN_BEST_SCORES_STORAGE_KEY, JSON.stringify({ tetris: 420 }))
    installApi(createApiMock())

    render(<GameDashboard />)

    expect(await screen.findByText("Best: 420")).toBeDefined()
    expect(screen.getAllByText("Best: 0")).toHaveLength(2)
  })

  it("点击内置卡片直接开局，结算退出后列表刷新最高分", async () => {
    installApi(createApiMock())

    render(<GameDashboard />)
    fireEvent.click(await screen.findByText("Stardust Dodge"))

    expect(screen.getByText("builtin-canvas-host")).toBeDefined()

    fireEvent.click(screen.getByText("finish-game"))
    fireEvent.click(screen.getByRole("button", { name: "Pick another game" }))

    expect(await screen.findByText("Best: 120")).toBeDefined()
    expect(screen.getByText("Built-in games")).toBeDefined()
  })

  it("渲染导入游戏卡片（标题 / 体积 / 未游玩）与导入类型标签", async () => {
    const api = createApiMock()
    api.list.mockResolvedValue([createEntry()])
    installApi(api)

    render(<GameDashboard />)

    expect(await screen.findByText("Demo Game")).toBeDefined()
    expect(screen.getByText("1.0 MB · Never played")).toBeDefined()
    expect(screen.getByText("Imported")).toBeDefined()
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it("导入成功后刷新列表并展示新卡片", async () => {
    const api = createApiMock()
    api.importFromDialog.mockResolvedValue([
      { status: "imported", fileName: "demo.gba", entry: createEntry() },
    ])
    api.list.mockResolvedValueOnce([]).mockResolvedValueOnce([createEntry()])
    installApi(api)

    render(<GameDashboard />)
    await screen.findByText("No imported games yet")

    fireEvent.click(screen.getByRole("button", { name: /Import Game/i }))

    expect(await screen.findByText("Demo Game")).toBeDefined()
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it("重复导入命中已有条目时刷新列表但不新增卡片", async () => {
    const api = createApiMock()
    const existing = createEntry()
    api.list.mockResolvedValue([existing])
    api.importFromDialog.mockResolvedValue([
      { status: "duplicated", fileName: "renamed.gba", entry: existing },
    ])
    installApi(api)

    render(<GameDashboard />)
    await screen.findByText("Demo Game")

    fireEvent.click(screen.getByRole("button", { name: /Import Game/i }))

    await waitFor(() => {
      expect(api.list).toHaveBeenCalledTimes(2)
    })
    expect(screen.getAllByText("Demo Game")).toHaveLength(1)
  })

  it("点击导入卡片进入模拟器视图并渲染 webview", async () => {
    const api = createApiMock()
    api.list.mockResolvedValue([createEntry({ id: 7 })])
    installApi(api)

    render(<GameDashboard />)
    fireEvent.click(await screen.findByText("Demo Game"))

    const webview = await waitFor(() => {
      const element = document.querySelector("webview")
      expect(element).not.toBeNull()
      return element as HTMLElement
    })

    expect(webview.getAttribute("src")).toContain("lx-game://emulator/wrapper.html")
    expect(webview.getAttribute("src")).toContain("entry=7")
    expect(webview.getAttribute("preload")).toBe("file:///tmp/guest-preload.cjs")
    expect(webview.getAttribute("partition")).toBe("persist:lx-game")
  })

  it("模拟器视图点击返回按钮退出并刷新列表", async () => {
    const api = createApiMock()
    api.list.mockResolvedValue([createEntry()])
    installApi(api)

    render(<GameDashboard />)
    fireEvent.click(await screen.findByText("Demo Game"))

    const backButton = await screen.findByRole("button", { name: "Back to games" })
    // jsdom 元素没有 webview.send，退出流程走异常兜底路径直接返回列表。
    fireEvent.click(backButton)

    expect(await screen.findByText(/Import Game/)).toBeDefined()
    await waitFor(() => {
      expect(api.list).toHaveBeenCalledTimes(2)
    })
  })
})

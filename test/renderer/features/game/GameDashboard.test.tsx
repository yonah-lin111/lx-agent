// @vitest-environment jsdom
import type { GameRomEntry } from "@shared/contracts/game"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GameDashboard, useGameSessionStore } from "@/features/game"
import { BUILTIN_BEST_SCORES_STORAGE_KEY } from "@/features/game/builtin/constants"

const createEntry = (patch: Partial<GameRomEntry> = {}): GameRomEntry => ({
  id: 1,
  title: "Demo Game",
  romHash: "a".repeat(64),
  romSize: 1048576,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
  lastPlayedAt: null,
  keymap: null,
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
  useGameSessionStore.setState({ session: null, isOpen: false })
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

  it("两个分区标题使用不同图标与配色，卡片图标跟随分区配色", async () => {
    installApi(createApiMock())

    const { container } = render(<GameDashboard />)
    await screen.findByText("Built-in games")

    const builtinIcon = container.querySelector(".game-dashboard-builtin .game-section-icon")
    const importedIcon = container.querySelector(".game-dashboard-imported .game-section-icon")
    expect(builtinIcon?.classList.contains("lucide-joystick")).toBe(true)
    expect(importedIcon?.classList.contains("lucide-memory-stick")).toBe(true)
    expect(builtinIcon?.classList.contains("text-emerald-400")).toBe(true)
    expect(importedIcon?.classList.contains("text-amber-400")).toBe(true)

    // 内置卡片为绿色且不携带导入分区修饰类
    const builtinCardIcon = container.querySelector(".builtin-game-card svg")
    expect(builtinCardIcon?.classList.contains("game-card-icon--builtin")).toBe(true)
    expect(builtinCardIcon?.classList.contains("game-card-icon--imported")).toBe(false)
    expect(builtinCardIcon?.classList.contains("text-emerald-400")).toBe(true)
  })

  it("导入按钮位于「导入游戏」分区标题行内并注明 GBA", async () => {
    installApi(createApiMock())

    const { container } = render(<GameDashboard />)
    await screen.findByText("Imported games")

    const importedSection = container.querySelector(".game-dashboard-imported")
    expect(importedSection).not.toBeNull()
    expect(
      within(importedSection as HTMLElement).getByRole("button", { name: "Import GBA Game" }),
    ).toBeDefined()
  })

  it("内置卡片展示本机最高分", async () => {
    localStorage.setItem(BUILTIN_BEST_SCORES_STORAGE_KEY, JSON.stringify({ tetris: 420 }))
    installApi(createApiMock())

    render(<GameDashboard />)

    expect(await screen.findByText("Best: 420")).toBeDefined()
    expect(screen.getAllByText("Best: 0")).toHaveLength(2)
  })

  it("点击内置卡片只写入会话 Store 开局（舞台由覆盖层承载）", async () => {
    installApi(createApiMock())

    render(<GameDashboard />)
    fireEvent.click(await screen.findByText("Stardust Dodge"))

    expect(useGameSessionStore.getState().session).toEqual({ kind: "builtin", gameId: "dodge" })
    expect(useGameSessionStore.getState().isOpen).toBe(true)
    // 游戏库自身不再渲染舞台。
    expect(screen.getByText("Built-in games")).toBeDefined()
    expect(document.querySelector("canvas")).toBeNull()
  })

  it("渲染导入游戏卡片（标题 / 体积 / 未游玩）与导入类型标签", async () => {
    const api = createApiMock()
    api.list.mockResolvedValue([createEntry()])
    installApi(api)

    render(<GameDashboard />)

    expect(await screen.findByText("Demo Game")).toBeDefined()
    expect(screen.getByText("1.0 MB")).toBeDefined()
    expect(screen.getByText("Never played")).toBeDefined()
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

    fireEvent.click(screen.getByRole("button", { name: /Import GBA Game/i }))

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

    fireEvent.click(screen.getByRole("button", { name: /Import GBA Game/i }))

    await waitFor(() => {
      expect(api.list).toHaveBeenCalledTimes(2)
    })
    expect(screen.getAllByText("Demo Game")).toHaveLength(1)
  })

  it("点击导入卡片只写入 ROM 会话（webview 由覆盖层承载）", async () => {
    const api = createApiMock()
    api.list.mockResolvedValue([createEntry({ id: 7 })])
    installApi(api)

    render(<GameDashboard />)
    fireEvent.click(await screen.findByText("Demo Game"))

    expect(useGameSessionStore.getState().session).toEqual({
      kind: "rom",
      entry: createEntry({ id: 7 }),
    })
    expect(useGameSessionStore.getState().isOpen).toBe(true)
    expect(document.querySelector("webview")).toBeNull()
  })
})

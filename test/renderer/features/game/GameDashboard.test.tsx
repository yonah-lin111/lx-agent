// @vitest-environment jsdom
import type { GameRomEntry } from "@shared/contracts/game"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GameDashboard } from "@/features/game"

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
  vi.restoreAllMocks()
})

describe("GameDashboard", () => {
  it("无条目时展示空态与导入提示", async () => {
    const api = createApiMock()
    installApi(api)

    render(<GameDashboard />)

    expect(await screen.findByText("No games yet")).toBeDefined()
    expect(screen.getByText(/64MB/)).toBeDefined()
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it("渲染游戏卡片（标题 / 体积 / 未游玩）", async () => {
    const api = createApiMock()
    api.list.mockResolvedValue([createEntry()])
    installApi(api)

    render(<GameDashboard />)

    expect(await screen.findByText("Demo Game")).toBeDefined()
    expect(screen.getByText("1.0 MB · Never played")).toBeDefined()
  })

  it("导入成功后刷新列表并展示新卡片", async () => {
    const api = createApiMock()
    api.importFromDialog.mockResolvedValue([
      { status: "imported", fileName: "demo.gba", entry: createEntry() },
    ])
    api.list.mockResolvedValueOnce([]).mockResolvedValueOnce([createEntry()])
    installApi(api)

    render(<GameDashboard />)
    await screen.findByText("No games yet")

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

  it("点击卡片进入模拟器视图并渲染 webview", async () => {
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

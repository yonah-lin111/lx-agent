// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ArcadeModal } from "@/features/arcade/components/ArcadeModal"

vi.mock("@/features/arcade/components/ArcadeCanvasHost", () => ({
  ArcadeCanvasHost: ({
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

describe("ArcadeModal", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("选择页渲染三款游戏与各自最高分", () => {
    localStorage.setItem("lx_arcade_best_v1", JSON.stringify({ dodge: 90, bad: "x" }))

    render(<ArcadeModal isOpen={true} onClose={() => {}} />)

    expect(screen.getByText("One Stroke")).toBeDefined()
    expect(screen.getByText("Stardust Dodge")).toBeDefined()
    expect(screen.getByText("Silhouette Run")).toBeDefined()
    expect(screen.getByText("Best: 90")).toBeDefined()
    expect(screen.getAllByText("Best: 0").length).toBeGreaterThanOrEqual(1)
  })

  it("选择游戏后进入画布并显示工具栏最高分，返回按钮回到选择页", () => {
    render(<ArcadeModal isOpen={true} onClose={() => {}} />)

    fireEvent.click(screen.getByRole("button", { name: /Stardust Dodge/ }))
    expect(screen.getByText("canvas-host")).toBeDefined()
    expect(screen.getByText("Best: 0")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Back to games" }))
    expect(screen.queryByText("canvas-host")).toBeNull()
    expect(screen.getByText("One Stroke")).toBeDefined()
  })

  it("暂停请求展示暂停面板，继续后恢复运行", () => {
    render(<ArcadeModal isOpen={true} onClose={() => {}} />)

    fireEvent.click(screen.getByRole("button", { name: /One Stroke/ }))
    fireEvent.click(screen.getByText("request-pause"))

    expect(screen.getByText("Paused")).toBeDefined()

    const resumeButtons = screen.getAllByRole("button", { name: "Resume" })
    fireEvent.click(resumeButtons[resumeButtons.length - 1])
    expect(screen.queryByText("Paused")).toBeNull()
  })

  it("游戏结束展示得分与新纪录，并写入 localStorage 最高分", () => {
    render(<ArcadeModal isOpen={true} onClose={() => {}} />)

    fireEvent.click(screen.getByRole("button", { name: /Silhouette Run/ }))
    fireEvent.click(screen.getByText("finish-game"))

    expect(screen.getByText("Run finished")).toBeDefined()
    expect(screen.getByText("120")).toBeDefined()
    expect(screen.getByText("New best!")).toBeDefined()
    expect(JSON.parse(localStorage.getItem("lx_arcade_best_v1") ?? "{}")).toEqual({ runner: 120 })
  })

  it("选择页按 ESC 关闭游戏厅", () => {
    const onClose = vi.fn()
    render(<ArcadeModal isOpen={true} onClose={onClose} />)

    fireEvent.keyDown(document, { key: "Escape" })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

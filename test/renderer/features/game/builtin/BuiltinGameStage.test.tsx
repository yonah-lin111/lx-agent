// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  BuiltinGameStage,
  type BuiltinGameStageProps,
} from "@/features/game/builtin/components/BuiltinGameStage"

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

// 渲染内置游戏舞台并返回可断言的桩函数。
const renderStage = (
  patch: Partial<BuiltinGameStageProps> = {},
): {
  onBackToLibrary: ReturnType<typeof vi.fn>
  submitScore: ReturnType<typeof vi.fn>
  rerender: (next: Partial<BuiltinGameStageProps>) => void
} => {
  const onBackToLibrary = (patch.onBackToLibrary ?? vi.fn()) as ReturnType<typeof vi.fn>
  const submitScore = (patch.submitScore ?? vi.fn().mockReturnValue(true)) as ReturnType<
    typeof vi.fn
  >
  const props: BuiltinGameStageProps = {
    gameId: "dodge",
    bestScores: { dodge: 90 },
    submitScore: submitScore as BuiltinGameStageProps["submitScore"],
    isSuspended: false,
    onBackToLibrary: onBackToLibrary as BuiltinGameStageProps["onBackToLibrary"],
    ...patch,
  }

  const view = render(<BuiltinGameStage {...props} />)
  return {
    onBackToLibrary,
    submitScore,
    rerender: (next) => view.rerender(<BuiltinGameStage {...props} {...next} />),
  }
}

describe("BuiltinGameStage", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("工具栏展示游戏名 / 最高分并保留玩法说明入口", () => {
    renderStage()

    expect(screen.getByText("Stardust Dodge")).toBeDefined()
    expect(screen.getByText("Best: 90")).toBeDefined()
    expect(screen.getByText("canvas-host")).toBeDefined()
    expect(document.querySelectorAll('[aria-label="Info"]')).toHaveLength(1)
  })

  it("暂停请求展示暂停面板，继续后恢复运行", () => {
    renderStage()

    fireEvent.click(screen.getByText("request-pause"))
    expect(screen.getByText("Paused")).toBeDefined()

    // 工具栏与暂停面板同时存在 Resume 入口，点击面板中的按钮。
    const resumeButtons = screen.getAllByRole("button", { name: "Resume" })
    fireEvent.click(resumeButtons[resumeButtons.length - 1])
    expect(screen.queryByText("Paused")).toBeNull()
  })

  it("ESC 不再退出舞台，只由按钮控制会话", () => {
    const { onBackToLibrary } = renderStage()

    fireEvent.click(screen.getByText("request-pause"))
    fireEvent.keyDown(window, { key: "Escape" })

    expect(onBackToLibrary).not.toHaveBeenCalled()
    expect(screen.getByText("canvas-host")).toBeDefined()
  })

  it("覆盖层最小化挂起时强制暂停本局", () => {
    const { rerender } = renderStage()

    expect(screen.queryByText("Paused")).toBeNull()

    rerender({ isSuspended: true })

    expect(screen.getByText("Paused")).toBeDefined()
  })

  it("游戏结束展示得分并提交最高分", () => {
    const { submitScore } = renderStage()

    fireEvent.click(screen.getByText("finish-game"))

    expect(screen.getByText("Run finished")).toBeDefined()
    expect(screen.getByText("120")).toBeDefined()
    expect(screen.getByText("New best!")).toBeDefined()
    expect(submitScore).toHaveBeenCalledWith("dodge", 120)
  })

  it("未刷新纪录时展示当前最高分", () => {
    renderStage({ submitScore: vi.fn().mockReturnValue(false) })

    fireEvent.click(screen.getByText("finish-game"))

    // 工具栏与结算面板同时展示当前最高分
    expect(screen.getAllByText("Best: 90")).toHaveLength(2)
    expect(screen.queryByText("New best!")).toBeNull()
  })

  it("重新开始清空结算面板", () => {
    renderStage()

    fireEvent.click(screen.getByText("finish-game"))
    fireEvent.click(screen.getByRole("button", { name: "Play again" }))

    expect(screen.queryByText("Run finished")).toBeNull()
    expect(screen.getByText("canvas-host")).toBeDefined()
  })

  it("结算面板换一个游戏：回到游戏库", () => {
    const { onBackToLibrary } = renderStage()

    fireEvent.click(screen.getByText("finish-game"))
    fireEvent.click(screen.getByRole("button", { name: "Pick another game" }))

    expect(onBackToLibrary).toHaveBeenCalledTimes(1)
  })

  it("暂停面板可重新开始本局", () => {
    renderStage()

    fireEvent.click(screen.getByText("request-pause"))
    // 工具栏与暂停面板同时存在 Restart 入口，点击面板中的按钮。
    const restartButtons = screen.getAllByRole("button", { name: "Restart" })
    fireEvent.click(restartButtons[restartButtons.length - 1])

    expect(screen.queryByText("Paused")).toBeNull()
    expect(screen.getByText("canvas-host")).toBeDefined()
  })
})

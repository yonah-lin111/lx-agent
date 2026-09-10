// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  BottomSideBar,
  calculateMaxHeightVh,
  clampHeight,
  DEFAULT_HEIGHT_VH,
  MIN_HEIGHT_VH,
  RESERVED_TOP_HEIGHT_PX,
} from "@/components/layout/BottomSideBar"
import { useBottomSideBarStore } from "@/components/layout/bottomSideBarStore"

// jsdom 未实现 ResizeObserver，用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

vi.mock("@/features/terminal", () => ({
  GhosttyTerminalView: ({ rightActions }: { rightActions?: React.ReactNode }) => (
    <div data-testid="mock-ghostty-terminal">
      Ghostty Terminal
      {rightActions}
    </div>
  ),
}))

// 底边栏仅保留终端与长任务监控双视图，切换按钮与图标使用英文文案。

describe("BottomSideBar", () => {
  afterEach(() => {
    cleanup()
  })

  it("clampHeight 与 calculateMaxHeightVh 精确约束并预留顶部 156px", () => {
    expect(MIN_HEIGHT_VH).toBe(15)
    expect(DEFAULT_HEIGHT_VH).toBe(30)
    expect(RESERVED_TOP_HEIGHT_PX).toBe(156)

    // 视口高度 1000px 时，预留 156px，最大高度为 (1000 - 156)/1000 * 100 = 84.4vh
    const maxVh1000 = calculateMaxHeightVh(1000, 156)
    expect(maxVh1000).toBeCloseTo(84.4, 1)

    expect(clampHeight(10, 1000)).toBe(15)
    expect(clampHeight(50, 1000)).toBe(50)
    expect(clampHeight(95, 1000)).toBeCloseTo(84.4, 1)
  })

  it("展开态正常挂载且渲染调整把手与 Ghostty 终端", () => {
    render(
      <BottomSideBar
        isCoveringRightSideBar={false}
        isExpanded={true}
        onCoveringRightSideBarChange={vi.fn()}
        onExpandedChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText("Resize Bottom Bar")).not.toBeNull()
    expect(screen.getByTestId("mock-ghostty-terminal")).not.toBeNull()
    expect(screen.getAllByLabelText("Collapse Bottom Bar").length).toBeGreaterThan(0)
  })

  it("折叠态展示紧凑条与展开按钮", () => {
    render(
      <BottomSideBar
        isCoveringRightSideBar={false}
        isExpanded={false}
        onCoveringRightSideBarChange={vi.fn()}
        onExpandedChange={vi.fn()}
      >
        <div>状态栏内容</div>
      </BottomSideBar>,
    )

    expect(screen.getByText("状态栏内容")).not.toBeNull()
    expect(screen.getByLabelText("Expand")).not.toBeNull()
  })

  it("折叠态点击长任务监控切换按钮会切换视图并展开底边栏", () => {
    useBottomSideBarStore.setState({ viewMode: "terminal" })
    const onExpandedChange = vi.fn()

    render(
      <BottomSideBar
        isCoveringRightSideBar={false}
        isExpanded={false}
        onCoveringRightSideBarChange={vi.fn()}
        onExpandedChange={onExpandedChange}
      >
        <div>状态栏内容</div>
      </BottomSideBar>,
    )

    fireEvent.click(screen.getByLabelText("Switch to Background Jobs"))

    expect(useBottomSideBarStore.getState().viewMode).toBe("jobs")
    expect(onExpandedChange).toHaveBeenCalledWith(true)
  })

  it("展开态下不渲染已移除的 OpenClaw 视图切换按钮", () => {
    useBottomSideBarStore.setState({ viewMode: "terminal" })

    render(
      <BottomSideBar
        isCoveringRightSideBar={false}
        isExpanded={true}
        onCoveringRightSideBarChange={vi.fn()}
        onExpandedChange={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText("Switch to OpenClaw Chat")).toBeNull()
  })
})

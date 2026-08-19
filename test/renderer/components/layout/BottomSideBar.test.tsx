// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  BottomSideBar,
  clampHeight,
  MAX_HEIGHT_VH,
  MIN_HEIGHT_VH,
} from "@/components/layout/BottomSideBar"

vi.mock("@/features/terminal", () => ({
  GhosttyTerminalView: () => <div data-testid="mock-ghostty-terminal">Ghostty Terminal</div>,
}))

describe("BottomSideBar", () => {
  afterEach(() => {
    cleanup()
  })

  it("clampHeight 正确将高度约束在 [15vh, 85vh]", () => {
    expect(MIN_HEIGHT_VH).toBe(15)
    expect(MAX_HEIGHT_VH).toBe(85)
    expect(clampHeight(10)).toBe(15)
    expect(clampHeight(50)).toBe(50)
    expect(clampHeight(90)).toBe(85)
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

    expect(screen.getByLabelText("调整底边栏高度")).not.toBeNull()
    expect(screen.getByTestId("mock-ghostty-terminal")).not.toBeNull()
    expect(screen.getByLabelText("折叠底边栏")).not.toBeNull()
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
    expect(screen.getByLabelText("展开底边栏")).not.toBeNull()
  })
})

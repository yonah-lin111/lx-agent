// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LxModal } from "@/components/ui/LxModal"

describe("LxModal", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("渲染时外层遮罩层带有 lx-modal-backdrop 类名，并包含 role='dialog'", () => {
    render(
      <LxModal isOpen={true} title="测试弹窗" onClose={vi.fn()}>
        <div>弹窗内容</div>
      </LxModal>,
    )

    const backdrop = document.querySelector(".lx-modal-backdrop")
    expect(backdrop).not.toBeNull()
    expect(backdrop?.getAttribute("role")).toBe("dialog")
    expect(backdrop?.className).toContain("fixed")
    expect(backdrop?.className).toContain("inset-0")
    expect(screen.getByText("测试弹窗")).not.toBeNull()
    expect(screen.getByText("弹窗内容")).not.toBeNull()
  })

  it("点击遮罩层可触发 onClose", () => {
    const handleClose = vi.fn()
    render(
      <LxModal isOpen={true} title="测试弹窗" onClose={handleClose}>
        <div>弹窗内容</div>
      </LxModal>,
    )

    const backdrop = document.querySelector(".lx-modal-backdrop") as HTMLElement
    expect(backdrop).not.toBeNull()

    // 遮罩层按下并点击
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it("点击弹窗实体不触发 onClose", () => {
    const handleClose = vi.fn()
    render(
      <LxModal isOpen={true} title="测试弹窗" onClose={handleClose}>
        <div data-testid="modal-content">弹窗内容</div>
      </LxModal>,
    )

    const content = screen.getByTestId("modal-content")
    fireEvent.mouseDown(content)
    fireEvent.click(content)
    expect(handleClose).not.toHaveBeenCalled()
  })
})

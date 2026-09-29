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
    expect(document.querySelector(".lx-modal-panel")).not.toBeNull()
    expect(screen.getByText("测试弹窗")).not.toBeNull()
    expect(screen.getByText("弹窗内容")).not.toBeNull()
  })

  it("传入 container 时挂载到容器内，遮罩改为容器内绝对定位", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    render(
      <LxModal isOpen={true} title="测试弹窗" container={container} onClose={vi.fn()}>
        <div>弹窗内容</div>
      </LxModal>,
    )

    const backdrop = container.querySelector(".lx-modal-backdrop")
    expect(backdrop).not.toBeNull()
    expect(backdrop?.className).toContain("absolute")
    expect(backdrop?.className).not.toContain("fixed")
    // 不再挂载到 body 顶层。
    expect(
      Array.from(document.body.children).some((element) =>
        element.classList.contains("lx-modal-backdrop"),
      ),
    ).toBe(false)

    container.remove()
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

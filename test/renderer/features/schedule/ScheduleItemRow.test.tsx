// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScheduleItemRow } from "@/features/schedule/components/ScheduleItemRow"
import type { ScheduleItem } from "@/features/schedule/types"

const item: ScheduleItem = {
  id: 1,
  entryDate: "2026-09-16",
  content: "写方案",
  priority: "P1",
  completed: false,
  completedDate: null,
  sortOrder: 0,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
}

const createHandlers = () => ({
  onToggle: vi.fn(),
  onCyclePriority: vi.fn(),
  onRename: vi.fn(),
  onMove: vi.fn(),
  onDelete: vi.fn(),
})

describe("ScheduleItemRow", () => {
  afterEach(cleanup)

  it("点击日期按钮直接展示日期面板，选中日期后立即移动", () => {
    const handlers = createHandlers()
    render(<ScheduleItemRow item={item} {...handlers} />)

    fireEvent.click(screen.getByRole("button", { name: "Move to date" }))

    // 面板直接可见，无需再点触发器。
    const targetDay = document.querySelector('[data-date="2026-09-20"]')
    expect(targetDay).not.toBeNull()

    fireEvent.click(targetDay as HTMLElement)

    // 无二次确认，直接切换日期。
    expect(screen.queryByLabelText("Confirm")).toBeNull()
    expect(handlers.onMove).toHaveBeenCalledWith(item, "2026-09-20")
  })

  it("行内编辑回车提交重命名并去除首尾空白", () => {
    const handlers = createHandlers()
    render(<ScheduleItemRow item={item} {...handlers} />)

    fireEvent.click(screen.getByText("写方案"))
    const editor = screen.getByDisplayValue("写方案")
    fireEvent.change(editor, { target: { value: "  改后的标题  " } })
    fireEvent.keyDown(editor, { key: "Enter" })

    expect(handlers.onRename).toHaveBeenCalledWith(item, "改后的标题")
  })

  it("优先级徽标点击循环到下一档", () => {
    const handlers = createHandlers()
    render(<ScheduleItemRow item={item} {...handlers} />)

    fireEvent.click(screen.getByRole("button", { name: "Cycle priority" }))
    expect(handlers.onCyclePriority).toHaveBeenCalledWith(item)
  })

  it("完成勾选回调当前条目", () => {
    const handlers = createHandlers()
    render(<ScheduleItemRow item={item} {...handlers} />)

    fireEvent.click(screen.getByLabelText("Mark as done"))
    expect(handlers.onToggle).toHaveBeenCalledWith(item)
  })
})

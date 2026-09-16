// @vitest-environment jsdom
import type { ScheduleItem } from "@shared/contracts/schedule"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScheduleMatrixBoard } from "@/features/schedule/components/ScheduleMatrixBoard"

const createItem = (patch: Partial<ScheduleItem>): ScheduleItem => ({
  id: 1,
  entryDate: "2026-09-16",
  content: "matrix task",
  priority: "P0",
  completed: false,
  completedDate: null,
  sortOrder: 0,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
  ...patch,
})

afterEach(() => {
  cleanup()
})

describe("ScheduleMatrixBoard", () => {
  it("渲染 P0-P3 四个象限与对应条目", () => {
    const items = [
      createItem({ id: 1, content: "Urgent P0", priority: "P0" }),
      createItem({ id: 2, content: "Important P1", priority: "P1" }),
    ]

    render(
      <ScheduleMatrixBoard
        items={items}
        onToggle={vi.fn()}
        onCyclePriority={vi.fn()}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onCreateInPriority={vi.fn()}
      />,
    )

    expect(screen.getByText("Urgent P0")).toBeDefined()
    expect(screen.getByText("Important P1")).toBeDefined()
    expect(screen.getAllByText("P0").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("P1").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("P2").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("P3").length).toBeGreaterThanOrEqual(1)
  })

  it("点击象限快速添加展开输入框并回车提交", async () => {
    const handleCreate = vi.fn().mockResolvedValue(true)

    render(
      <ScheduleMatrixBoard
        items={[]}
        onToggle={vi.fn()}
        onCyclePriority={vi.fn()}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        onCreateInPriority={handleCreate}
      />,
    )

    // 获取所有添加按钮（每个象限各一个）
    const addButtons = screen.getAllByRole("button", { name: /quick add|快速添加/i })
    expect(addButtons).toHaveLength(4)

    // 点击 P0 象限的添加按钮
    fireEvent.click(addButtons[0])

    const input = screen.getByPlaceholderText(/task|待办/i)
    fireEvent.change(input, { target: { value: "New Urgent Issue" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(handleCreate).toHaveBeenCalledWith("New Urgent Issue", "P0")
  })
})

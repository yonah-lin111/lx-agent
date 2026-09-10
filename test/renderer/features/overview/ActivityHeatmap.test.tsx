// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ActivityHeatmap } from "@/features/overview/components/ActivityHeatmap"
import type { ActivityDayEntry } from "@/features/overview/types"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

afterEach(() => {
  cleanup()
})

const mockEntries: ActivityDayEntry[] = [
  {
    date: "2026-03-01",
    count: 5,
    turns: 3,
    toolCalls: 2,
  },
  {
    date: "2026-03-02",
    count: 0,
    turns: 0,
    toolCalls: 0,
  },
]

describe("ActivityHeatmap", () => {
  it("正确渲染热力图标题、活动总数及图例", () => {
    const { container } = render(<ActivityHeatmap entries={mockEntries} />)

    expect(screen.getByText(/生产力绿墙|Productivity Heatmap/i)).toBeDefined()
    expect(screen.getByText(/5 次活动|5 activities/i)).toBeDefined()

    // 验证卡片使用了实体背景与边框，未采用透明背景
    const card = container.querySelector(".overview-heatmap-card")
    expect(card).toBeDefined()
    expect(card?.className).toContain("bg-[#1e1e1e]")
    expect(card?.className).toContain("border-[#333333]")
  })

  it("当提供 projectOptions 时正确渲染项目下拉框并响应切换", () => {
    const onProjectChange = vi.fn()
    const projectOptions = [
      { value: "all", label: "全部项目" },
      { value: "proj-1", label: "项目 Alpha" },
    ]

    const { container } = render(
      <ActivityHeatmap
        entries={mockEntries}
        selectedProjectId="all"
        projectOptions={projectOptions}
        onProjectChange={onProjectChange}
      />,
    )

    const trigger = screen.getByText("全部项目")
    fireEvent.click(trigger)

    const optionProj1 = screen.getByText("项目 Alpha")
    fireEvent.mouseDown(optionProj1)

    expect(onProjectChange).toHaveBeenCalledWith("proj-1")

    // 验证 Select 控件位于卡片外部，卡片内部无 Select 按钮
    const card = container.querySelector(".overview-heatmap-card")
    expect(card?.querySelector("button")).toBeNull()
  })
})

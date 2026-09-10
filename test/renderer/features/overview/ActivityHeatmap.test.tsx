// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
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
  it("正确渲染热力图网格单元、图例与实体背景", () => {
    const { container } = render(<ActivityHeatmap entries={mockEntries} />)

    // 验证卡片使用了实体背景与边框，未采用透明背景
    const card = container.querySelector(".overview-heatmap-card")
    expect(card).toBeDefined()
    expect(card?.className).toContain("bg-[#1e1e1e]")
    expect(card?.className).toContain("border-[#333333]")

    // 验证包含数据方格与图例阶梯
    const cells = container.querySelectorAll(".overview-heatmap-cell")
    expect(cells.length).toBeGreaterThanOrEqual(5) // 图例 5 个 + 数据单元格
  })
})

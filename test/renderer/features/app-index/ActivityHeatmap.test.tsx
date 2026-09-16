// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ActivityHeatmap } from "@/features/app-index/components/ActivityHeatmap"

vi.mock("@/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
  }),
}))

beforeEach(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterEach(() => {
  cleanup()
})

describe("ActivityHeatmap", () => {
  it("渲染标题图标容器与每日会话热力单元", () => {
    const { container } = render(
      <ActivityHeatmap
        entries={[
          { date: "2026-09-14", count: 2 },
          { date: "2026-09-15", count: 0 },
        ]}
      />,
    )

    // 标题与裸图标（无边框容器装饰）
    expect(screen.getByText("home.index.activity")).toBeDefined()
    const icon = container.querySelector(".app-index-section-icon--activity")
    expect(icon).not.toBeNull()
    expect(icon?.parentElement?.className).toContain("app-index-section-title")
    expect(icon?.parentElement?.className).not.toContain("border")

    // 热力单元按日期渲染并携带会话数
    const cells = container.querySelectorAll(".activity-heatmap-cell[data-date]")
    expect(cells).toHaveLength(2)
    expect(cells[0].getAttribute("data-count")).toBe("2")
    expect(cells[1].getAttribute("data-count")).toBe("0")
  })

  it("不再提供项目筛选下拉（绿墙统一展示全部会话）", () => {
    render(<ActivityHeatmap entries={[{ date: "2026-09-14", count: 1 }]} />)

    expect(screen.queryByRole("button")).toBeNull()
  })
})

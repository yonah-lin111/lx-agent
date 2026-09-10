import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ActivityHeatmap } from "@/features/overview/components/ActivityHeatmap"

vi.mock("@/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

beforeEach(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

describe("ActivityHeatmap", () => {
  it("标题左侧应渲染 Activity 图标容器", () => {
    const { container } = render(
      <ActivityHeatmap
        entries={[]}
        selectedProjectId="all"
        projectOptions={[
          { value: "all", label: "全部项目", isImported: true },
          { value: "p1", label: "未导入", isImported: false },
        ]}
        onProjectChange={() => {}}
      />,
    )

    // 验证标题容器
    const title = screen.getByText("home.heatmap.title")
    expect(title).toBeDefined()

    // 验证标题同级的 Activity 图标容器（绿墙绿色风格）
    const iconContainer = container.querySelector(".text-emerald-400.bg-\\[\\#144222\\]")
    expect(iconContainer).not.toBeNull()
  })
})

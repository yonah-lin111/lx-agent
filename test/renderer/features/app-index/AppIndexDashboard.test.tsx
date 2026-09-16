// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { AppIndexDashboard } from "@/features/app-index/components/AppIndexDashboard"

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}))

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock("@/features/arcade", () => ({
  ArcadeModal: ({ isOpen }: { isOpen: boolean }): React.JSX.Element | null =>
    isOpen ? <div>arcade-modal</div> : null,
}))

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const activityEntries = [
  { date: "2026-09-14", count: 3 },
  { date: "2026-09-15", count: 0 },
  { date: "2026-09-16", count: 2 },
]

describe("AppIndexDashboard", () => {
  beforeEach(() => {
    // @ts-expect-error Mock window.api
    window.api = {
      activity: {
        getDaily: vi.fn().mockResolvedValue(activityEntries),
      },
    }
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    mockNavigate.mockClear()
  })

  it("渲染品牌 Hero、8 个快速入口与年度会话活跃度绿墙", async () => {
    const { container } = render(<AppIndexDashboard />)

    // Hero 品牌与文案
    expect(screen.getByAltText("LX Agent")).toBeDefined()
    expect(screen.getByText("LX AGENT")).toBeDefined()
    expect(screen.getByText("Agentic desktop workspace for prompt production")).toBeDefined()

    // 标题行裸图标（快速入口 / 活跃度）
    expect(container.querySelector(".app-index-section-icon--entries")).not.toBeNull()
    expect(container.querySelector(".app-index-section-icon--activity")).not.toBeNull()

    // 8 个快速入口
    const entries = [
      "New Chat",
      "Projects",
      "Schedule",
      "Usage",
      "Front Design",
      "OpenClaw",
      "UI Preview",
      "Settings",
    ]
    for (const label of entries) {
      expect(screen.getByRole("button", { name: label })).toBeDefined()
    }

    // 绿墙标题与年度会话总数（3 + 2）
    await waitFor(() => {
      expect(screen.getByText("5 sessions")).toBeDefined()
    })
    expect(screen.getByText("Activity")).toBeDefined()
    expect(window.api.activity.getDaily).toHaveBeenCalledTimes(1)
  })

  it("点击带路由的入口跳转到对应页面", async () => {
    render(<AppIndexDashboard />)

    fireEvent.click(screen.getByRole("button", { name: "Projects" }))
    expect(mockNavigate).toHaveBeenCalledWith("/project")

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }))
    expect(mockNavigate).toHaveBeenCalledWith("/?view=schedule")

    fireEvent.click(screen.getByRole("button", { name: "Usage" }))
    expect(mockNavigate).toHaveBeenCalledWith("/?view=usage")

    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(mockNavigate).toHaveBeenCalledWith("/settings")
  })

  it("点击 logo 打开彩蛋游戏厅", () => {
    render(<AppIndexDashboard />)

    expect(screen.queryByText("arcade-modal")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Feeling lucky?" }))

    expect(screen.getByText("arcade-modal")).toBeDefined()
  })

  it("点击新建对话入口创建 Agent Tab 而不跳转路由", () => {
    const createTab = vi.spyOn(agentTabStore, "createTab").mockReturnValue("tab-1")
    render(<AppIndexDashboard />)

    fireEvent.click(screen.getByRole("button", { name: "New Chat" }))

    expect(createTab).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("活跃数据加载失败时展示错误提示与重试入口", async () => {
    const getDaily = vi.fn().mockRejectedValue(new Error("boom"))
    // @ts-expect-error Mock window.api
    window.api = { activity: { getDaily } }

    render(<AppIndexDashboard />)

    await waitFor(() => {
      expect(screen.getByText("boom")).toBeDefined()
    })

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    await waitFor(() => {
      expect(getDaily).toHaveBeenCalledTimes(2)
    })
  })
})

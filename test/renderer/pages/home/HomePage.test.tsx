// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HomePage } from "@/pages/home"

let mockSearchParams = new URLSearchParams()
vi.mock("react-router-dom", () => ({
  useSearchParams: () => [mockSearchParams],
  useNavigate: () => vi.fn(),
}))

vi.mock("@/features/overview", () => ({
  OverviewDashboard: () => <div data-testid="overview-dashboard">Overview Dashboard Mock</div>,
}))

afterEach(() => {
  cleanup()
  mockSearchParams = new URLSearchParams()
})

describe("HomePage", () => {
  it("默认渲染概览数据看板", () => {
    mockSearchParams = new URLSearchParams()
    render(<HomePage />)

    expect(screen.getByTestId("overview-dashboard")).toBeDefined()
  })

  it("当 view=sessions 时渲染全局会话占位视图", () => {
    mockSearchParams = new URLSearchParams("view=sessions")
    render(<HomePage />)

    expect(screen.queryByTestId("overview-dashboard")).toBeNull()
    expect(
      screen.getByRole("heading", { level: 1, name: /全局会话|Global Sessions/i }),
    ).toBeDefined()
    expect(screen.getByText(/暂无全局会话记录|No Global Sessions Yet/i)).toBeDefined()
  })

  it("当 view=skills 时渲染技能与工具占位视图", () => {
    mockSearchParams = new URLSearchParams("view=skills")
    render(<HomePage />)

    expect(screen.queryByTestId("overview-dashboard")).toBeNull()
    expect(
      screen.getByRole("heading", { level: 1, name: /技能与工具|Skills & Tools/i }),
    ).toBeDefined()
    expect(screen.getByText(/暂无激活技能或工具|No Active Skills or Tools/i)).toBeDefined()
  })
})

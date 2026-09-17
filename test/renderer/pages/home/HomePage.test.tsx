// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HomePage } from "@/pages/home"

const { mockParams } = vi.hoisted(() => ({
  mockParams: { value: new URLSearchParams() },
}))

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [mockParams.value],
}))
vi.mock("@/features/app-index", () => ({
  AppIndexDashboard: (): React.JSX.Element => <div>index-view</div>,
}))
vi.mock("@/features/usage", () => ({
  UsageDashboard: (): React.JSX.Element => <div>usage-view</div>,
}))
vi.mock("@/features/schedule", () => ({
  ScheduleDashboard: (): React.JSX.Element => <div>schedule-view</div>,
}))
vi.mock("@/features/game", () => ({
  GameDashboard: (): React.JSX.Element => <div>game-view</div>,
}))

beforeEach(() => {
  mockParams.value = new URLSearchParams()
})

afterEach(() => {
  cleanup()
})

describe("HomePage", () => {
  it("默认渲染索引视图", () => {
    render(<HomePage />)
    expect(screen.getByText("index-view")).toBeDefined()
    expect(screen.queryByText("usage-view")).toBeNull()
    expect(screen.queryByText("schedule-view")).toBeNull()
  })

  it("view=usage 时渲染用量统计组件（不切换路由）", () => {
    mockParams.value = new URLSearchParams("view=usage")
    render(<HomePage />)
    expect(screen.getByText("usage-view")).toBeDefined()
    expect(screen.queryByText("index-view")).toBeNull()
  })

  it("view=schedule 时渲染日程组件（不切换路由）", () => {
    mockParams.value = new URLSearchParams("view=schedule")
    render(<HomePage />)
    expect(screen.getByText("schedule-view")).toBeDefined()
    expect(screen.queryByText("index-view")).toBeNull()
    expect(screen.queryByText("usage-view")).toBeNull()
  })

  it("view=game 时渲染游戏组件（不切换路由）", () => {
    mockParams.value = new URLSearchParams("view=game")
    render(<HomePage />)
    expect(screen.getByText("game-view")).toBeDefined()
    expect(screen.queryByText("index-view")).toBeNull()
    expect(screen.queryByText("schedule-view")).toBeNull()
    expect(screen.queryByText("usage-view")).toBeNull()
  })
})

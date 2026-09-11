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
vi.mock("@/features/overview", () => ({
  OverviewDashboard: (): React.JSX.Element => <div>overview-view</div>,
}))
vi.mock("@/features/usage", () => ({
  UsageDashboard: (): React.JSX.Element => <div>usage-view</div>,
}))

beforeEach(() => {
  mockParams.value = new URLSearchParams()
})

afterEach(() => {
  cleanup()
})

describe("HomePage", () => {
  it("默认渲染概览视图", () => {
    render(<HomePage />)
    expect(screen.getByText("overview-view")).toBeDefined()
    expect(screen.queryByText("usage-view")).toBeNull()
  })

  it("view=usage 时渲染用量统计组件（不切换路由）", () => {
    mockParams.value = new URLSearchParams("view=usage")
    render(<HomePage />)
    expect(screen.getByText("usage-view")).toBeDefined()
    expect(screen.queryByText("overview-view")).toBeNull()
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HomeLeftSideBar } from "@/pages/home/components/HomeLeftSideBar"

const { mockNavigate, mockLocation } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockLocation: { pathname: "/" },
}))

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}))

beforeEach(() => {
  mockLocation.pathname = "/"
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("HomeLeftSideBar", () => {
  it("展开模式下渲染概览与用量两个导航项，并按 pathname 高亮", () => {
    render(<HomeLeftSideBar isCollapsed={false} />)

    const overviewItem = screen.getByRole("button", { name: /overview|概览/i })
    const usageItem = screen.getByRole("button", { name: /usage|用量统计/i })
    expect(overviewItem.getAttribute("aria-current")).toBe("page")
    expect(usageItem.getAttribute("aria-current")).toBeNull()

    fireEvent.click(usageItem)
    expect(mockNavigate).toHaveBeenCalledWith("/usage")
  })

  it("pathname 为 /usage 时高亮用量项", () => {
    mockLocation.pathname = "/usage"
    render(<HomeLeftSideBar isCollapsed={false} />)

    const overviewItem = screen.getByRole("button", { name: /overview|概览/i })
    const usageItem = screen.getByRole("button", { name: /usage|用量统计/i })
    expect(usageItem.getAttribute("aria-current")).toBe("page")
    expect(overviewItem.getAttribute("aria-current")).toBeNull()
  })

  it("折叠模式下退化为图标按钮并保留可访问名称", () => {
    render(<HomeLeftSideBar isCollapsed={true} />)

    const overviewButton = screen.getByRole("button", { name: /overview|概览/i })
    const usageButton = screen.getByRole("button", { name: /usage|用量统计/i })
    expect(overviewButton.getAttribute("aria-current")).toBe("page")
    expect(usageButton.getAttribute("aria-current")).toBeNull()

    fireEvent.click(usageButton)
    expect(mockNavigate).toHaveBeenCalledWith("/usage")
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HomeLeftSideBar } from "@/pages/home/components/HomeLeftSideBar"

const { mockNavigate, mockParams } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockParams: { value: new URLSearchParams() },
}))

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockParams.value],
}))

beforeEach(() => {
  mockParams.value = new URLSearchParams()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("HomeLeftSideBar", () => {
  it("展开模式下渲染概览与用量两个导航项，并按 view 查询参数高亮", () => {
    render(<HomeLeftSideBar isCollapsed={false} />)

    const overviewItem = screen.getByRole("button", { name: /overview|概览/i })
    const usageItem = screen.getByRole("button", { name: /usage|用量统计/i })
    expect(overviewItem.getAttribute("aria-current")).toBe("page")
    expect(usageItem.getAttribute("aria-current")).toBeNull()

    // 统一使用默认尺寸的 LxNavItem
    expect(overviewItem.className).toContain("lx-nav-item")
    expect(overviewItem.className).toContain("h-7")
    expect(overviewItem.getAttribute("data-item-level")).toBe("1")

    fireEvent.click(usageItem)
    expect(mockNavigate).toHaveBeenCalledWith("/?view=usage")
  })

  it("view=usage 时高亮用量项，点击概览回到根路径", () => {
    mockParams.value = new URLSearchParams("view=usage")
    render(<HomeLeftSideBar isCollapsed={false} />)

    const overviewItem = screen.getByRole("button", { name: /overview|概览/i })
    const usageItem = screen.getByRole("button", { name: /usage|用量统计/i })
    expect(usageItem.getAttribute("aria-current")).toBe("page")
    expect(overviewItem.getAttribute("aria-current")).toBeNull()

    fireEvent.click(overviewItem)
    expect(mockNavigate).toHaveBeenCalledWith("/")
  })

  it("折叠模式下退化为图标按钮并保留可访问名称", () => {
    render(<HomeLeftSideBar isCollapsed={true} />)

    const overviewButton = screen.getByRole("button", { name: /overview|概览/i })
    const usageButton = screen.getByRole("button", { name: /usage|用量统计/i })
    expect(overviewButton.getAttribute("aria-current")).toBe("page")
    expect(usageButton.getAttribute("aria-current")).toBeNull()

    fireEvent.click(usageButton)
    expect(mockNavigate).toHaveBeenCalledWith("/?view=usage")
  })
})

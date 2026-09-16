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
  it("展开模式下渲染索引、日程与用量三个导航项，并按 view 查询参数高亮", () => {
    render(<HomeLeftSideBar isCollapsed={false} />)

    const indexItem = screen.getByRole("button", { name: /index|索引/i })
    const scheduleItem = screen.getByRole("button", { name: /schedule|日程/i })
    const usageItem = screen.getByRole("button", { name: /usage|用量统计/i })
    expect(indexItem.getAttribute("aria-current")).toBe("page")
    expect(scheduleItem.getAttribute("aria-current")).toBeNull()
    expect(usageItem.getAttribute("aria-current")).toBeNull()

    // 统一使用默认尺寸的 LxNavItem
    expect(indexItem.className).toContain("lx-nav-item")
    expect(indexItem.className).toContain("h-7")
    expect(indexItem.getAttribute("data-item-level")).toBe("1")

    fireEvent.click(scheduleItem)
    expect(mockNavigate).toHaveBeenCalledWith("/?view=schedule")

    fireEvent.click(usageItem)
    expect(mockNavigate).toHaveBeenCalledWith("/?view=usage")
  })

  it("view=schedule 时高亮日程项，点击索引回到根路径", () => {
    mockParams.value = new URLSearchParams("view=schedule")
    render(<HomeLeftSideBar isCollapsed={false} />)

    const indexItem = screen.getByRole("button", { name: /index|索引/i })
    const scheduleItem = screen.getByRole("button", { name: /schedule|日程/i })
    expect(scheduleItem.getAttribute("aria-current")).toBe("page")
    expect(indexItem.getAttribute("aria-current")).toBeNull()

    fireEvent.click(indexItem)
    expect(mockNavigate).toHaveBeenCalledWith("/")
  })

  it("view=usage 时高亮用量项，点击索引回到根路径", () => {
    mockParams.value = new URLSearchParams("view=usage")
    render(<HomeLeftSideBar isCollapsed={false} />)

    const indexItem = screen.getByRole("button", { name: /index|索引/i })
    const usageItem = screen.getByRole("button", { name: /usage|用量统计/i })
    expect(usageItem.getAttribute("aria-current")).toBe("page")
    expect(indexItem.getAttribute("aria-current")).toBeNull()

    fireEvent.click(indexItem)
    expect(mockNavigate).toHaveBeenCalledWith("/")
  })

  it("折叠模式下退化为图标按钮并保留可访问名称", () => {
    render(<HomeLeftSideBar isCollapsed={true} />)

    const indexButton = screen.getByRole("button", { name: /index|索引/i })
    const scheduleButton = screen.getByRole("button", { name: /schedule|日程/i })
    const usageButton = screen.getByRole("button", { name: /usage|用量统计/i })
    expect(indexButton.getAttribute("aria-current")).toBe("page")
    expect(scheduleButton.getAttribute("aria-current")).toBeNull()
    expect(usageButton.getAttribute("aria-current")).toBeNull()
    // 折叠态与展开态同层级（根级导航）
    expect(indexButton.getAttribute("data-item-level")).toBe("1")

    fireEvent.click(scheduleButton)
    expect(mockNavigate).toHaveBeenCalledWith("/?view=schedule")

    fireEvent.click(usageButton)
    expect(mockNavigate).toHaveBeenCalledWith("/?view=usage")
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HomeLeftSideBar } from "@/pages/home/components/HomeLeftSideBar"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("HomeLeftSideBar", () => {
  it("展开模式下渲染标题与概览导航项", () => {
    render(<HomeLeftSideBar isCollapsed={false} />)

    const overviewItem = screen.getByRole("button", { name: /overview|概览/i })
    expect(overviewItem).toBeDefined()
    expect(overviewItem.getAttribute("aria-current")).toBe("page")

    fireEvent.click(overviewItem)
    expect(mockNavigate).toHaveBeenCalledWith("/")

    const sessionsItem = screen.getByRole("button", { name: /sessions|全局会话/i })
    expect(sessionsItem).toBeDefined()
    fireEvent.click(sessionsItem)
    expect(mockNavigate).toHaveBeenCalledWith("/?view=sessions")

    const skillsItem = screen.getByRole("button", { name: /skills|技能与工具/i })
    expect(skillsItem).toBeDefined()
    fireEvent.click(skillsItem)
    expect(mockNavigate).toHaveBeenCalledWith("/?view=skills")
  })

  it("折叠模式下退化为图标按钮并保留可访问名称", () => {
    render(<HomeLeftSideBar isCollapsed={true} />)

    const iconButton = screen.getByRole("button", { name: /overview|概览/i })
    expect(iconButton).toBeDefined()
    expect(iconButton.getAttribute("aria-current")).toBe("page")

    fireEvent.click(iconButton)
    expect(mockNavigate).toHaveBeenCalledWith("/")

    const sessionsButton = screen.getByRole("button", { name: /sessions|全局会话/i })
    expect(sessionsButton).toBeDefined()
    fireEvent.click(sessionsButton)
    expect(mockNavigate).toHaveBeenCalledWith("/?view=sessions")
  })
})

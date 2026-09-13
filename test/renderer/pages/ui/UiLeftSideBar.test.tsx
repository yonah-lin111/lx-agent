// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { I18nProvider } from "@/i18n"
import { UiLeftSideBar } from "@/pages/ui/components/UiLeftSideBar"

const { mockNavigate, mockParams } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockParams: { value: new URLSearchParams() },
}))

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockParams.value],
}))

const renderSideBar = (isCollapsed = false): ReturnType<typeof render> =>
  render(
    <I18nProvider>
      <UiLeftSideBar isCollapsed={isCollapsed} />
    </I18nProvider>,
  )

describe("UiLeftSideBar 统一 LxNavItem", () => {
  beforeEach(() => {
    mockParams.value = new URLSearchParams()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("展开态分组头与条目均为默认尺寸的 LxNavItem，条目缩进一级", () => {
    renderSideBar()

    const groupHeader = screen.getByText(/^(Common|通用组件)$/).closest(".lx-nav-item")
    expect(groupHeader).not.toBeNull()
    expect(groupHeader?.className).toContain("h-7")
    expect(groupHeader?.getAttribute("aria-expanded")).toBe("true")

    const sectionItem = screen.getByText("LxIconButton").closest(".lx-nav-item")
    expect(sectionItem).not.toBeNull()
    expect(sectionItem?.className).toContain("h-7")
    expect(sectionItem?.getAttribute("aria-current")).toBe("page")
    expect((sectionItem as HTMLElement).style.marginLeft).toBe("10px")
  })

  it("点击分组头折叠其下条目，再次点击恢复", () => {
    renderSideBar()

    const groupHeader = screen.getByText(/^(Common|通用组件)$/)!
    fireEvent.click(groupHeader)
    expect(screen.queryByText("LxIconButton")).toBeNull()

    fireEvent.click(groupHeader)
    expect(screen.getByText("LxIconButton")).not.toBeNull()
  })

  it("点击条目导航到对应 section", () => {
    renderSideBar()

    fireEvent.click(screen.getByText("LxCheckbox"))
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("section=checkbox"))
  })

  it("折叠态渲染图标行并保留可访问名称", () => {
    renderSideBar(true)

    const iconRow = screen.getByRole("button", { name: "LxIconButton" })
    expect(iconRow.className).toContain("lx-nav-item")
    expect(iconRow.className).toContain("h-7")

    fireEvent.click(iconRow)
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("section=icon-button"))
  })
})

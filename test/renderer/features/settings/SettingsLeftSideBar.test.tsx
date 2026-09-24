// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSettingsDraftStore } from "@/features/settings/hooks/settingsDraftStore"
import { I18nProvider } from "@/i18n"
import { SettingsLeftSideBar } from "@/pages/settings/components/SettingsLeftSideBar"

const { mockNavigate, mockParams } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockParams: { value: new URLSearchParams("section=general") },
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockParams.value, vi.fn()],
  }
})

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const renderSideBar = (isCollapsed = false): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <I18nProvider>
        <SettingsLeftSideBar isCollapsed={isCollapsed} />
      </I18nProvider>
    </MemoryRouter>,
  )

describe("SettingsLeftSideBar navigation guard", () => {
  beforeEach(() => {
    cleanup()
    mockNavigate.mockClear()
    mockParams.value = new URLSearchParams("section=general")
    useSettingsDraftStore.getState().setActiveSection("general")
  })

  it("在未修改（Clean）状态下点击其他分区直接导航", () => {
    renderSideBar()

    const modelsButton = screen.getByRole("button", { name: "Models" })
    // 分区为分组下的叶子行，统一使用默认尺寸的 LxNavItem 并缩进一级
    expect(modelsButton.className).toContain("lx-nav-item")
    expect(modelsButton.className).toContain("h-7")
    expect(modelsButton.getAttribute("data-item-level")).toBe("3")
    expect((modelsButton as HTMLElement).style.marginLeft).toBe("10px")
    fireEvent.click(modelsButton)

    expect(mockNavigate).toHaveBeenCalledWith("/settings?section=models")
  })

  it("在脏数据（Dirty）状态下点击其他分区弹出未保存确认弹窗并拦截导航", () => {
    const resetMock = vi.fn()
    const mockController = {
      isDirty: true,
      isSaving: false,
      error: null,
      save: vi.fn(),
      reset: resetMock,
    }
    useSettingsDraftStore.getState().registerController("general", mockController)

    renderSideBar()

    const modelsButton = screen.getByRole("button", { name: "Models" })
    fireEvent.click(modelsButton)

    // 拦截导航
    expect(mockNavigate).not.toHaveBeenCalled()
    // 弹出未保存修改弹窗
    expect(screen.getByText("Unsaved Changes")).toBeTruthy()

    // 点击“留在此页”
    const stayButton = screen.getByRole("button", { name: "Stay on Page" })
    fireEvent.click(stayButton)

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(resetMock).not.toHaveBeenCalled()
  })

  it("在未保存确认弹窗中选择放弃并离开，重置草稿并继续导航", () => {
    const resetMock = vi.fn()
    const mockController = {
      isDirty: true,
      isSaving: false,
      error: null,
      save: vi.fn(),
      reset: resetMock,
    }
    useSettingsDraftStore.getState().registerController("general", mockController)

    renderSideBar()

    const modelsButton = screen.getByRole("button", { name: "Models" })
    fireEvent.click(modelsButton)

    // 点击“放弃并离开”
    const discardButton = screen.getByRole("button", { name: "Discard & Leave" })
    fireEvent.click(discardButton)

    expect(resetMock).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith("/settings?section=models")
  })
})

describe("SettingsLeftSideBar 分组导航", () => {
  beforeEach(() => {
    cleanup()
    mockNavigate.mockClear()
    mockParams.value = new URLSearchParams("section=general")
    useSettingsDraftStore.getState().setActiveSection("general")
  })

  it("分组头为一级行且默认展开，其下分区为缩进一级的叶子行", () => {
    renderSideBar()

    const groupHeader = screen.getByRole("button", { name: "Models & Cost" })
    expect(groupHeader.getAttribute("data-item-level")).toBe("1")
    expect(groupHeader.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: "Token Saver" })).toBeTruthy()
  })

  it("点击分组头折叠其下分区，再次点击恢复展开", () => {
    renderSideBar()

    const groupHeader = screen.getByRole("button", { name: "Agent Behavior" })
    fireEvent.click(groupHeader)

    expect(groupHeader.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("button", { name: "Permissions" })).toBeNull()

    fireEvent.click(groupHeader)

    expect(groupHeader.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: "Permissions" })).toBeTruthy()
  })

  it("切换分区到被折叠分组内的分区时自动展开该分组并高亮该项", () => {
    const { rerender } = renderSideBar()
    const groupHeader = screen.getByRole("button", { name: "Agent Behavior" })

    fireEvent.click(groupHeader)
    expect(screen.queryByRole("button", { name: "Permissions" })).toBeNull()

    mockParams.value = new URLSearchParams("section=permissions")
    rerender(
      <MemoryRouter>
        <I18nProvider>
          <SettingsLeftSideBar />
        </I18nProvider>
      </MemoryRouter>,
    )

    expect(
      screen.getByRole("button", { name: "Agent Behavior" }).getAttribute("aria-expanded"),
    ).toBe("true")
    expect(screen.getByRole("button", { name: "Permissions" }).getAttribute("aria-current")).toBe(
      "page",
    )
  })

  it("折叠态平铺全部分区图标并保留分组分隔线，忽略分组折叠", () => {
    renderSideBar(true)

    const nav = within(screen.getByRole("navigation", { name: "Settings" }))
    expect(nav.getAllByRole("button")).toHaveLength(16)
    expect(nav.queryByRole("button", { name: "Models & Cost" })).toBeNull()
    expect(document.querySelectorAll('[data-group-divider="true"]')).toHaveLength(4)

    const modelsIcon = nav.getByRole("button", { name: "Models" })
    expect(modelsIcon.getAttribute("data-item-level")).toBe("3")
    fireEvent.click(modelsIcon)
    expect(mockNavigate).toHaveBeenCalledWith("/settings?section=models")
  })
})

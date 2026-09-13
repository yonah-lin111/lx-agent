// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSettingsDraftStore } from "@/features/settings/hooks/settingsDraftStore"
import { I18nProvider } from "@/i18n"
import { SettingsLeftSideBar } from "@/pages/settings/components/SettingsLeftSideBar"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams("section=general"), vi.fn()],
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

describe("SettingsLeftSideBar navigation guard", () => {
  beforeEach(() => {
    cleanup()
    mockNavigate.mockClear()
    useSettingsDraftStore.getState().setActiveSection("general")
  })

  it("在未修改（Clean）状态下点击其他分区直接导航", () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <SettingsLeftSideBar />
        </I18nProvider>
      </MemoryRouter>,
    )

    const modelsButton = screen.getByRole("button", { name: "Models" })
    // 统一使用默认尺寸的 LxNavItem
    expect(modelsButton.className).toContain("lx-nav-item")
    expect(modelsButton.className).toContain("h-7")
    expect(modelsButton.getAttribute("data-item-level")).toBe("1")
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

    render(
      <MemoryRouter>
        <I18nProvider>
          <SettingsLeftSideBar />
        </I18nProvider>
      </MemoryRouter>,
    )

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

    render(
      <MemoryRouter>
        <I18nProvider>
          <SettingsLeftSideBar />
        </I18nProvider>
      </MemoryRouter>,
    )

    const modelsButton = screen.getByRole("button", { name: "Models" })
    fireEvent.click(modelsButton)

    // 点击“放弃并离开”
    const discardButton = screen.getByRole("button", { name: "Discard & Leave" })
    fireEvent.click(discardButton)

    expect(resetMock).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith("/settings?section=models")
  })
})

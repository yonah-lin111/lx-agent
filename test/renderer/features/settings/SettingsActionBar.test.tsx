// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SettingsActionBar } from "@/features/settings/components/SettingsActionBar"
import { useSettingsDraftStore } from "@/features/settings/hooks/settingsDraftStore"
import { I18nProvider } from "@/i18n"

// mock ResizeObserver for jsdom
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

describe("SettingsActionBar", () => {
  beforeEach(() => {
    cleanup()
    useSettingsDraftStore.getState().setActiveSection("general")
  })

  it("在已保存（Clean）状态下展示已保存且按钮禁用", () => {
    render(
      <I18nProvider>
        <SettingsActionBar />
      </I18nProvider>,
    )

    // 小圆点通过 aria-label 表达状态，不渲染冗余文字
    expect(screen.getByLabelText("All settings saved")).toBeTruthy()

    // 重置与保存按钮处于 disabled 状态
    const resetButton = screen.getByRole("button", { name: "Reset" })
    const saveButton = screen.getByRole("button", { name: "Save" })
    expect(resetButton.hasAttribute("disabled")).toBe(true)
    expect(saveButton.hasAttribute("disabled")).toBe(true)
  })

  it("在脏数据（Dirty）状态下点亮保存与重置按钮", () => {
    const mockController = {
      isDirty: true,
      isSaving: false,
      error: null,
      save: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
    }
    useSettingsDraftStore.getState().registerController("general", mockController)

    render(
      <I18nProvider>
        <SettingsActionBar />
      </I18nProvider>,
    )

    expect(screen.getByLabelText("Unsaved changes")).toBeTruthy()

    const resetButton = screen.getByRole("button", { name: "Reset" })
    const saveButton = screen.getByRole("button", { name: "Save" })
    expect(resetButton.hasAttribute("disabled")).toBe(false)
    expect(saveButton.hasAttribute("disabled")).toBe(false)
  })

  it("点击保存按钮触发 store 的 save", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined)
    const mockController = {
      isDirty: true,
      isSaving: false,
      error: null,
      save: saveMock,
      reset: vi.fn(),
    }
    useSettingsDraftStore.getState().registerController("general", mockController)

    render(
      <I18nProvider>
        <SettingsActionBar />
      </I18nProvider>,
    )

    const saveButton = screen.getByRole("button", { name: "Save" })
    fireEvent.click(saveButton)

    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  it("点击重置按钮弹出二次确认气泡，确认后触发 reset", () => {
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
      <I18nProvider>
        <SettingsActionBar />
      </I18nProvider>,
    )

    const resetButton = screen.getByRole("button", { name: "Reset" })
    fireEvent.click(resetButton)

    // 弹出 LxTooltip 二次确认气泡
    expect(screen.getByText("Discard Changes & Reset?")).toBeTruthy()
    expect(resetMock).not.toHaveBeenCalled()

    // 点击气泡中的“Confirm”按钮
    const confirmButton = document.querySelector(
      'button[aria-label="Confirm"]',
    ) as HTMLButtonElement
    expect(confirmButton).toBeTruthy()
    fireEvent.click(confirmButton)

    expect(resetMock).toHaveBeenCalledTimes(1)
  })

  it("在二次确认气泡中点击取消不会触发 reset", () => {
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
      <I18nProvider>
        <SettingsActionBar />
      </I18nProvider>,
    )

    const resetButton = screen.getByRole("button", { name: "Reset" })
    fireEvent.click(resetButton)

    expect(screen.getByText("Discard Changes & Reset?")).toBeTruthy()

    // 点击取消
    const cancelButton = document.querySelector('button[aria-label="Cancel"]') as HTMLButtonElement
    expect(cancelButton).toBeTruthy()
    fireEvent.click(cancelButton)

    expect(resetMock).not.toHaveBeenCalled()
  })
})

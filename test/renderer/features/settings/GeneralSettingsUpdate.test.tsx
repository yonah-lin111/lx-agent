// @vitest-environment jsdom
import type { UpdateState } from "@shared/contracts/update"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GeneralSettings } from "@/features/settings/components/GeneralSettings"
import { I18nProvider } from "@/i18n"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const RELEASE_URL = "https://github.com/yonah-lin111/lx-agent/releases/tag/v0.2.0"

const uiSettings = {
  locale: "en",
  screenshotCleanupEnabled: true,
  agentCompletionNotifyEnabled: true,
  openclawCompletionNotifyEnabled: true,
}

const baseState: UpdateState = {
  currentVersion: "0.1.0",
  latestVersion: null,
  hasUpdate: false,
  releaseUrl: null,
  checkedAt: null,
  failed: false,
}

const mocks = {
  getUpdateState: vi.fn(),
  checkUpdate: vi.fn(),
}

const renderSettings = (): void => {
  render(
    <I18nProvider>
      <GeneralSettings />
    </I18nProvider>,
  )
}

describe("GeneralSettings 版本与更新", () => {
  beforeEach(() => {
    cleanup()
    mocks.getUpdateState.mockReset()
    mocks.checkUpdate.mockReset()
    mocks.getUpdateState.mockResolvedValue(baseState)

    window.api = {
      settings: {
        getUiSettings: vi.fn().mockResolvedValue(uiSettings),
        saveUiSettings: vi.fn().mockResolvedValue(uiSettings),
      },
      update: {
        getState: mocks.getUpdateState,
        check: mocks.checkUpdate,
        onStateChanged: vi.fn(() => () => {}),
      },
    } as unknown as typeof window.api
  })

  it("展示当前版本，手动检查后提示已是最新", async () => {
    mocks.checkUpdate.mockResolvedValue({ ...baseState, checkedAt: 1 })

    renderSettings()

    await waitFor(() => {
      expect(screen.getByText("Current version 0.1.0")).toBeDefined()
    })

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }))

    await waitFor(() => {
      expect(mocks.checkUpdate).toHaveBeenCalledTimes(1)
      expect(screen.getByText("You are on the latest version")).toBeDefined()
    })
  })

  it("发现新版本时给出升级提示与下载入口", async () => {
    mocks.checkUpdate.mockResolvedValue({
      ...baseState,
      latestVersion: "0.2.0",
      hasUpdate: true,
      releaseUrl: RELEASE_URL,
      checkedAt: 1,
    })

    renderSettings()

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }))

    await waitFor(() => {
      expect(screen.getByText("New version 0.2.0 is available")).toBeDefined()
    })
    expect(screen.getByText("Download").getAttribute("href")).toBe(RELEASE_URL)
  })

  it("检查失败时给出失败提示", async () => {
    mocks.checkUpdate.mockResolvedValue({ ...baseState, checkedAt: 1, failed: true })

    renderSettings()

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }))

    await waitFor(() => {
      expect(screen.getByText("Check failed, please try again later")).toBeDefined()
    })
  })
})

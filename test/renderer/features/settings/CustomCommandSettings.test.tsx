// @vitest-environment jsdom

import type { CustomCommandDetailItem } from "@shared/contracts/customCommand"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CustomCommandSettings } from "@/features/settings/components/CustomCommandSettings"
import { useSettingsDraftStore } from "@/features/settings/hooks/settingsDraftStore"
import { I18nProvider } from "@/i18n"

// jsdom 未实现 ResizeObserver（LxSelect 滚动定位依赖），用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const listCommands = vi.fn<() => Promise<CustomCommandDetailItem[]>>()

const loadedCommands = (): CustomCommandDetailItem[] => [
  {
    name: "alpha",
    type: "agentInput",
    scope: "user",
    filePath: "/tmp/alpha.md",
    description: "Alpha",
    content: "alpha content",
  },
  {
    name: "beta",
    type: "agentInput",
    scope: "user",
    filePath: "/tmp/beta.md",
    description: "Beta",
    content: "beta content",
  },
]

const renderComponent = (): ReturnType<typeof render> =>
  render(
    <I18nProvider>
      <CustomCommandSettings />
    </I18nProvider>,
  )

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useSettingsDraftStore.getState().setActiveSection("custom-commands")
  listCommands.mockResolvedValue(loadedCommands())
  window.api = {
    customCommand: { list: listCommands },
    project: { projects: { list: async () => [] } },
  } as unknown as typeof window.api
})

describe("CustomCommandSettings 命令行", () => {
  it("以 role=button 暴露并支持点击切换选中后同步表单", async () => {
    renderComponent()
    await screen.findByText("alpha")

    const betaRow = screen.getByText("beta").closest('[role="button"]')
    expect(betaRow).not.toBeNull()

    fireEvent.click(betaRow as Element)

    expect(await screen.findByDisplayValue("beta")).toBeTruthy()
  })

  it("支持键盘 Enter 切换选中", async () => {
    renderComponent()
    await screen.findByText("alpha")

    const alphaRow = screen.getByText("alpha").closest('[role="button"]') as Element
    fireEvent.click(screen.getByText("beta").closest('[role="button"]') as Element)
    await screen.findByDisplayValue("beta")

    fireEvent.keyDown(alphaRow, { key: "Enter" })

    expect(await screen.findByDisplayValue("alpha")).toBeTruthy()
  })
})

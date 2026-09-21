// @vitest-environment jsdom

import type { ModelProviderSettings as ModelProviderSettingsData } from "@shared/settings"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LxBreadcrumbToast, LxToastProvider } from "@/components/ui/LxToast"
import { ModelProviderSettings } from "@/features/settings/components/ModelProviderSettings"
import { I18nProvider } from "@/i18n"

// jsdom 未实现 ResizeObserver（LxSelect/LxTooltip 定位依赖），用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const fetchModels = vi.fn()
const refreshOpencodeGo = vi.fn()
const getModelProviders = vi.fn()

const emptySettings = (): ModelProviderSettingsData => ({
  enabledProviders: [],
  providers: {},
  defaultModel: { provider: "", model: "" },
  titleSummary: { provider: "", model: "" },
  suggestedQuestions: { provider: "", model: "" },
  suggestedQuestionsEnabled: false,
  compactionEnabled: true,
})

// 真实状态宿主：断言组件通过 setSettings 请求的状态迁移，并暴露当前状态探针。
const TestHost = ({ initial }: { initial: ModelProviderSettingsData }): React.JSX.Element => {
  const [settings, setSettings] = useState<ModelProviderSettingsData | null>(initial)
  return (
    <>
      {settings ? <ModelProviderSettings settings={settings} setSettings={setSettings} /> : null}
      <pre data-testid="state-probe">{JSON.stringify(settings)}</pre>
    </>
  )
}

const probe = (): ModelProviderSettingsData =>
  JSON.parse(screen.getByTestId("state-probe").textContent ?? "{}") as ModelProviderSettingsData

const renderComponent = (initial = emptySettings()): void => {
  render(
    <I18nProvider>
      <LxToastProvider>
        <LxBreadcrumbToast />
        <TestHost initial={initial} />
      </LxToastProvider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.api = {
    settings: {
      getUiSettings: async () => ({ locale: "en" as const }),
      fetchModels,
      refreshOpencodeGo,
      getModelProviders,
    },
  } as unknown as typeof window.api
})

describe("ModelProviderSettings OpenCode Go 单预设", () => {
  it("空配置下展示一键添加入口，点击后建成单个预设并自动启用", () => {
    renderComponent()

    fireEvent.click(screen.getByLabelText("Add OpenCode Go"))

    const state = probe()
    expect(Object.keys(state.providers)).toEqual(["opencode-go"])
    expect(state.enabledProviders).toEqual(["opencode-go"])
    expect(state.providers["opencode-go"].options.baseURL).toBe("https://opencode.ai/zen/go/v1")
    expect(Object.keys(state.providers["opencode-go"].models)).toHaveLength(28)
    // 建成后入口消失。
    expect(screen.queryByLabelText("Add OpenCode Go")).toBeNull()
    expect(screen.getByText(/OpenCode Go provider added/)).not.toBeNull()
  })

  it("键盘 Enter 同样触发一键添加", () => {
    renderComponent()

    fireEvent.keyDown(screen.getByLabelText("Add OpenCode Go"), { key: "Enter" })

    expect(Object.keys(probe().providers)).toEqual(["opencode-go"])
  })

  it("Go 预设的 provider 级 type 锁定为自动适配，不可选择", () => {
    renderComponent()
    fireEvent.click(screen.getByLabelText("Add OpenCode Go"))

    // 类型下拉消失，展示只读的自动适配文案。
    expect(screen.queryByLabelText("Provider Type")).toBeNull()
    expect(screen.getByText("Auto (per-model)")).not.toBeNull()
  })

  it("已有预设时不展示入口", () => {
    const initial = emptySettings()
    initial.providers = {
      "opencode-go": {
        id: "opencode-go",
        type: "openai-compatible",
        name: "OpenCode Go",
        options: { apiKey: "", baseURL: "https://opencode.ai/zen/go/v1" },
        models: {},
      },
    }
    renderComponent(initial)

    expect(screen.queryByLabelText("Add OpenCode Go")).toBeNull()
  })

  it("预设在导航列表中置顶且带主题标识底色", () => {
    const initial = emptySettings()
    initial.providers = {
      custom: {
        id: "custom",
        type: "openai",
        name: "Custom",
        options: { apiKey: "", baseURL: "" },
        models: {},
      },
      "opencode-go": {
        id: "opencode-go",
        type: "openai-compatible",
        name: "OpenCode Go",
        options: { apiKey: "", baseURL: "https://opencode.ai/zen/go/v1" },
        models: {},
      },
    }
    initial.enabledProviders = ["custom", "opencode-go"]
    renderComponent(initial)

    // 导航行按 DOM 顺序排列：预设先于自定义。
    const navButtons = screen.getAllByRole("button", { name: /Custom|OpenCode Go/ })
    expect(navButtons.map((button) => button.textContent)).toEqual(["OpenCode Go", "Custom"])
    // 预设行经主题 accent 取色标识，未选中为 10% tint。
    expect(navButtons[0]?.className).toContain("var(--color-theme-accent)")
    expect(navButtons[1]?.className).not.toContain("var(--color-theme-accent)")
  })

  it("仅 Go 选中时展示云端更新按钮，点击后刷新配置并提示计数", async () => {
    const initial = emptySettings()
    initial.providers = {
      "opencode-go": {
        id: "opencode-go",
        type: "openai-compatible",
        name: "OpenCode Go",
        options: { apiKey: "sk-go", baseURL: "https://opencode.ai/zen/go/v1" },
        models: {},
      },
      other: {
        id: "other",
        type: "openai",
        name: "Other",
        options: { apiKey: "", baseURL: "" },
        models: {},
      },
    }
    const refreshed = structuredClone(initial)
    refreshed.providers["opencode-go"].models = {
      "new-model": { id: "new-model", name: "New Model" },
    }
    refreshOpencodeGo.mockResolvedValue({
      providerId: "opencode-go",
      added: ["new-model"],
      updated: [],
    })
    getModelProviders.mockResolvedValue(refreshed)
    renderComponent(initial)

    // 默认选中首个 Provider（opencode-go），云端按钮可见。
    expect(screen.getByLabelText("Refresh models from cloud")).not.toBeNull()

    fireEvent.click(screen.getByLabelText("Refresh models from cloud"))
    await screen.findByText("Cloud update complete: 1 new, 0 updated")

    expect(refreshOpencodeGo).toHaveBeenCalledTimes(1)
    expect(getModelProviders).toHaveBeenCalledTimes(1)
    expect(probe().providers["opencode-go"].models["new-model"].name).toBe("New Model")

    // 切到非 Go 后按钮消失。
    fireEvent.click(screen.getByText("Other").closest('[role="button"]') as Element)
    expect(screen.queryByLabelText("Refresh models from cloud")).toBeNull()
  })

  it("云端更新失败时提示错误且状态不变", async () => {
    const initial = emptySettings()
    initial.providers = {
      "opencode-go": {
        id: "opencode-go",
        type: "openai-compatible",
        name: "OpenCode Go",
        options: { apiKey: "", baseURL: "https://opencode.ai/zen/go/v1" },
        models: {},
      },
    }
    refreshOpencodeGo.mockRejectedValue(new Error("offline"))
    renderComponent(initial)

    fireEvent.click(screen.getByLabelText("Refresh models from cloud"))
    await screen.findByText("Cloud update failed, please retry later")

    expect(probe().providers["opencode-go"].models).toEqual({})
  })
})

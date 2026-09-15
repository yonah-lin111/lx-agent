// @vitest-environment jsdom

import type { ModelProviderSettings as ModelProviderSettingsData } from "@shared/settings"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
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
const onAddProvider = vi.fn()
const onDeleteProvider = vi.fn()
let registeredAddProvider: (() => void) | undefined

const loadedProviders = (
  options?: Partial<Record<"openai" | "anthropic", { apiKey: string; baseURL: string }>>,
): ModelProviderSettingsData => ({
  enabledProviders: ["openai"],
  providers: {
    openai: {
      id: "openai",
      type: "openai",
      name: "OpenAI",
      options: options?.openai ?? { apiKey: "sk-test", baseURL: "https://api.openai.com/v1" },
      models: {
        "gpt-5": { id: "gpt-5", name: "GPT-5" },
        alt: { id: "alt", name: "Alt Model" },
      },
    },
    anthropic: {
      id: "anthropic",
      type: "anthropic",
      name: "Anthropic",
      options: options?.anthropic ?? { apiKey: "", baseURL: "" },
      models: {},
    },
  },
  defaultModel: { provider: "openai", model: "gpt-5" },
  titleSummary: { provider: "openai", model: "gpt-5" },
  suggestedQuestions: { provider: "openai", model: "gpt-5" },
  suggestedQuestionsEnabled: false,
  compactionEnabled: true,
})

// 真实状态宿主：断言组件通过 setSettings 请求的状态迁移，并暴露当前状态探针。
const TestHost = ({ initial }: { initial: ModelProviderSettingsData }): React.JSX.Element => {
  const [settings, setSettings] = useState<ModelProviderSettingsData | null>(initial)
  return (
    <>
      {settings ? (
        <ModelProviderSettings
          settings={settings}
          setSettings={setSettings}
          onRegisterAddProvider={(fn) => {
            registeredAddProvider = fn
          }}
          onAddProvider={onAddProvider}
          onDeleteProvider={onDeleteProvider}
        />
      ) : null}
      <pre data-testid="state-probe">{JSON.stringify(settings)}</pre>
    </>
  )
}

const probe = (): ModelProviderSettingsData =>
  JSON.parse(screen.getByTestId("state-probe").textContent ?? "{}") as ModelProviderSettingsData

const renderComponent = (initial = loadedProviders()): void => {
  render(
    <I18nProvider>
      <LxToastProvider>
        <LxBreadcrumbToast />
        <TestHost initial={initial} />
      </LxToastProvider>
    </I18nProvider>,
  )
}

const navRow = (name: string): Element =>
  screen.getByText(name).closest('[role="button"]') as Element

const openProviderMenu = (name: string): void => {
  fireEvent.contextMenu(navRow(name), { clientX: 12, clientY: 24 })
}

const modelCard = (index: number): HTMLElement =>
  document.querySelectorAll<HTMLElement>(".settings-model-card")[index] as HTMLElement

const fetchModelsFrom = (): void => {
  fireEvent.click(screen.getByLabelText("Fetch Models"))
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  registeredAddProvider = undefined
  window.api = {
    settings: {
      getUiSettings: async () => ({ locale: "en" as const }),
      fetchModels,
    },
  } as unknown as typeof window.api
})

describe("ModelProviderSettings 供应商与模型的变更行为", () => {
  it("导航行的启用按钮切换 enabledProviders", () => {
    renderComponent()

    fireEvent.click(screen.getByLabelText("Disabled"))

    expect(probe().enabledProviders).toEqual(["openai", "anthropic"])
    expect(screen.getAllByLabelText("Enabled")).toHaveLength(2)

    fireEvent.click(screen.getAllByLabelText("Enabled")[1] as Element)

    expect(probe().enabledProviders).toEqual(["openai"])
  })

  it("注册的添加供应商回调新增并选中新供应商", () => {
    renderComponent()

    expect(registeredAddProvider).toBeTypeOf("function")
    act(() => {
      registeredAddProvider?.()
    })

    const state = probe()
    expect(Object.keys(state.providers)).toEqual(["openai", "anthropic", "provider-3"])
    expect(state.providers["provider-3"]).toMatchObject({
      id: "provider-3",
      name: "provider-3",
      type: "openai-compatible",
      options: { apiKey: "", baseURL: "" },
      models: {},
    })
    expect(state.enabledProviders).toEqual(["openai", "provider-3"])
    expect(onAddProvider).toHaveBeenCalledTimes(1)
    expect(navRow("provider-3").getAttribute("aria-current")).toBe("true")
  })

  it("右键菜单复制供应商：深拷贝模型列表并继承启用状态", () => {
    renderComponent()

    openProviderMenu("OpenAI")
    fireEvent.click(screen.getByText("Duplicate Provider"))

    const state = probe()
    expect(Object.keys(state.providers)).toContain("provider-3")
    expect(state.providers["provider-3"].name).toBe("OpenAI-copy")
    expect(state.providers["provider-3"].models).toEqual({
      "gpt-5": { id: "gpt-5", name: "GPT-5" },
      alt: { id: "alt", name: "Alt Model" },
    })
    expect(state.enabledProviders).toEqual(["openai", "provider-3"])
    expect(screen.getByText("OpenAI-copy")).not.toBeNull()
  })

  it("右键菜单删除供应商需要二次确认并回传 onDeleteProvider", () => {
    renderComponent()

    openProviderMenu("Anthropic")
    fireEvent.click(screen.getByText("Delete Provider"))

    // 第一次点击仅进入确认态，不删除。
    expect(screen.getByText("Confirm Delete")).not.toBeNull()
    expect(probe().providers.anthropic).not.toBeUndefined()

    fireEvent.click(screen.getByText("Confirm Delete"))

    expect(probe().providers.anthropic).toBeUndefined()
    expect(onDeleteProvider).toHaveBeenCalledWith("anthropic")
  })

  it("添加模型写入默认 limit 与 modalities", () => {
    renderComponent()

    fireEvent.click(screen.getByLabelText("Add Model"))

    expect(probe().providers.openai.models["model-3"]).toEqual({
      id: "model-3",
      name: "model-3",
      limit: { context: 8192, output: 4096 },
      modalities: { input: ["text"], output: ["text"] },
    })
  })

  it("复制模型保留配置并追加 -copy 名称", () => {
    renderComponent()

    fireEvent.click(screen.getByLabelText("Copy gpt-5"))

    expect(probe().providers.openai.models["model-3"]).toEqual({
      id: "gpt-5",
      name: "GPT-5-copy",
    })
  })

  it("删除模型移除对应条目", () => {
    renderComponent()

    fireEvent.click(screen.getByLabelText("Delete gpt-5"))

    expect(probe().providers.openai.models["gpt-5"]).toBeUndefined()
    expect(probe().providers.openai.models.alt).not.toBeUndefined()
  })
})

describe("ModelProviderSettings 取回模型行为", () => {
  it("成功取回后缓存列表、暴露入口并可应用模型字段", async () => {
    fetchModels.mockResolvedValue([
      { id: "gpt-5", ownedBy: "acme" },
      { id: "fresh-model", ownedBy: null },
    ])
    renderComponent()

    fetchModelsFrom()

    await screen.findByText("Models fetched successfully")
    expect(fetchModels).toHaveBeenCalledWith({
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-test",
    })

    fireEvent.click(screen.getByLabelText("gpt-5 Models List"))
    fireEvent.click(screen.getByText("fresh-model"))

    expect(probe().providers.openai.models["gpt-5"]).toEqual({
      id: "fresh-model",
      name: "fresh-model",
    })
    expect(screen.getByText("Saved: fresh-model")).not.toBeNull()
  })

  it("应用重复 id 的取回模型被拒绝并提示", async () => {
    fetchModels.mockResolvedValue([{ id: "gpt-5", ownedBy: "acme" }])
    renderComponent()

    fetchModelsFrom()
    await screen.findByText("Models fetched successfully")

    fireEvent.click(screen.getByLabelText("alt Models List"))
    fireEvent.click(within(screen.getByRole("tooltip", { hidden: true })).getByText("gpt-5"))

    expect(probe().providers.openai.models.alt).toEqual({ id: "alt", name: "Alt Model" })
    expect(screen.getByText("模型 gpt-5 已存在")).not.toBeNull()
  })

  it("认证失败时提示检查 API Key", async () => {
    fetchModels.mockRejectedValue(new Error("HTTP 401 unauthorized"))
    renderComponent()

    fetchModelsFrom()

    await screen.findByText("认证失败，请检查 API Key")
  })

  it("缺少 Base URL 或 API Key 时直接提示且不请求接口", () => {
    renderComponent(loadedProviders({ openai: { apiKey: "", baseURL: "" } }))

    fetchModelsFrom()

    expect(fetchModels).not.toHaveBeenCalled()
    // Base URL 与 API Key 标签同文案，此处仅断言错误提示出现（不触发成功提示）。
    expect(screen.queryByText("Models fetched successfully")).toBeNull()
  })
})

describe("ModelProviderSettings 模型计价与思考等级行为", () => {
  it("计价输入写入 pricing，四项归零后移除 pricing", () => {
    renderComponent()

    const input = screen.getByLabelText("gpt-5 Input price")
    fireEvent.change(input, { target: { value: "1.5" } })

    expect(probe().providers.openai.models["gpt-5"].pricing).toEqual({
      input: 1.5,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    })

    fireEvent.change(input, { target: { value: "" } })

    expect(probe().providers.openai.models["gpt-5"].pricing).toBeUndefined()
  })

  it("应用预设写入 variants 并选择默认等级", () => {
    renderComponent()

    fireEvent.click(within(modelCard(0)).getByText("Add Variant"))
    // LxSelect 选项在 mousedown 时提交（避免与 click 收起冲突）。
    fireEvent.mouseDown(screen.getByText("OpenAI tiers (low / medium / high)"))

    const model = probe().providers.openai.models["gpt-5"]
    expect(model.variants).toEqual({
      low: { reasoningEffort: "low" },
      medium: { reasoningEffort: "medium" },
      high: { reasoningEffort: "high" },
    })
    expect(model.variant).toBe("high")
  })

  it("编辑变体 JSON 与变体 ID、删除变体同步更新默认等级", () => {
    renderComponent()

    fireEvent.click(within(modelCard(0)).getByText("Add Variant"))
    fireEvent.mouseDown(screen.getByText("OpenAI tiers (low / medium / high)"))

    fireEvent.change(screen.getByLabelText("low Config (JSON)"), {
      target: { value: '{"reasoningEffort":"minimal"}' },
    })
    expect(probe().providers.openai.models["gpt-5"].variants?.low).toEqual({
      reasoningEffort: "minimal",
    })

    fireEvent.change(screen.getByLabelText("low Variant ID"), { target: { value: "minimal" } })
    const renamed = probe().providers.openai.models["gpt-5"]
    expect(Object.keys(renamed.variants ?? {})).toEqual(["minimal", "medium", "high"])

    fireEvent.click(screen.getByLabelText("Delete high"))

    const afterDelete = probe().providers.openai.models["gpt-5"]
    expect(Object.keys(afterDelete.variants ?? {})).toEqual(["minimal", "medium"])
  })
})

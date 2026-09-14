// @vitest-environment jsdom

import type { ModelProviderSettings as ModelProviderSettingsData } from "@shared/settings"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ModelProviderSettings } from "@/features/settings/components/ModelProviderSettings"
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

const loadedProviders = (): ModelProviderSettingsData => ({
  enabledProviders: ["openai"],
  providers: {
    openai: {
      id: "openai",
      type: "openai",
      name: "OpenAI",
      options: { apiKey: "", baseURL: "" },
      models: { "gpt-5": { id: "gpt-5", name: "GPT-5" } },
    },
    anthropic: {
      id: "anthropic",
      type: "anthropic",
      name: "Anthropic",
      options: { apiKey: "", baseURL: "" },
      models: { "claude-sonnet": { id: "claude-sonnet", name: "Claude Sonnet" } },
    },
  },
  defaultModel: { provider: "openai", model: "gpt-5" },
  titleSummary: { provider: "openai", model: "gpt-5" },
  suggestedQuestions: { provider: "openai", model: "gpt-5" },
  suggestedQuestionsEnabled: false,
  compactionEnabled: true,
})

const renderComponent = (): ReturnType<typeof render> =>
  render(
    <I18nProvider>
      <ModelProviderSettings settings={loadedProviders()} setSettings={vi.fn()} />
    </I18nProvider>,
  )

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ModelProviderSettings 供应商导航行", () => {
  it("以 role=button 暴露并支持点击切换选中", () => {
    renderComponent()

    const openaiRow = screen.getByText("OpenAI").closest('[role="button"]')
    const anthropicRow = screen.getByText("Anthropic").closest('[role="button"]')
    expect(openaiRow?.getAttribute("aria-current")).toBe("true")
    expect(anthropicRow?.getAttribute("aria-current")).toBeNull()

    fireEvent.click(anthropicRow as Element)

    expect(anthropicRow?.getAttribute("aria-current")).toBe("true")
    expect(openaiRow?.getAttribute("aria-current")).toBeNull()
  })

  it("支持键盘 Enter 切换选中", () => {
    renderComponent()

    const openaiRow = screen.getByText("OpenAI").closest('[role="button"]') as Element
    const anthropicRow = screen.getByText("Anthropic").closest('[role="button"]') as Element
    fireEvent.click(anthropicRow)
    expect(openaiRow.getAttribute("aria-current")).toBeNull()

    fireEvent.keyDown(openaiRow, { key: "Enter" })

    expect(openaiRow.getAttribute("aria-current")).toBe("true")
    expect(anthropicRow.getAttribute("aria-current")).toBeNull()
  })
})

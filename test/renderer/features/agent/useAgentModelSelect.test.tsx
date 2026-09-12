// @vitest-environment jsdom
import type { ModelProviderSettings } from "@shared/settings"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  settings: null as ModelProviderSettings | null,
  listeners: new Set<() => void>(),
}))

vi.mock("@/features/agent/hooks/modelsStore", () => ({
  getModelDisplayName: (modelId?: string) => modelId ?? "",
  modelsStore: {
    subscribe: (listener: () => void) => {
      holder.listeners.add(listener)
      return () => holder.listeners.delete(listener)
    },
    getSettings: () => holder.settings,
  },
}))

import { useAgentModelSelect } from "@/features/agent/hooks/useAgentModelSelect"

const makeSettings = (modelVariant?: string): ModelProviderSettings => ({
  enabledProviders: ["p1"],
  providers: {
    p1: {
      id: "p1",
      type: "openai-compatible",
      name: "P1",
      options: { apiKey: "key", baseURL: "http://localhost" },
      models: {
        m1: {
          id: "m1",
          name: "M1",
          variants: {
            low: { reasoningEffort: "low" },
            medium: { reasoningEffort: "medium" },
          },
          ...(modelVariant ? { variant: modelVariant } : {}),
        },
        m2: {
          id: "m2",
          name: "M2",
          variants: {
            low: { reasoningEffort: "low" },
            high: { reasoningEffort: "high" },
          },
        },
      },
    },
  },
  defaultModel: { provider: "p1", model: "m1" },
  titleSummary: { provider: "p1", model: "m1" },
  suggestedQuestions: { provider: "p1", model: "m1" },
  suggestedQuestionsEnabled: true,
  compactionEnabled: true,
})

const renderSelect = async () => {
  const rendered = renderHook(() => useAgentModelSelect())
  await act(async () => {})
  return rendered
}

describe("useAgentModelSelect 思考等级默认值", () => {
  beforeEach(() => {
    holder.listeners.clear()
    localStorage.clear()
    holder.settings = makeSettings()
  })

  it("模型有 variants 但未配置默认等级时，不回退到第一个等级", async () => {
    const { result } = await renderSelect()

    expect(result.current.selectedModel).toBe("p1::m1")
    expect(result.current.selectedVariant).toBeUndefined()
    expect(result.current.selectedSelection).toEqual({ provider: "p1", model: "m1" })

    const group = result.current.selectOptions[0] as {
      options: Array<{ value: string; defaultVariant?: string }>
    }
    expect(
      group.options.find((option) => option.value === "p1::m1")?.defaultVariant,
    ).toBeUndefined()
  })

  it("模型配置了默认等级时选中该等级并随选择发送", async () => {
    holder.settings = makeSettings("medium")
    const { result } = await renderSelect()

    expect(result.current.selectedVariant).toBe("medium")
    expect(result.current.selectedSelection).toEqual({
      provider: "p1",
      model: "m1",
      variant: "medium",
    })
  })

  it("localStorage 保存的有效等级优先于模型默认等级", async () => {
    holder.settings = makeSettings("medium")
    localStorage.setItem(
      "agent-selected-model",
      JSON.stringify({ provider: "p1", model: "m1", variant: "low" }),
    )

    const { result } = await renderSelect()

    expect(result.current.selectedVariant).toBe("low")
    expect(result.current.selectedSelection).toEqual({
      provider: "p1",
      model: "m1",
      variant: "low",
    })
  })

  it("localStorage 保存的等级已失效且模型未配置默认等级时不携带等级", async () => {
    localStorage.setItem(
      "agent-selected-model",
      JSON.stringify({ provider: "p1", model: "m1", variant: "removed" }),
    )

    const { result } = await renderSelect()

    expect(result.current.selectedVariant).toBeUndefined()
    expect(result.current.selectedSelection).toEqual({ provider: "p1", model: "m1" })
  })

  it("切换到未配置默认等级的模型时清空已有等级", async () => {
    holder.settings = makeSettings("medium")
    const { result } = await renderSelect()
    expect(result.current.selectedVariant).toBe("medium")

    act(() => {
      result.current.handleModelChange("p1::m2")
    })

    expect(result.current.selectedModel).toBe("p1::m2")
    expect(result.current.selectedVariant).toBeUndefined()
    expect(result.current.selectedSelection).toEqual({ provider: "p1", model: "m2" })
  })
})

// @vitest-environment jsdom

import type {
  ModelProviderSettings,
  SubagentBuiltinRoleInfo,
  SubagentSettings as SubagentSettingsData,
} from "@shared/settings"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SubagentSettings } from "@/features/settings/components/SubagentSettings"
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

const getSubagentSettings = vi.fn<() => Promise<SubagentSettingsData>>()
const saveSubagentSettings =
  vi.fn<(settings: SubagentSettingsData) => Promise<SubagentSettingsData>>()
const getSubagentBuiltins = vi.fn<() => Promise<SubagentBuiltinRoleInfo[]>>()
const getModelProviders = vi.fn<() => Promise<ModelProviderSettings>>()
const getUiSettings = vi.fn(async () => ({ locale: "en" as const }))

const loadedBuiltins = (): SubagentBuiltinRoleInfo[] => [
  { name: "review", description: "Strict review of a change set" },
  { name: "explorer", description: "Fast codebase answers", tools: ["read", "grep", "lsp"] },
]

const loadedProviders = (): ModelProviderSettings => ({
  enabledProviders: ["openai"],
  providers: {
    openai: {
      id: "openai",
      type: "openai",
      name: "OpenAI",
      options: { apiKey: "", baseURL: "" },
      models: {
        "gpt-5": { id: "gpt-5", name: "GPT-5" },
        "gpt-5-mini": { id: "gpt-5-mini", name: "GPT-5 mini" },
      },
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
      <SubagentSettings />
    </I18nProvider>,
  )

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useSettingsDraftStore.getState().setActiveSection("subagents")
  getSubagentSettings.mockResolvedValue({ roles: {}, maxDepth: 1 })
  saveSubagentSettings.mockImplementation(async (settings) => settings)
  getSubagentBuiltins.mockResolvedValue(loadedBuiltins())
  getModelProviders.mockResolvedValue(loadedProviders())
  window.api = {
    settings: {
      getSubagentSettings,
      saveSubagentSettings,
      getSubagentBuiltins,
      getModelProviders,
      getUiSettings,
    },
  } as unknown as typeof window.api
})

describe("SubagentSettings", () => {
  it("内置角色只读展示名称、描述与工具/继承文案", async () => {
    renderComponent()

    expect(await screen.findByText("review")).toBeTruthy()
    expect(screen.getByText("explorer")).toBeTruthy()
    expect(screen.getByText("Strict review of a change set")).toBeTruthy()
    expect(screen.getByText("read, grep, lsp")).toBeTruthy()
    expect(screen.getByText("Inherit parent tools")).toBeTruthy()
    expect(screen.getByText("No custom roles yet")).toBeTruthy()

    // 内置角色无编辑/删除入口，且当前无自定义角色可操作。
    expect(screen.queryAllByRole("button", { name: "Edit" })).toHaveLength(0)
    expect(screen.queryAllByRole("button", { name: "Delete" })).toHaveLength(0)
  })

  it("新增角色经弹窗校验后进入列表，非法/保留/重名/空描述阻止提交", async () => {
    getSubagentSettings.mockResolvedValue({
      roles: { "my-reviewer": { description: "Existing role" } },
      maxDepth: 1,
    })
    renderComponent()
    await screen.findByText("my-reviewer")
    // 自定义角色来源标识。
    expect(screen.getByText("Custom")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Add Role" }))
    const nameInput = await screen.findByPlaceholderText("e.g. my-reviewer")
    const descInput = screen.getByPlaceholderText("Describe when the model should use this role")
    const confirm = (): void => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    }

    fireEvent.change(nameInput, { target: { value: "Bad Name" } })
    fireEvent.change(descInput, { target: { value: "ok" } })
    confirm()
    expect(await screen.findByText(/Name must start with a lowercase letter/)).toBeTruthy()

    fireEvent.change(nameInput, { target: { value: "review" } })
    confirm()
    expect(await screen.findByText("This name is reserved by a built-in role")).toBeTruthy()

    fireEvent.change(nameInput, { target: { value: "my-reviewer" } })
    confirm()
    expect(await screen.findByText("A role with this name already exists")).toBeTruthy()

    fireEvent.change(nameInput, { target: { value: "new-role" } })
    fireEvent.change(descInput, { target: { value: "   " } })
    confirm()
    expect(await screen.findByText("Description is required")).toBeTruthy()

    fireEvent.change(descInput, { target: { value: "Brand new role" } })
    confirm()
    expect(await screen.findByText("new-role")).toBeTruthy()
    expect(saveSubagentSettings).not.toHaveBeenCalled()
  })

  it("保存提交规范化载荷：工具去重、maxDepth 数值、继承模型省略", async () => {
    renderComponent()
    await screen.findByText("explorer")

    fireEvent.click(screen.getByRole("button", { name: "Add Role" }))
    fireEvent.change(await screen.findByPlaceholderText("e.g. my-reviewer"), {
      target: { value: "chunk-worker" },
    })
    fireEvent.change(screen.getByPlaceholderText("Describe when the model should use this role"), {
      target: { value: "Split work" },
    })
    fireEvent.change(screen.getByPlaceholderText(/One tool name per line/), {
      target: { value: "read\n grep \nread\n\n" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    await screen.findByText("chunk-worker")

    fireEvent.change(screen.getByLabelText("Max Nesting Depth"), { target: { value: "2" } })

    await useSettingsDraftStore.getState().save()
    await waitFor(() => expect(saveSubagentSettings).toHaveBeenCalledTimes(1))

    const payload = saveSubagentSettings.mock.calls[0]![0]
    expect(payload.maxDepth).toBe(2)
    expect(payload.maxConcurrent).toBeUndefined()
    expect(payload.defaultModel).toBeUndefined()
    expect(payload.roles["chunk-worker"]).toMatchObject({
      description: "Split work",
      tools: ["read", "grep"],
    })
  })

  it("全局输入更新保存载荷，并发留空时省略字段", async () => {
    renderComponent()
    await screen.findByText("explorer")

    fireEvent.change(screen.getByLabelText("Max Concurrent Subagents"), {
      target: { value: "5" },
    })
    fireEvent.change(screen.getByLabelText("Max Nesting Depth"), { target: { value: "3" } })

    await useSettingsDraftStore.getState().save()
    await waitFor(() => expect(saveSubagentSettings).toHaveBeenCalledTimes(1))
    expect(saveSubagentSettings.mock.calls[0]![0]).toMatchObject({
      maxConcurrent: 5,
      maxDepth: 3,
    })

    fireEvent.change(screen.getByLabelText("Max Concurrent Subagents"), {
      target: { value: "" },
    })
    await useSettingsDraftStore.getState().save()
    await waitFor(() => expect(saveSubagentSettings).toHaveBeenCalledTimes(2))
    expect(saveSubagentSettings.mock.calls[1]![0].maxConcurrent).toBeUndefined()
  })
})

// @vitest-environment jsdom

import type {
  ModelProviderSettings,
  SubagentBuiltinRoleInfo,
  SubagentCapabilityCatalog,
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
const getSubagentCapabilities = vi.fn<() => Promise<SubagentCapabilityCatalog>>()
const getModelProviders = vi.fn<() => Promise<ModelProviderSettings>>()
const getUiSettings = vi.fn(async () => ({ locale: "en" as const }))

const loadedBuiltins = (): SubagentBuiltinRoleInfo[] => [
  {
    name: "explorer",
    description: "Fast codebase answers",
    permissions: { tools: ["read", "grep"], websearch: ["web_search"], skills: [] },
    defaultPermissions: { tools: ["read", "grep"], websearch: ["web_search"], skills: [] },
  },
  { name: "worker", description: "Execution and production work" },
]

const loadedCapabilities = (): SubagentCapabilityCatalog => ({
  tools: ["read", "grep", "bash", "task"],
  mcp: [
    { name: "codegraph", connected: true },
    { name: "github", connected: false },
  ],
  skills: [
    { name: "code-review", disabled: false },
    { name: "deploy", disabled: true },
  ],
})

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
  getSubagentCapabilities.mockResolvedValue(loadedCapabilities())
  getModelProviders.mockResolvedValue(loadedProviders())
  window.api = {
    settings: {
      getSubagentSettings,
      saveSubagentSettings,
      getSubagentBuiltins,
      getSubagentCapabilities,
      getModelProviders,
      getUiSettings,
    },
  } as unknown as typeof window.api
})

describe("SubagentSettings", () => {
  it("内置角色只读展示名称、描述与工具/继承文案", async () => {
    renderComponent()

    expect(await screen.findByText("worker")).toBeTruthy()
    expect(screen.getByText("explorer")).toBeTruthy()
    // 子代理模式与最大并发提示各有 Info 图标；内置角色卡片接入主题钩子类。
    expect(screen.getAllByLabelText("Info")).toHaveLength(2)
    expect(screen.getByText("explorer").closest(".settings-item-card")).not.toBeNull()
    expect(screen.getByText("Execution and production work")).toBeTruthy()
    // 权限摘要：内置 explorer 展示分组计数，worker 展示不限制。
    expect(screen.getByText("Tools: 2 / Skills: 0 / Web: 1")).toBeTruthy()
    expect(screen.getByText("Unrestricted (inherit parent)")).toBeTruthy()
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
    // 自定义角色卡片同样接入主题钩子类。
    expect(screen.getByText("my-reviewer").closest(".settings-item-card")).not.toBeNull()

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
    expect(await screen.findByText("This name is reserved")).toBeTruthy()

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

  it("保存提交规范化载荷：权限白名单、maxDepth 数值、继承模型省略", async () => {
    renderComponent()
    await screen.findByText("explorer")

    fireEvent.click(screen.getByRole("button", { name: "Add Role" }))
    fireEvent.change(await screen.findByPlaceholderText("e.g. my-reviewer"), {
      target: { value: "chunk-worker" },
    })
    fireEvent.change(screen.getByPlaceholderText("Describe when the model should use this role"), {
      target: { value: "Split work" },
    })
    // 打开 tools 组限制（预置全选），清空后只勾 read 与 grep。
    fireEvent.click(screen.getByRole("checkbox", { name: /^Tools/ }))
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    const readItem = screen.getByRole("checkbox", { name: "read" })
    fireEvent.click(readItem)
    fireEvent.click(screen.getByRole("checkbox", { name: "grep" }))
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
      permissions: { tools: ["read", "grep"] },
    })
  })

  it("权限编辑器：组开关默认不限制，开启后支持全选/清空与显式全禁", async () => {
    renderComponent()
    await screen.findByText("explorer")

    fireEvent.click(screen.getByRole("button", { name: "Add Role" }))
    fireEvent.change(await screen.findByPlaceholderText("e.g. my-reviewer"), {
      target: { value: "restricted" },
    })
    fireEvent.change(screen.getByPlaceholderText("Describe when the model should use this role"), {
      target: { value: "Restricted role" },
    })

    // 四组默认关闭 = 不限制。
    expect(screen.getAllByText("Unrestricted")).toHaveLength(4)
    expect(screen.queryByRole("checkbox", { name: "read" })).toBeNull()

    // 打开 skills 组限制（预置全选）后清空 = 全禁。
    fireEvent.click(screen.getByRole("checkbox", { name: /^Skills/ }))
    expect(screen.getByText("2 selected")).toBeTruthy()
    expect(screen.getByText("Disabled")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(screen.getByText("All disabled")).toBeTruthy()

    // MCP 组展示连接状态。
    fireEvent.click(screen.getByRole("checkbox", { name: /^MCP/ }))
    expect(screen.getByText("Connected")).toBeTruthy()
    expect(screen.getByText("Disconnected")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    await screen.findByText("restricted")
    await useSettingsDraftStore.getState().save()
    await waitFor(() => expect(saveSubagentSettings).toHaveBeenCalledTimes(1))

    const payload = saveSubagentSettings.mock.calls[0]![0]
    expect(payload.roles.restricted?.permissions).toEqual({
      skills: [],
      mcp: ["codegraph", "github"],
    })
  })

  it("内置角色可编辑权限：弹窗仅展示只读身份信息，保存写入 builtinPermissions", async () => {
    renderComponent()
    await screen.findByText("explorer")

    // 内置角色有权限编辑入口，且无删除入口。
    fireEvent.click(screen.getAllByRole("button", { name: "Edit permissions" })[0]!)
    await screen.findAllByText("Fast codebase answers")

    // 身份字段只读：不出现名称/描述输入框。
    expect(screen.queryByPlaceholderText("e.g. my-reviewer")).toBeNull()
    expect(screen.queryByPlaceholderText("Describe when the model should use this role")).toBeNull()
    // 权限回填：explorer 的 skills 为全禁。
    expect(screen.getByText("All disabled")).toBeTruthy()

    // 关闭 tools 限制（不限制）后保存。
    fireEvent.click(screen.getByRole("checkbox", { name: "Tools" }))
    expect(screen.queryByRole("checkbox", { name: "read" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await useSettingsDraftStore.getState().save()
    await waitFor(() => expect(saveSubagentSettings).toHaveBeenCalledTimes(1))

    const payload = saveSubagentSettings.mock.calls[0]![0]
    expect(payload.builtinPermissions?.explorer).toEqual({ websearch: ["web_search"], skills: [] })
    // 未覆盖的 worker 不写入。
    expect(payload.builtinPermissions?.worker).toBeUndefined()
    // 内置角色不进入自定义 roles。
    expect(payload.roles.explorer).toBeUndefined()
  })

  it("内置角色权限已覆盖时展示标记", async () => {
    getSubagentSettings.mockResolvedValue({
      roles: {},
      maxDepth: 1,
      builtinPermissions: { explorer: { skills: [] } },
    })
    renderComponent()
    await screen.findByText("explorer")

    expect(screen.getByText("Overridden")).toBeTruthy()
  })

  it("内置角色权限改回默认值时清除覆盖，不写入冗余配置", async () => {
    // 生效权限 = 覆盖后的值（tools 少一项、websearch 全禁）。
    getSubagentSettings.mockResolvedValue({
      roles: {},
      maxDepth: 1,
      builtinPermissions: { explorer: { tools: ["read"], websearch: [], skills: [] } },
    })
    getSubagentBuiltins.mockResolvedValue([
      {
        name: "explorer",
        description: "Fast codebase answers",
        permissions: { tools: ["read"], websearch: [], skills: [] },
        defaultPermissions: {
          tools: ["read", "grep"],
          websearch: ["web_search", "webfetch"],
          skills: [],
        },
      },
      { name: "worker", description: "Execution and production work" },
    ])
    renderComponent()
    await screen.findByText("explorer")

    fireEvent.click(screen.getAllByRole("button", { name: "Edit permissions" })[0]!)
    await screen.findAllByText("Fast codebase answers")

    // 恢复为内置默认：tools = read + grep、websearch 全选、skills 全禁。
    fireEvent.click(screen.getByRole("checkbox", { name: "grep" }))
    const websearchGroup = document.querySelector('[data-permission-group="websearch"]')
    const selectAll = websearchGroup?.querySelector('button[type="button"]')
    expect(selectAll).toBeTruthy()
    fireEvent.click(selectAll!)
    // 预检：勾选结果与默认一致。
    expect((screen.getByRole("checkbox", { name: "grep" }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await useSettingsDraftStore.getState().save()
    await waitFor(() => expect(saveSubagentSettings).toHaveBeenCalledTimes(1))

    expect(saveSubagentSettings.mock.calls[0]![0].builtinPermissions).toBeUndefined()
  })

  it("编辑已有角色回填权限配置，未配置权限时展示为不限制", async () => {
    getSubagentSettings.mockResolvedValue({
      roles: {
        reviewer: {
          description: "Review role",
          permissions: { mcp: ["codegraph"], websearch: [] },
        },
        plain: { description: "No permissions" },
      },
      maxDepth: 1,
    })
    renderComponent()
    await screen.findByText("reviewer")

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!)
    await screen.findByDisplayValue("reviewer")

    expect(screen.getByRole("checkbox", { name: /^MCP/ }).getAttribute("checked")).not.toBeNull()
    expect(screen.getByText("1 selected")).toBeTruthy()
    expect(screen.getByText("All disabled")).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: /^Tools/ }).getAttribute("checked")).toBeNull()
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

  it("切换子代理模式写入保存载荷，切回 Build 时省略字段", async () => {
    renderComponent()
    await screen.findByText("explorer")

    // 缺省展示 Build 模式。
    fireEvent.click(screen.getByRole("button", { name: "Build Mode" }))
    fireEvent.mouseDown(await screen.findByRole("option", { name: "Review Mode" }))

    await useSettingsDraftStore.getState().save()
    await waitFor(() => expect(saveSubagentSettings).toHaveBeenCalledTimes(1))
    expect(saveSubagentSettings.mock.calls[0]![0].mode).toBe("review")

    // 切回 Build：缺省值不落盘。
    fireEvent.click(screen.getByRole("button", { name: "Review Mode" }))
    fireEvent.mouseDown(await screen.findByRole("option", { name: "Build Mode" }))

    await useSettingsDraftStore.getState().save()
    await waitFor(() => expect(saveSubagentSettings).toHaveBeenCalledTimes(2))
    expect(saveSubagentSettings.mock.calls[1]![0].mode).toBeUndefined()
  })
})

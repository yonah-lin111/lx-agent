// @vitest-environment jsdom

import type { HookSettings } from "@shared/settings"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HooksSettings } from "@/features/settings/components/HooksSettings"
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

const getHookSettings = vi.fn<() => Promise<HookSettings>>()
const saveHookSettings = vi.fn<(settings: HookSettings) => Promise<HookSettings>>()

const loadedHooks = (): HookSettings => ({
  Stop: [{ hooks: [{ name: "audit", command: "cat >> /tmp/audit.log" }] }],
  PreToolUse: [
    {
      matcher: "bash",
      hooks: [
        { name: "block-rm", command: "exit 2", type: "command", additionalContextLimit: 120 },
      ],
    },
    { hooks: [{ name: "wire", command: "exit 0" }] },
  ],
})

const renderComponent = (): ReturnType<typeof render> =>
  render(
    <I18nProvider>
      <HooksSettings />
    </I18nProvider>,
  )

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  useSettingsDraftStore.getState().setActiveSection("hooks")
  getHookSettings.mockResolvedValue(loadedHooks())
  saveHookSettings.mockImplementation(async (settings) => settings)
  window.api = {
    settings: { getHookSettings, saveHookSettings },
  } as unknown as typeof window.api
})

describe("HooksSettings", () => {
  it("加载后按事件分组展示条目与 matcher", async () => {
    renderComponent()

    expect(await screen.findByText("audit")).toBeTruthy()
    expect(screen.getByText("block-rm")).toBeTruthy()
    expect(screen.getByText("wire")).toBeTruthy()
    expect(screen.getByText("bash")).toBeTruthy()
    expect(screen.getByText("Stop")).toBeTruthy()
  })

  it("新增 Hook 后保存提交规范化配置", async () => {
    renderComponent()
    await screen.findByText("audit")

    fireEvent.click(screen.getByRole("button", { name: "Add Hook" }))
    fireEvent.change(await screen.findByPlaceholderText("e.g. block-rm-rf"), {
      target: { value: "new-hook" },
    })
    fireEvent.change(screen.getByPlaceholderText("e.g. printf '%s' '{\"systemMessage\":\"ok\"}'"), {
      target: { value: "echo hi" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    expect(await screen.findByText("new-hook")).toBeTruthy()

    await useSettingsDraftStore.getState().save()
    await waitFor(() => expect(saveHookSettings).toHaveBeenCalledTimes(1))

    const payload = saveHookSettings.mock.calls[0]![0]
    expect(payload.PreToolUse?.at(-1)?.hooks[0]).toMatchObject({
      name: "new-hook",
      command: "echo hi",
    })
  })

  it("空名称 / 空命令 / 非法超时在弹窗内报错且不提交", async () => {
    renderComponent()
    await screen.findByText("audit")
    fireEvent.click(screen.getByRole("button", { name: "Add Hook" }))

    const nameInput = await screen.findByPlaceholderText("e.g. block-rm-rf")
    const commandInput = screen.getByPlaceholderText(
      "e.g. printf '%s' '{\"systemMessage\":\"ok\"}'",
    )
    const timeoutInput = screen.getByPlaceholderText("600")
    const confirm = (): void => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    }

    fireEvent.change(nameInput, { target: { value: "   " } })
    fireEvent.change(commandInput, { target: { value: "echo ok" } })
    confirm()
    expect(await screen.findByText("Name is required")).toBeTruthy()

    fireEvent.change(nameInput, { target: { value: "ok-hook" } })
    fireEvent.change(commandInput, { target: { value: "   " } })
    confirm()
    expect(await screen.findByText("Command is required")).toBeTruthy()

    fireEvent.change(commandInput, { target: { value: "echo ok" } })
    fireEvent.change(timeoutInput, { target: { value: "0" } })
    confirm()
    expect(await screen.findByText("Timeout must be an integer of at least 1 second")).toBeTruthy()

    expect(saveHookSettings).not.toHaveBeenCalled()
  })

  it("删除条目", async () => {
    renderComponent()
    await screen.findByText("audit")

    // 列表按生命周期顺序渲染，PreToolUse 在前：首条删除按钮属于 block-rm。
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!)

    await waitFor(() => expect(screen.queryByText("block-rm")).toBeNull())
    expect(screen.getByText("audit")).toBeTruthy()
  })

  it("同事件内下移调整执行顺序", async () => {
    const { container } = renderComponent()
    await screen.findByText("block-rm")

    const commands = (): (string | null)[] =>
      Array.from(container.querySelectorAll("code")).map((el) => el.textContent)
    expect(commands()).toEqual(["exit 2", "exit 0", "cat >> /tmp/audit.log"])

    // 顺序：PreToolUse block-rm、PreToolUse wire、Stop audit。
    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]!)

    expect(commands()).toEqual(["exit 0", "exit 2", "cat >> /tmp/audit.log"])
  })

  it("编辑条目保留透传字段 type/additionalContextLimit", async () => {
    renderComponent()
    await screen.findByText("block-rm")

    // 编辑按钮顺序：block-rm、wire、audit。
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!)
    fireEvent.change(await screen.findByDisplayValue("exit 2"), { target: { value: "exit 3" } })
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    expect(await screen.findByText("exit 3")).toBeTruthy()

    await useSettingsDraftStore.getState().save()
    await waitFor(() => expect(saveHookSettings).toHaveBeenCalledTimes(1))

    const payload = saveHookSettings.mock.calls[0]![0]
    expect(payload.PreToolUse?.[0]?.hooks[0]).toMatchObject({
      name: "block-rm",
      command: "exit 3",
      type: "command",
      additionalContextLimit: 120,
    })
    expect(payload.PreToolUse?.[0]?.matcher).toBe("bash")
  })

  it("非工具类事件隐藏 matcher 输入", async () => {
    renderComponent()
    await screen.findByText("audit")
    fireEvent.click(screen.getByRole("button", { name: "Add Hook" }))

    expect(await screen.findByPlaceholderText("bash|edit|write")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "PreToolUse" }))
    fireEvent.mouseDown(screen.getByRole("option", { name: "Stop" }))

    await waitFor(() => expect(screen.queryByPlaceholderText("bash|edit|write")).toBeNull())
  })
})

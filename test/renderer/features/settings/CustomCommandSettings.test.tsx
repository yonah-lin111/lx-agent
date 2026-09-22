// @vitest-environment jsdom

import { EditorView } from "@codemirror/view"
import type {
  CustomCommandDetailItem,
  ListCustomCommandsInput,
  SaveCustomCommandInput,
} from "@shared/contracts/customCommand"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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

// jsdom 未实现 Range 几何 API；CodeMirror 6 测量依赖。
const rangeRect = {
  left: 10,
  right: 10,
  top: 5,
  bottom: 25,
  width: 0,
  height: 20,
  x: 10,
  y: 5,
  toJSON: () => ({}),
} as DOMRect
Range.prototype.getClientRects = () => [rangeRect] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => rangeRect

const listCommands =
  vi.fn<(input?: ListCustomCommandsInput) => Promise<CustomCommandDetailItem[]>>()
const saveCommand = vi.fn()

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

const mdCommands = (): CustomCommandDetailItem[] => [
  {
    name: "md-alpha",
    type: "agentMD",
    scope: "user",
    filePath: "/tmp/md-alpha.md",
    description: "MD Alpha",
    content: "&&& mdAlpha\n## 内容\n&&& mdAlpha --end",
    mdScope: "global",
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
  listCommands.mockImplementation(async (input) =>
    input?.type === "agentMD" ? mdCommands() : loadedCommands(),
  )
  saveCommand.mockImplementation(async (input: SaveCustomCommandInput) => ({
    ok: true,
    item: {
      name: input.name,
      type: input.type,
      scope: input.scope,
      filePath: "/tmp/saved.md",
      description: input.description,
      content: input.content,
      argumentHint: input.argumentHint,
      mdScope: input.mdScope,
    },
  }))
  window.api = {
    customCommand: { list: listCommands, save: saveCommand },
    project: { projects: { list: async () => [] } },
    settings: { getUiSettings: async () => ({ locale: "en" as const }) },
  } as unknown as typeof window.api
})

describe("CustomCommandSettings 命令行", () => {
  it("以 role=button 暴露并支持点击切换选中后同步表单", async () => {
    renderComponent()
    await screen.findByText("alpha")
    await screen.findByDisplayValue("alpha")

    const betaRow = screen.getByText("beta").closest('[role="button"]')
    expect(betaRow).not.toBeNull()
    // 左侧命令行使用等级 2（中间容器），与供应商列一致。
    expect(betaRow?.getAttribute("data-item-level")).toBe("2")

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

  it("agentMD 命令使用 Markdown 编辑器，编辑内容后保存为最新模板内容", async () => {
    renderComponent()
    await screen.findByText("alpha")

    fireEvent.click(screen.getByText("Markdown Template Commands (AgentMD)"))
    await screen.findByText("md-alpha")

    fireEvent.click(screen.getByText("md-alpha").closest('[role="button"]') as Element)

    await waitFor(() => {
      const cm = document.querySelector(".cm-content") as HTMLElement | null
      const view = cm ? EditorView.findFromDOM(cm) : null
      expect(view?.state.doc.toString()).toBe("&&& mdAlpha\n## 内容\n&&& mdAlpha --end")
    })

    const nextContent = "&&& mdAlpha\n## 新内容\n+++ supple --end\n&&& mdAlpha --end"
    const cm = document.querySelector(".cm-content") as HTMLElement
    const view = EditorView.findFromDOM(cm)!
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: nextContent } })

    await waitFor(() => expect(useSettingsDraftStore.getState().isDirty).toBe(true))

    await useSettingsDraftStore.getState().save()

    expect(saveCommand).toHaveBeenCalledTimes(1)
    expect(saveCommand.mock.calls[0][0]).toMatchObject({
      type: "agentMD",
      content: nextContent,
    })
  })
})

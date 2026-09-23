// @vitest-environment jsdom

import { EditorView } from "@codemirror/view"
import type {
  CustomCommandDetailItem,
  ListCustomCommandsInput,
  SaveCustomCommandInput,
} from "@shared/contracts/customCommand"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
const deleteCommand = vi.fn()

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
  deleteCommand.mockResolvedValue({ ok: true })
  window.api = {
    customCommand: { list: listCommands, save: saveCommand, delete: deleteCommand },
    project: { projects: { list: async () => [] } },
    settings: { getUiSettings: async () => ({ locale: "en" as const }) },
  } as unknown as typeof window.api
})

describe("CustomCommandSettings 命令行", () => {
  it("以 role=button 暴露并支持点击切换选中后同步表单", async () => {
    renderComponent()
    await screen.findByText("alpha")

    // 元数据字段默认折叠，展开后校验表单与选中命令同步。
    fireEvent.click(screen.getByLabelText("Edit Details"))
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

    fireEvent.click(screen.getByLabelText("Edit Details"))
    await screen.findByDisplayValue("alpha")

    const alphaRow = screen.getByText("alpha").closest('[role="button"]') as Element
    fireEvent.click(screen.getByText("beta").closest('[role="button"]') as Element)
    await screen.findByDisplayValue("beta")

    fireEvent.keyDown(alphaRow, { key: "Enter" })

    expect(await screen.findByDisplayValue("alpha")).toBeTruthy()
  })

  it("右键命令弹出删除菜单，二次点击确认后调用删除接口", async () => {
    renderComponent()
    await screen.findByText("alpha")

    fireEvent.contextMenu(screen.getByText("alpha").closest('[role="button"]') as Element)

    fireEvent.click(await screen.findByText("Delete Command"))
    // 第一次点击进入确认态，不触发删除。
    expect(deleteCommand).not.toHaveBeenCalled()

    fireEvent.click(await screen.findByText("Confirm Delete"))

    await waitFor(() =>
      expect(deleteCommand).toHaveBeenCalledWith(expect.objectContaining({ name: "alpha" })),
    )
  })

  it("工具栏插入模板块下拉可插入任务块骨架，对话命令视图不提供子块选项", async () => {
    renderComponent()
    await screen.findByText("alpha")
    // 等待自动选中首个命令（编辑器按 editorKey 重挂载完成）后再操作工具栏。
    await screen.findByText("Edit Command /alpha")

    const cm = document.querySelector(".cm-content") as HTMLElement
    const view = EditorView.findFromDOM(cm)!

    // 打开插入模板块下拉：对话命令视图仅提供任务块。
    fireEvent.click(screen.getByText("Insert Block"))
    await screen.findByText("Task Block")
    expect(screen.queryByText("Temporary Block")).toBeNull()
    expect(screen.queryByText("Record Block")).toBeNull()

    fireEvent.mouseDown(screen.getByText("Task Block"))

    await waitFor(() => {
      expect(view.state.doc.toString()).toContain("&&& xxxTemplate --start 「title: 」")
      expect(view.state.doc.toString()).toContain("&&& xxxTemplate --end")
    })
  })

  it("md 命令视图：临时块 / 记录块选项仅在光标位于任务块内时提供", async () => {
    renderComponent()
    await screen.findByText("alpha")

    // 顶部视图下拉切换到 md 命令。
    fireEvent.click(screen.getByText("Chat Commands"))
    fireEvent.mouseDown(await screen.findByText("MD Commands"))
    await screen.findByText("md-alpha")
    await screen.findByText("Edit Command /md-alpha")

    const cm = document.querySelector(".cm-content") as HTMLElement
    const view = EditorView.findFromDOM(cm)!

    // 光标位于任务块外：仅任务块选项。
    await act(async () => {
      view.dispatch({ selection: { anchor: 0 } })
    })
    fireEvent.click(screen.getByText("Insert Block"))
    await screen.findByText("Task Block")
    expect(screen.queryByText("Temporary Block")).toBeNull()
    fireEvent.click(screen.getByText("Insert Block"))
    await waitFor(() => expect(screen.queryByText("Task Block")).toBeNull())

    // 光标位于任务块内部：临时块 / 记录块选项出现。
    await act(async () => {
      view.dispatch({ selection: { anchor: view.state.doc.line(2).from } })
    })
    fireEvent.click(screen.getByText("Insert Block"))
    await screen.findByText("Temporary Block")
    expect(screen.getByText("Record Block")).toBeTruthy()
  })

  it("md 模板块视图展示固定三项块列表与说明，且不加载命令列表", async () => {
    renderComponent()
    await screen.findByText("alpha")

    // 顶部视图下拉切换到 md 模板块。
    fireEvent.click(screen.getByText("Chat Commands"))
    fireEvent.mouseDown(await screen.findByText("MD Blocks"))

    // 左侧固定三项块类型（列表项与右侧标题同名，存在多处）。
    expect((await screen.findAllByText("Task Block")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Temporary Block").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Record Block").length).toBeGreaterThan(0)
    // 右侧说明与示例。
    expect(screen.getByText("Available globally")).toBeTruthy()
    expect(screen.getByText(/xxxTemplate --start/)).toBeTruthy()
    // 命令列表、新建入口与作用域选择不再展示。
    expect(screen.queryByText("New Command")).toBeNull()
    expect(screen.queryByText("Global")).toBeNull()
  })

  it("agentMD 命令使用 Markdown 编辑器，编辑内容后保存为最新模板内容", async () => {
    renderComponent()
    await screen.findByText("alpha")

    fireEvent.click(screen.getByText("Chat Commands"))
    fireEvent.mouseDown(await screen.findByText("MD Commands"))
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

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

const blockCommands = (): CustomCommandDetailItem[] => [
  {
    name: "reviewBlock",
    type: "agentBlock",
    scope: "user",
    filePath: "/tmp/reviewBlock.md",
    description: "需求评审",
    // 用户直接粘贴完整块源码保存的脏数据：正文已含起止行。
    content: [
      "&&& reviewBlock --start 「title: 需求评审」",
      "## 需求",
      "- ",
      "&&& reviewBlock --end",
    ].join("\n"),
    blockType: "template",
    title: "需求评审",
  },
  {
    name: "addonBlock",
    type: "agentBlock",
    scope: "user",
    filePath: "/tmp/addonBlock.md",
    description: "补充需求",
    content: "## 补充\n- ",
    blockType: "supple",
    title: "补充需求",
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
  listCommands.mockImplementation(async (input) => {
    if (input?.type === "agentMD") return mdCommands()
    if (input?.type === "agentBlock") return blockCommands()
    return loadedCommands()
  })
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

  it("md 模板块视图：列表展示模板块并可新建保存为 agentBlock 条目", async () => {
    renderComponent()
    await screen.findByText("alpha")

    // 顶部视图下拉切换到 md 模板块。
    fireEvent.click(screen.getByText("Chat Commands"))
    fireEvent.mouseDown(await screen.findByText("MD Blocks"))

    // 列表展示已有模板块，底部为新建入口。
    await screen.findByText("reviewBlock")
    fireEvent.click(screen.getByText("New Block"))

    // 草稿表单自动展开，填写名称后保存。
    const nameInput = await screen.findByPlaceholderText("e.g. reviewCode")
    fireEvent.change(nameInput, { target: { value: "myAddon" } })

    await useSettingsDraftStore.getState().save()

    expect(saveCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agentBlock",
        name: "myAddonTemplate",
        blockType: "template",
      }),
    )
  })

  it("md 模板块视图：已有模板块按自定义分组插入编辑器，子块类型仅在任务块内可用", async () => {
    renderComponent()
    await screen.findByText("alpha")
    await screen.findByText("Edit Command /alpha")

    const cm = document.querySelector(".cm-content") as HTMLElement
    const view = EditorView.findFromDOM(cm)!

    // 对话命令视图：仅任务块类型模板块可选，临时块类型不出现。
    fireEvent.click(screen.getByText("Insert Block"))
    await screen.findByText("My Blocks")
    expect(screen.getByText("reviewBlock")).toBeTruthy()
    expect(screen.queryByText("addonBlock")).toBeNull()
    fireEvent.mouseDown(screen.getByText("reviewBlock"))

    await waitFor(() => {
      expect(view.state.doc.toString()).toContain("&&& reviewBlock --start 「title: 需求评审」")
    })

    // 正文已含起止行时不双重包裹：只保留一层起止标记。
    const doc = view.state.doc.toString()
    expect(doc.match(/&&& reviewBlock --start/g)).toHaveLength(1)
    expect(doc.match(/&&& reviewBlock --end/g)).toHaveLength(1)
    expect(doc).toContain("## 需求")
  })

  it("md 模板块视图：保存时剥离误粘贴的块起止行并提取 title", async () => {
    renderComponent()
    await screen.findByText("alpha")

    fireEvent.click(screen.getByText("Chat Commands"))
    fireEvent.mouseDown(await screen.findByText("MD Blocks"))
    await screen.findByText("reviewBlock")

    fireEvent.click(screen.getByText("reviewBlock").closest('[role="button"]') as Element)
    await screen.findByText("Edit Block /reviewBlock")
    // 编辑已有块时字段区默认折叠，先展开。
    fireEvent.click(screen.getByLabelText("Edit Details"))

    // 编辑器展示完整块源码（起止行由表单驱动）；在正文区域粘贴完整块源码验证保存兜底。
    const cm = document.querySelector(".cm-content") as HTMLElement
    const view = EditorView.findFromDOM(cm)!
    expect(view.state.doc.toString()).toContain("&&& reviewBlock --start 「title: 需求评审」")
    const bodyFrom = view.state.doc.line(1).to + 1
    const bodyTo = view.state.doc.line(view.state.doc.lines).from - 1
    await act(async () => {
      view.dispatch({
        changes: {
          from: bodyFrom,
          to: bodyTo,
          insert: "&&& pastedBlock --start 「title: 新标题」\n11111\n&&& pastedBlock --end",
        },
      })
    })

    // 清空 frontmatter 标题，验证从正文提取兜底。
    fireEvent.change(screen.getByPlaceholderText("e.g. Requirement Notes"), {
      target: { value: "" },
    })

    await useSettingsDraftStore.getState().save()

    expect(saveCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agentBlock", content: "11111", title: "新标题" }),
    )
  })

  it("md 模板块视图：编辑器渲染完整块源码，Block Type / Name 变化时同步更新且起止行只读", async () => {
    renderComponent()
    await screen.findByText("alpha")

    fireEvent.click(screen.getByText("Chat Commands"))
    fireEvent.mouseDown(await screen.findByText("MD Blocks"))
    await screen.findByText("reviewBlock")

    fireEvent.click(screen.getByText("reviewBlock").closest('[role="button"]') as Element)
    await screen.findByText("Edit Block /reviewBlock")
    fireEvent.click(screen.getByLabelText("Edit Details"))

    // md 模板块视图不提供插入下拉。
    expect(screen.queryByText("Insert Block")).toBeNull()

    const cm = document.querySelector(".cm-content") as HTMLElement
    const view = EditorView.findFromDOM(cm)!

    // 编辑器展示完整块源码；结束行末尾以装饰显示 id 占位（真实文本不含 id）。
    await waitFor(() => {
      expect(view.state.doc.toString()).toBe(
        "&&& reviewBlock --start 「title: 需求评审」\n## 需求\n- \n&&& reviewBlock --end",
      )
    })
    await waitFor(() => {
      expect(document.querySelector(".cm-md-template-id")?.textContent).toBe(
        ` {id:${"x".repeat(32)}}`,
      )
    })
    expect(view.state.doc.toString()).not.toContain("{id-")

    // 起止行只读：修改首行被拒绝，正文区域可编辑。
    const original = view.state.doc.toString()
    await act(async () => {
      view.dispatch({ changes: { from: 0, to: 5, insert: "XXX" } })
    })
    expect(view.state.doc.toString()).toBe(original)

    const bodyFrom = view.state.doc.line(1).to + 1
    await act(async () => {
      view.dispatch({ changes: { from: bodyFrom, to: bodyFrom, insert: "新内容\n" } })
    })
    expect(view.state.doc.toString()).toContain("新内容")

    // 切换 Block Type：起止标记同步切换为 +++。
    fireEvent.click(screen.getByText("Task Block"))
    fireEvent.mouseDown(await screen.findByText("Temporary Block"))
    await waitFor(() => {
      expect(view.state.doc.toString()).toContain("+++ reviewBlock --start 「title: 需求评审」")
      expect(view.state.doc.toString()).toContain("+++ reviewBlock --end")
    })

    // 修改名称：编辑器块名同步更新，名称输入框显示剥离 Template 后缀后的值。
    const nameInput = screen.getByPlaceholderText("e.g. reviewCode") as HTMLInputElement
    expect(nameInput.value).toBe("reviewBlock")
    fireEvent.change(nameInput, { target: { value: "reviewV2" } })
    await waitFor(() => {
      expect(view.state.doc.toString()).toContain("+++ reviewV2Template --start")
    })
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

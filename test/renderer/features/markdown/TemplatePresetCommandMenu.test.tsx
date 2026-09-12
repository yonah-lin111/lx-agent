// @vitest-environment jsdom

import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  MARKDOWN_TEMPLATE_PRESET_OPTIONS,
  type TemplatePresetOption,
} from "@/features/markdown/commands/markdownSlashCommands"
import { TemplatePresetCommandMenu } from "@/features/markdown/components/TemplatePresetCommandMenu"
import { useMarkdownPanels } from "@/features/markdown/hooks/useMarkdownPanels"

describe("TemplatePresetCommandMenu", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("正常渲染全部预设选项并正确标记当前激活项", () => {
    render(
      <TemplatePresetCommandMenu
        activeIndex={1}
        options={MARKDOWN_TEMPLATE_PRESET_OPTIONS}
        position={{ top: 100, left: 100 }}
        visible={true}
      />,
    )

    const listbox = screen.getByRole("listbox")
    expect(listbox).not.toBeNull()

    const options = screen.getAllByRole("option")
    expect(options.length).toBe(MARKDOWN_TEMPLATE_PRESET_OPTIONS.length)

    // 第二个选项（bug）处于选中态
    expect(options[1].getAttribute("aria-selected")).toBe("true")
    expect(options[0].getAttribute("aria-selected")).toBe("false")
    expect(options[1].textContent).toContain("Fix Bug")
  })

  it("点击选项时触发 onSelect 回调并回传对应预设数据", () => {
    const onSelect = vi.fn()
    render(
      <TemplatePresetCommandMenu
        activeIndex={0}
        options={MARKDOWN_TEMPLATE_PRESET_OPTIONS}
        position={{ top: 100, left: 100 }}
        visible={true}
        onSelect={onSelect}
      />,
    )

    const bugOption = screen.getByRole("option", { name: /Fix Bug/ })
    fireEvent.mouseDown(bugOption)

    expect(onSelect).toHaveBeenCalledTimes(1)
    const calledWith: TemplatePresetOption = onSelect.mock.calls[0][0]
    expect(calledWith.id).toBe("bug")
    expect(calledWith.content).toContain("+++ presetTemplate --start 「title: Fix Bug」")
    expect(calledWith.content).toContain("bug:")
  })

  it("visible 为 false 时不渲染任何 DOM", () => {
    const { container } = render(
      <TemplatePresetCommandMenu
        activeIndex={0}
        options={MARKDOWN_TEMPLATE_PRESET_OPTIONS}
        position={{ top: 100, left: 100 }}
        visible={false}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it("通过 useMarkdownPanels 打开面板、上下键切换、选中并严格顶格输出（移除缩进）且光标落在首个字段双引号之间", () => {
    const doc = "$$$\n  /templatePreset\n$$$"
    const editorView = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: 10 },
      }),
    })
    editorView.coordsAtPos = vi.fn().mockReturnValue({ left: 10, right: 20, top: 10, bottom: 20 })
    const editorRef = { current: editorView }
    const { result } = renderHook(() => useMarkdownPanels({ editorViewRef: editorRef }))

    // 1. 打开面板
    act(() => {
      result.current.openTemplatePresetPanel(editorView)
    })
    expect(result.current.templatePresetPanel).not.toBeNull()
    expect(result.current.activeTemplatePresetIndex).toBe(0)

    // 2. 键盘向下移动到索引 1 (bug)
    act(() => {
      result.current.handleTemplatePresetKey(1)
    })
    expect(result.current.activeTemplatePresetIndex).toBe(1)

    // 3. 选中当前项（bugOption），验证严格顶格插入（移除原本的 2 空格缩进）
    const bugOption = MARKDOWN_TEMPLATE_PRESET_OPTIONS[1]
    act(() => {
      result.current.selectTemplatePreset(bugOption)
    })

    const docText = editorView.state.doc.toString()
    // 验证严格顶格输出，替换掉整行包括行首空格
    expect(docText).toContain("$$$\n+++ presetTemplate --start 「title: Fix Bug」\npreset:\n  bug:")
    expect(docText).not.toContain("  +++ presetTemplate")

    // 验证光标默认选中首个冒号后内容（不包含引号；空字符串则光标在双引号之间）
    const selection = editorView.state.selection.main
    expect(selection.from).toBe(selection.to)
    expect(docText.slice(selection.from - 1, selection.from + 1)).toBe('""')

    // 4. 验证面板自动关闭
    expect(result.current.templatePresetPanel).toBeNull()
  })
})

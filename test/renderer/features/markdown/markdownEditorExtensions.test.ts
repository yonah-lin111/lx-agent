// @vitest-environment jsdom
import { markdown } from "@codemirror/lang-markdown"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import { describe, expect, it, vi } from "vitest"
import {
  createMarkdownTable,
  editorTheme,
  formatMarkdown,
  mapMarkdownPosition,
  markdownHighlightStyle,
  markdownMarkerHighlight,
  markdownReferenceHover,
  selectAllPreservingScrollPosition,
  synchronizeEditorToPreview,
  synchronizePreviewToEditor,
} from "@/features/markdown/extensions/markdownEditorExtensions"
import type { CodeBlockActionWidget } from "@/features/markdown/extensions/markerWidgets"

describe("Markdown 编辑器扩展重构功能验证", () => {
  describe("表格与文本格式化纯函数 (tableUtils)", () => {
    it("createMarkdownTable 按行列规格生成有效 Markdown 表格", () => {
      const table = createMarkdownTable({ columns: 3, rows: 2 })
      expect(table).toContain("| Header | | |")
      expect(table).toContain("| --- | --- | --- |")
      expect(table).toContain("| Content | | |")
      const lines = table.trim().split("\n")
      expect(lines.length).toBe(4) // Header + 分隔行 + 2 行内容
    })

    it("formatMarkdown 标准化表格列对齐与无序/有序列表前缀", () => {
      const raw = [
        "| a | b | c |",
        "| :-: | --- | --: |",
        "| 1 | 2 | 3 |",
        "",
        "* 无序项目一",
        "+ 无序项目二",
        "1) 有序项目一",
        "2. 有序项目二",
      ].join("\n")

      const formatted = formatMarkdown(raw)
      expect(formatted).toContain("| a | b | c |")
      expect(formatted).toContain("| :-: | --- | --: |")
      expect(formatted).toContain("- 无序项目一")
      expect(formatted).toContain("- 无序项目二")
      expect(formatted).toContain("1. 有序项目一")
      expect(formatted).toContain("2. 有序项目二")
    })

    it("formatMarkdown 严格保护代码围栏内部原样不被篡改", () => {
      const source = ["```ts", "* 这里不应被转成横线", "| 不格式化表格 |", "```"].join("\n")

      const result = formatMarkdown(source)
      expect(result).toContain("* 这里不应被转成横线")
      expect(result).toContain("| 不格式化表格 |")
    })

    it("formatMarkdown 空文本安全返回空字符串", () => {
      expect(formatMarkdown("   \n\n  ")).toBe("")
    })
  })

  describe("光标选区与滚动导航 (editorNavigation)", () => {
    it("mapMarkdownPosition 在行内容发生格式变动时准确映射光标偏移", () => {
      const source = "* item"
      const formatted = "- item\n"
      // 光标在起始标记后
      expect(mapMarkdownPosition(source, formatted, 2)).toBe(1)
      // 光标在末尾处准确还原
      expect(mapMarkdownPosition(source, formatted, 6)).toBe(6)
    })

    it("selectAllPreservingScrollPosition 全选内容并触发滚动还原", () => {
      const state = EditorState.create({ doc: "Line 1\nLine 2\nLine 3" })
      const view = new EditorView({ state })
      const scrollToMock = vi.fn()
      view.scrollDOM.scrollTo = scrollToMock
      const rafSpy = vi.spyOn(window, "requestAnimationFrame")

      const handled = selectAllPreservingScrollPosition(view)
      expect(handled).toBe(true)
      expect(view.state.selection.main.from).toBe(0)
      expect(view.state.selection.main.to).toBe(view.state.doc.length)
      expect(rafSpy).toHaveBeenCalled()
      rafSpy.mockRestore()
    })

    it("synchronizeEditorToPreview 与 synchronizePreviewToEditor 在无锚点时静默安全退出", () => {
      const state = EditorState.create({ doc: "Hello" })
      const view = new EditorView({ state })
      const preview = document.createElement("div")

      expect(() => synchronizeEditorToPreview(view, preview)).not.toThrow()
      expect(() => synchronizePreviewToEditor(preview, view)).not.toThrow()
    })
  })

  describe("主题与高亮导出完整性 (editorTheme & editorHighlight)", () => {
    it("editorTheme 是有效的 CodeMirror Extension", () => {
      expect(editorTheme).toBeDefined()
      expect(Array.isArray(editorTheme) || typeof editorTheme === "object").toBe(true)
    })

    it("markdownHighlightStyle 包含关键语法高亮映射", () => {
      expect(markdownHighlightStyle).toBeDefined()
      expect(markdownHighlightStyle.style).toBeDefined()
    })

    it("markdownReferenceHover 是有效的 CodeMirror 悬浮扩展", () => {
      expect(markdownReferenceHover).toBeDefined()
      expect(
        Array.isArray(markdownReferenceHover) || typeof markdownReferenceHover === "object",
      ).toBe(true)
    })
  })

  describe("标记装饰与插件状态机 (markerPlugin & markerDecorations)", () => {
    const createTestView = (doc: string) => {
      const extension = markdownMarkerHighlight(true)
      const pluginSpec = extension[0]!
      const state = EditorState.create({
        doc,
        extensions: [markdown({ extensions: [GFM] }), extension],
      })
      const view = new EditorView({ state })
      const plugin = view.plugin(pluginSpec)
      return { view, plugin }
    }

    it("精准识别并构建代码块的装饰与 ActionWidget", () => {
      const doc = "```typescript\nconst x = 1\n```"
      const { plugin } = createTestView(doc)
      expect(plugin).toBeDefined()

      const decorations: { from: number; to: number }[] = []
      const cursor = plugin!.decorations.iter()
      while (cursor.value) {
        decorations.push({ from: cursor.from, to: cursor.to })
        cursor.next()
      }
      expect(decorations.length).toBeGreaterThan(0)
    })

    it("完整解析并装饰 &&& 模板块的起始、命令、标题与状态结束行", () => {
      const doc = [
        "&&& addTemplate --start 「title: 功能开发」",
        "任务细节",
        "&&& addTemplate --end done {id:0123456789abcdef0123456789abcdef} {wt:worktree-1}",
      ].join("\n")

      const { plugin } = createTestView(doc)
      expect(plugin).toBeDefined()
      expect(plugin!.decorations.size).toBeGreaterThan(0)
    })

    it("支持折叠状态切换事务分发", () => {
      const doc = "```js\nconsole.log(1)\n```"
      const { view, plugin } = createTestView(doc)
      expect(plugin).toBeDefined()

      // 切换折叠
      expect(() => plugin!.toggleFold(view, 0)).not.toThrow()
      expect(plugin!.foldedIndices.has(0)).toBe(true)

      // 再次切换解折叠
      expect(() => plugin!.toggleFold(view, 0)).not.toThrow()
      expect(plugin!.foldedIndices.has(0)).toBe(false)
    })

    it("完整解析行内常用语法装饰（标题、任务、列表、引用、提及）", () => {
      const doc = [
        "# 一级标题",
        "- [x] 完成项",
        "- [ ] 待办项",
        "> 引用块",
        "**粗体** *斜体* ~~删除线~~ `行内代码`",
        "@src/index.ts",
        "@[refer-image](preview.png)",
      ].join("\n")

      const { view, plugin } = createTestView(doc)
      expect(plugin).toBeDefined()

      const decoratedStrings: string[] = []
      const cursor = plugin!.decorations.iter()
      while (cursor.value) {
        decoratedStrings.push(view.state.doc.sliceString(cursor.from, cursor.to))
        cursor.next()
      }

      expect(decoratedStrings).toContain("#")
      expect(decoratedStrings).toContain("[x]")
      expect(decoratedStrings).toContain(">")
      expect(decoratedStrings).toContain("@src/index.ts")
      expect(decoratedStrings).toContain("@[refer-image](preview.png)")
    })

    it("支持 cycleTemplateStatus 循环推进模板状态 (todo -> in_progress -> done)", () => {
      const doc = "&&& addTemplate --end"
      const { view, plugin } = createTestView(doc)
      expect(plugin).toBeDefined()

      plugin!.cycleTemplateStatus(view, 0)
      expect(view.state.doc.line(1).text).toContain("in_progress")

      plugin!.cycleTemplateStatus(view, 0)
      expect(view.state.doc.line(1).text).toContain("done")
    })

    it("ActionWidget 的 onCleanTemplate 回调正确清除模板块中未填写的项并保留已填项", () => {
      const doc = [
        "&&& addTemplate --start 「title: 功能开发」",
        "# 添加需求",
        "",
        "- 参考: ",
        "- 位置: @src/test.ts",
        "- 描述: ",
        "- 要求: ",
        "  - 核心要求",
        "  - ",
        "- 注意: ",
        "  - ",
        "&&& addTemplate --end",
      ].join("\n")

      const { view, plugin } = createTestView(doc)
      expect(plugin).toBeDefined()

      let templateWidget: CodeBlockActionWidget | null = null
      const cursor = plugin!.decorations.iter()
      while (cursor.value) {
        if (cursor.value.spec?.widget?.actionClassName === "cm-template-block-action-wrap") {
          templateWidget = cursor.value.spec.widget
          break
        }
        cursor.next()
      }

      expect(templateWidget).not.toBeNull()
      expect(templateWidget!.onCleanTemplate).toBeDefined()
      templateWidget!.onCleanTemplate!()

      expect(view.state.doc.toString()).toBe(
        [
          "&&& addTemplate --start 「title: 功能开发」",
          "# 添加需求",
          "",
          "- 位置: @src/test.ts",
          "- 要求: ",
          "  - 核心要求",
          "&&& addTemplate --end",
        ].join("\n"),
      )
    })

    it("ActionWidget 的 onCleanTemplate 回调正确清除补充块 (suppleBlock) 中未填写的项", () => {
      const doc = [
        "+++ suppleTemplate --start",
        "## 补充需求",
        "",
        "- 参考: ",
        "- 位置: @src/supple.ts",
        "- 预期: ",
        "+++ suppleTemplate --end",
      ].join("\n")

      const { view, plugin } = createTestView(doc)
      expect(plugin).toBeDefined()

      let suppleWidget: CodeBlockActionWidget | null = null
      const cursor = plugin!.decorations.iter()
      while (cursor.value) {
        if (cursor.value.spec?.widget?.isSupple) {
          suppleWidget = cursor.value.spec.widget
          break
        }
        cursor.next()
      }

      expect(suppleWidget).not.toBeNull()
      expect(suppleWidget!.onCleanTemplate).toBeDefined()
      suppleWidget!.onCleanTemplate!()

      expect(view.state.doc.toString()).toBe(
        [
          "+++ suppleTemplate --start",
          "## 补充需求",
          "",
          "- 位置: @src/supple.ts",
          "+++ suppleTemplate --end",
        ].join("\n"),
      )
    })

    it("删除第一个 supple 后，剩余 supple 块的 DOM / Widget 闭包范围必须更新为当前正确行号", () => {
      const doc = [
        "&&& addTemplate --start 「title: 测试」",
        "# 主模板",
        "+++ suppleTemplate --start",
        "## 补充 1",
        "+++ suppleTemplate --end",
        "+++ suppleTemplate --start",
        "## 补充 2",
        "+++ suppleTemplate --end",
        "&&& addTemplate --end",
      ].join("\n")

      const { view, plugin } = createTestView(doc)

      // 先通过 deleteSuppleBlock 删除第一个 supple 块（第 2 到 4 行）
      plugin!.deleteSuppleBlock(view, 2, 4)

      // 文档变更后，调用 update
      // 检查此时 plugin 里的 decorations 是否重新构建，以及剩余 supple 的删除回调是否对应新的行号
      const widgets: CodeBlockActionWidget[] = []
      const cursor = plugin!.decorations.iter()
      while (cursor.value) {
        if (cursor.value.spec?.widget?.isSupple) {
          widgets.push(cursor.value.spec.widget)
        }
        cursor.next()
      }

      expect(widgets.length).toBe(1)
      // 现在删除剩余的 supple
      widgets[0]!.onDeleteTemplate!()

      expect(view.state.doc.toString()).toBe(
        ["&&& addTemplate --start 「title: 测试」", "# 主模板", "&&& addTemplate --end"].join("\n"),
      )
    })

    it("验证模板块中有多个 suppleTemplate 时的删除行为", () => {
      const doc = [
        "&&& addTemplate --start 「title: 测试」",
        "# 主模板",
        "+++ suppleTemplate --start",
        "## 补充 1",
        "+++ suppleTemplate --end",
        "+++ suppleTemplate --start",
        "## 补充 2",
        "+++ suppleTemplate --end",
        "&&& addTemplate --end",
      ].join("\n")

      const { view, plugin } = createTestView(doc)
      expect(plugin).toBeDefined()

      const getSuppleWidgets = () => {
        const suppleWidgets: CodeBlockActionWidget[] = []
        const cursor = plugin!.decorations.iter()
        while (cursor.value) {
          if (cursor.value.spec?.widget?.isSupple) {
            suppleWidgets.push(cursor.value.spec.widget)
          }
          cursor.next()
        }
        return suppleWidgets
      }

      // 验证直接删除第二个（最后一个）supple
      let widgets = getSuppleWidgets()
      expect(widgets.length).toBe(2)
      widgets[1]!.onDeleteTemplate!()
      expect(view.state.doc.toString()).toBe(
        [
          "&&& addTemplate --start 「title: 测试」",
          "# 主模板",
          "+++ suppleTemplate --start",
          "## 补充 1",
          "+++ suppleTemplate --end",
          "&&& addTemplate --end",
        ].join("\n"),
      )

      // 重新获取 widgets 并删除剩余的第一个 supple
      widgets = getSuppleWidgets()
      expect(widgets.length).toBe(1)
      widgets[0]!.onDeleteTemplate!()
      expect(view.state.doc.toString()).toBe(
        ["&&& addTemplate --start 「title: 测试」", "# 主模板", "&&& addTemplate --end"].join("\n"),
      )
    })

    it("两个内容相同的 supple 块，其 ActionWidget.eq 必须返回 false，避免 CodeMirror 复用 DOM 导致闭包行号错乱", () => {
      const doc = [
        "&&& addTemplate --start 「title: 测试」",
        "# 主模板",
        "+++ suppleTemplate --start",
        "## 补充需求",
        "+++ suppleTemplate --end {id:0123456789abcdef0123456789abcdef}",
        "+++ suppleTemplate --start",
        "## 补充需求",
        "+++ suppleTemplate --end {id:fedcba9876543210fedcba9876543210}",
        "&&& addTemplate --end",
      ].join("\n")

      const { plugin } = createTestView(doc)
      const suppleWidgets: CodeBlockActionWidget[] = []
      const cursor = plugin!.decorations.iter()
      while (cursor.value) {
        if (cursor.value.spec?.widget?.isSupple) {
          suppleWidgets.push(cursor.value.spec.widget)
        }
        cursor.next()
      }

      expect(suppleWidgets.length).toBe(2)
      expect(suppleWidgets[0]!.eq(suppleWidgets[1]!)).toBe(false)
    })

    it("ActionWidget 的 onCleanTemplate 回调正确清除日志块 (logBlock) 中未填写的项", () => {
      const doc = [
        "+++ logTemplate --start",
        "## 运行日志",
        "",
        "- 时间: 2026-09-06",
        "- 阶段: ",
        "- 结论: ",
        "+++ logTemplate --end",
      ].join("\n")

      const { view, plugin } = createTestView(doc)
      expect(plugin).toBeDefined()

      let logWidget: CodeBlockActionWidget | null = null
      const cursor = plugin!.decorations.iter()
      while (cursor.value) {
        if (cursor.value.spec?.widget?.isLog) {
          logWidget = cursor.value.spec.widget
          break
        }
        cursor.next()
      }

      expect(logWidget).not.toBeNull()
      expect(logWidget!.onCleanTemplate).toBeDefined()
      logWidget!.onCleanTemplate!()

      expect(view.state.doc.toString()).toBe(
        [
          "+++ logTemplate --start",
          "## 运行日志",
          "",
          "- 时间: 2026-09-06",
          "+++ logTemplate --end",
        ].join("\n"),
      )
    })

    it("支持未闭合模板块 cleanTemplateBlock 覆盖延伸至末行的内容", () => {
      const doc = [
        "&&& addTemplate --start 「title: 未闭合」",
        "# 需求标题",
        "- 参考: ",
        "- 描述: ",
      ].join("\n")

      const { view, plugin } = createTestView(doc)
      expect(plugin).toBeDefined()

      plugin!.cleanTemplateBlock(view, 0, -1)
      expect(view.state.doc.toString()).toBe(
        ["&&& addTemplate --start 「title: 未闭合」", "# 需求标题"].join("\n"),
      )
    })

    it("$$$ 变量块内部的 +++ presetTemplate 具备独立 ActionWidget 并支持折叠与删除", () => {
      const doc = [
        "$$$ varTemplate --start 「title: Presets」",
        "+++ presetTemplate --start 「title: All Templates」",
        "preset:",
        "  common:",
        '    reference: "@docs/architecture.md"',
        "+++ presetTemplate --end",
        "$$$ varTemplate --end",
      ].join("\n")

      const { view, plugin } = createTestView(doc)
      expect(plugin).toBeDefined()

      let presetWidget: CodeBlockActionWidget | null = null
      const cursor = plugin!.decorations.iter()
      while (cursor.value) {
        if (cursor.value.spec?.widget?.isPreset) {
          presetWidget = cursor.value.spec.widget
          break
        }
        cursor.next()
      }

      expect(presetWidget).not.toBeNull()
      expect(presetWidget!.isPreset).toBe(true)
      expect(presetWidget!.isFolded).toBe(false)
      expect(presetWidget!.actionClassName).toBe("cm-preset-block-action-wrap")

      // 验证折叠交互
      presetWidget!.onToggleFold()
      expect(plugin!.presetFoldedIndices.has(0)).toBe(true)

      // 验证删除交互
      expect(presetWidget!.onDeleteTemplate).toBeDefined()
      presetWidget!.onDeleteTemplate!()

      expect(view.state.doc.toString()).toBe(
        ["$$$ varTemplate --start 「title: Presets」", "$$$ varTemplate --end"].join("\n"),
      )
    })
  })
})

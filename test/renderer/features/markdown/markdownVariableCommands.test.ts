// @vitest-environment jsdom
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { getMarkdownSlashCommands } from "@/features/markdown/commands/markdownSlashCommands"
import {
  cleanVarBlockItems,
  filterMarkdownVariables,
  getMarkdownColonTrigger,
  getMarkdownVariableTrigger,
  getVariableTag,
  handleMarkdownVarBlockTab,
  isInsideMarkdownFrontmatter,
  mergeMarkdownVarBlock,
  moveMarkdownVarBlockToTop,
  parseMarkdownVariables,
  stripMarkdownFrontmatter,
  stripMarkdownVariableBlocks,
} from "@/features/markdown/commands/markdownVariableCommands"
import { markdownVarTemplateColonFilter } from "@/features/markdown/extensions/markdownEditorKeymap"
import { markdownMarkerHighlight } from "@/features/markdown/extensions/markerPlugin"
import { useMarkdownColonPanel } from "@/features/markdown/hooks/useMarkdownColonPanel"

const mockRect = {
  left: 10,
  top: 5,
  right: 20,
  bottom: 25,
  width: 10,
  height: 20,
  x: 10,
  y: 5,
  toJSON: () => ({}),
} as DOMRect
Range.prototype.getClientRects = () => [mockRect] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => mockRect

describe("Markdown 页面变量命令", () => {
  describe("parseMarkdownVariables", () => {
    it("解析标准 vars 字典中的变量", () => {
      const doc = `---
vars:
  core: @src/core/index.ts
  auth: @[refer-folder](/path/to/auth)
  rule: "请严格校验 JWT token"
  plain: '单引号内容'
---

# 正文
测试内容
`
      const result = parseMarkdownVariables(doc)
      expect(result).toEqual([
        { name: "core", value: "@src/core/index.ts" },
        { name: "auth", value: "@[refer-folder](/path/to/auth)" },
        { name: "rule", value: "请严格校验 JWT token" },
        { name: "plain", value: "单引号内容" },
      ])
    })

    it("解析多行块变量 (| 和 >)", () => {
      const doc = `---
vars:
  prompt: |
    - 第一条规则
    - 第二条规则
---
`
      const result = parseMarkdownVariables(doc)
      expect(result).toEqual([
        {
          name: "prompt",
          value: "- 第一条规则\n- 第二条规则",
        },
      ])
    })

    it("解析扁平 key: value 声明的 frontmatter", () => {
      const doc = `---
core: @src/core/index.ts
notice: 紧急通知
---
`
      const result = parseMarkdownVariables(doc)
      expect(result).toEqual([
        { name: "core", value: "@src/core/index.ts" },
        { name: "notice", value: "紧急通知" },
      ])
    })

    it("无 frontmatter 或空 frontmatter 时返回空数组", () => {
      expect(parseMarkdownVariables("# 纯标题")).toEqual([])
      expect(parseMarkdownVariables("---\n---\n")).toEqual([])
    })

    it("容忍输入过程中的半残行与注释", () => {
      const doc = `---
vars:
  # 注释行
  valid: 正常变量
  halfWritten
  another: 另一个
---
`
      const result = parseMarkdownVariables(doc)
      expect(result).toEqual([
        { name: "valid", value: "正常变量" },
        { name: "another", value: "另一个" },
      ])
    })

    it("支持解析自定义分组（如 temp:）并按点号路径输出变量", () => {
      const doc = `---
vars:
  api_host: "https://api.github.com/v1"
  project_root: "@/src/renderer/src"
temp:
  status: "111"
  title: 我的文档
  nested:
    deep_key: deep_val
flat_key: 顶层平级
---
`
      const result = parseMarkdownVariables(doc)
      expect(result).toEqual([
        { name: "api_host", value: "https://api.github.com/v1" },
        { name: "project_root", value: "@/src/renderer/src" },
        { name: "temp.status", value: "111" },
        { name: "temp.title", value: "我的文档" },
        { name: "temp.nested.deep_key", value: "deep_val" },
        { name: "flat_key", value: "顶层平级" },
      ])
    })

    it("支持从 $$$ varTemplate 模板块中解析变量（单行与三引号多行）", () => {
      const doc = `$$$ varTemplate --start 「title: 页面变量」
api_host: "https://api.github.com/v1"
reviewer:
  """
  请作为资深架构师评审代码：
  1. 架构规范
  2. 性能评估
  """
temp:
  status: "active"
$$$ varTemplate --end

# 正文
正文内容
`
      const result = parseMarkdownVariables(doc)
      expect(result).toEqual([
        { name: "api_host", value: "https://api.github.com/v1" },
        {
          name: "reviewer",
          value: "请作为资深架构师评审代码：\n1. 架构规范\n2. 性能评估",
        },
        { name: "temp.status", value: "active" },
      ])
    })
  })

  describe("getMarkdownVariableTrigger", () => {
    it("支持 $ 符号在行首或空白后触发", () => {
      expect(getMarkdownVariableTrigger("$")).toMatchObject({
        fragment: "",
        start: 0,
        triggerChar: "$",
      })
      expect(getMarkdownVariableTrigger("hello $co")).toMatchObject({
        fragment: "co",
        start: 6,
        triggerChar: "$",
      })
      expect(getMarkdownVariableTrigger("\n$api_core")).toMatchObject({
        fragment: "api_core",
        start: 1,
        triggerChar: "$",
      })
    })

    it("支持 ¥ 符号在行首或空白后触发（中英文 Shift+4 兼容）", () => {
      expect(getMarkdownVariableTrigger("¥")).toMatchObject({
        fragment: "",
        start: 0,
        triggerChar: "¥",
      })
      expect(getMarkdownVariableTrigger("测试 ¥rule")).toMatchObject({
        fragment: "rule",
        start: 3,
        triggerChar: "¥",
      })
    })

    it("单词内部无边界时不误触发", () => {
      expect(getMarkdownVariableTrigger("foo$bar")).toBeNull()
      expect(getMarkdownVariableTrigger("100$")).toBeNull()
    })

    it("标点符号后允许正常触发", () => {
      expect(getMarkdownVariableTrigger("提示：$core")).toMatchObject({
        fragment: "core",
        triggerChar: "$",
      })
      expect(getMarkdownVariableTrigger("输入 $temp.status")).toMatchObject({
        fragment: "temp.status",
        start: 3,
        triggerChar: "$",
      })
      expect(getMarkdownVariableTrigger("输入 ¥temp.")).toMatchObject({
        fragment: "temp.",
        start: 3,
        triggerChar: "¥",
      })
      expect(getMarkdownVariableTrigger("($auth")).toMatchObject({
        fragment: "auth",
        triggerChar: "$",
      })
    })

    it("处于代码围栏内时不触发", () => {
      const text = "```bash\necho $HOME"
      expect(getMarkdownVariableTrigger(text)).toBeNull()
    })

    it("处于文档顶部的 frontmatter 内时不触发", () => {
      const doc = "---\nvars:\n  a: $test\n---\n"
      const prefix = "---\nvars:\n  a: $test"
      expect(isInsideMarkdownFrontmatter(doc, prefix.length)).toBe(true)
      expect(getMarkdownVariableTrigger(prefix, doc)).toBeNull()
    })
  })

  describe("filterMarkdownVariables", () => {
    const vars = [
      { name: "core", value: "@src/core/index.ts" },
      { name: "auth_rule", value: "校验权限" },
      { name: "api_service", value: "@src/services/api.ts" },
    ]

    it("空查询返回全部候选", () => {
      expect(filterMarkdownVariables(vars, "")).toHaveLength(3)
    })

    it("按名称前缀与包含精确过滤排序", () => {
      expect(filterMarkdownVariables(vars, "core")).toEqual([vars[0]])
      expect(filterMarkdownVariables(vars, "api")).toEqual([vars[2]])
    })

    it("按预设内容包含匹配兜底", () => {
      expect(filterMarkdownVariables(vars, "权限")).toEqual([vars[1]])
    })
  })

  describe("stripMarkdownFrontmatter", () => {
    it("剥离顶部 frontmatter 并保留干净正文", () => {
      const doc = `---
vars:
  core: 123
---

# 标题
正文内容`
      expect(stripMarkdownFrontmatter(doc)).toBe("# 标题\n正文内容")
    })

    it("无 frontmatter 时原样返回", () => {
      const doc = "# 标题\n正文内容"
      expect(stripMarkdownFrontmatter(doc)).toBe(doc)
    })

    it("剥离 $$$ varTemplate 变量块并保留干净正文", () => {
      const doc = `$$$ varTemplate --start 「title: 变量」
api_host: "https://api.github.com"
temp:
  """
  var
  """
$$$ varTemplate --end

# 标题
正文内容`
      expect(stripMarkdownVariableBlocks(doc)).toBe("# 标题\n正文内容")
    })
  })

  describe("getVariableTag", () => {
    it("提取前缀或者默认为 var", () => {
      expect(getVariableTag("temp.status")).toBe("temp")
      expect(getVariableTag("user.profile.name")).toBe("user")
      expect(getVariableTag("api_host")).toBe("var")
      expect(getVariableTag("vars.custom")).toBe("vars")
    })
  })

  describe("cleanVarBlockItems", () => {
    it("清理未填项（空字符串、空三引号、未修改的 var 占位符）", () => {
      const block = `$$$ varTemplate --start 「title: 变量」
api_host: "https://api.github.com"
unfilled: ""
untouched: "var"
multiline_empty:
  """
  """
multiline_var:
  """
  var
  """
multiline_valid:
  """
  自定义内容
  """
$$$ varTemplate --end`

      const cleaned = cleanVarBlockItems(block)
      expect(cleaned).toContain('api_host: "https://api.github.com"')
      expect(cleaned).not.toContain('unfilled: ""')
      expect(cleaned).not.toContain('untouched: "var"')
      expect(cleaned).not.toContain("multiline_empty:")
      expect(cleaned).not.toContain("multiline_var:")
      expect(cleaned).toContain("multiline_valid:")
      expect(cleaned).toContain("自定义内容")
    })
  })

  describe("getMarkdownColonTrigger", () => {
    it("识别行末英文冒号并返回键与缩进", () => {
      const line = "  custom_key:"
      const trigger = getMarkdownColonTrigger(line, line.length, 10)
      expect(trigger).toEqual({
        indent: "  ",
        key: "custom_key",
        from: 10,
        to: 10 + line.length,
      })
    })

    it("识别行末中文全角冒号", () => {
      const line = "temp_key："
      const trigger = getMarkdownColonTrigger(line, line.length, 0)
      expect(trigger).toEqual({
        indent: "",
        key: "temp_key",
        from: 0,
        to: line.length,
      })
    })

    it("非冒号行返回 null", () => {
      expect(getMarkdownColonTrigger("hello world", 11, 0)).toBeNull()
      expect(getMarkdownColonTrigger("key: value", 10, 0)).toBeNull()
    })
  })

  describe("markdownVarTemplateColonFilter", () => {
    it("在 $$$ 变量块内部输入全角中文冒号「：」自动转换为英文冒号「:」", () => {
      const initialDoc = "$$$\n\n$$$\n"
      const state = EditorState.create({
        doc: initialDoc,
        extensions: [markdownVarTemplateColonFilter],
      })
      // 光标在第二行（索引 4，位于 $$$ 块内）
      const tr = state.update({
        changes: { from: 4, to: 4, insert: "key：" },
      })
      expect(tr.state.doc.toString()).toBe("$$$\nkey:\n$$$\n")
    })

    it("在 $$$ 变量块外部输入中文冒号「：」保持原样不转换", () => {
      const initialDoc = "# 标题\n\n正文"
      const state = EditorState.create({
        doc: initialDoc,
        extensions: [markdownVarTemplateColonFilter],
      })
      const tr = state.update({
        changes: { from: 5, to: 5, insert: "注意：" },
      })
      expect(tr.state.doc.toString()).toBe("# 标题\n注意：\n正文")
    })
  })

  describe("useMarkdownColonPanel 选项与快捷展开", () => {
    it("支持 4 个选项（单行、多行、嵌套单行、嵌套多行）并在嵌套选项中选中子级 key", () => {
      const doc = "$$$ varTemplate\nuser:\n$$$ --end"
      const editorView = new EditorView({
        state: EditorState.create({
          doc,
          selection: { anchor: 21 }, // 光标在 user: 之后
        }),
      })
      editorView.coordsAtPos = vi.fn().mockReturnValue({ left: 10, right: 20, top: 10, bottom: 20 })
      const editorRef = { current: editorView }
      const { result } = renderHook(() => useMarkdownColonPanel(editorRef))

      act(() => {
        result.current.syncColonPanel(editorView)
      })
      expect(result.current.colonPanelState.active).toBe(true)
      expect(result.current.colonPanelState.key).toBe("user")

      // 循环向下切换选项：0 -> 1 -> 2 -> 3 -> 0
      act(() => {
        result.current.handleColonKey("ArrowDown")
      })
      expect(result.current.activeColonOptionIndex).toBe(1) // multi

      act(() => {
        result.current.handleColonKey("ArrowDown")
      })
      expect(result.current.activeColonOptionIndex).toBe(2) // nestedSingle

      // 选择 nestedSingle
      act(() => {
        result.current.selectColonOption("nestedSingle")
      })
      expect(editorView.state.doc.toString()).toContain('user:\n  key: "var"')
      // 确认光标选中了子级 key
      const sel = editorView.state.selection.main
      const selectedText = editorView.state.sliceDoc(sel.from, sel.to)
      expect(selectedText).toBe("key")

      // 重新测试 nestedMulti
      const docMulti = "$$$ varTemplate\nconfig:\n$$$ --end"
      const editorViewMulti = new EditorView({
        state: EditorState.create({
          doc: docMulti,
          selection: { anchor: 23 },
        }),
      })
      editorViewMulti.coordsAtPos = vi
        .fn()
        .mockReturnValue({ left: 10, right: 20, top: 10, bottom: 20 })
      const editorRefMulti = { current: editorViewMulti }
      const { result: resultMulti } = renderHook(() => useMarkdownColonPanel(editorRefMulti))

      act(() => {
        resultMulti.current.syncColonPanel(editorViewMulti)
      })
      act(() => {
        resultMulti.current.selectColonOption("nestedMulti")
      })
      expect(editorViewMulti.state.doc.toString()).toContain(
        'config:\n  key:\n    """\n    var\n    """',
      )
      const selMulti = editorViewMulti.state.selection.main
      expect(editorViewMulti.state.sliceDoc(selMulti.from, selMulti.to)).toBe("key")
    })
  })

  describe("变量模板块语法高亮与非法行识别", () => {
    it("正确对变量块内部的合法键值对进行标记，并对非法非键值对行添加警告标记", () => {
      const doc = [
        "$$$ varTemplate",
        'api_host: "https://api.github.com"',
        "reviewer:",
        '  """',
        "  var",
        '  """',
        "# 这是一个注释",
        "invalid line without colon",
        "$$$ --end",
      ].join("\n")

      const extension = markdownMarkerHighlight(true)
      const state = EditorState.create({
        doc,
        extensions: [extension],
      })
      const view = new EditorView({ state })
      const plugin = view.plugin(extension[0]!)
      expect(plugin).toBeDefined()

      const classNames: string[] = []
      const cursor = plugin!.decorations.iter()
      while (cursor.value) {
        const cls =
          (cursor.value.spec as { class?: string })?.class ||
          (cursor.value.spec as { attributes?: { class?: string } })?.attributes?.class
        if (cls) {
          classNames.push(cls)
        }
        cursor.next()
      }

      // 包含合法键值对标记
      expect(classNames).toContain("cm-md-var-key")
      expect(classNames).toContain("cm-md-var-colon")
      expect(classNames).toContain("cm-md-var-string")
      expect(classNames).toContain("cm-md-var-triple-quote")
      expect(classNames).toContain("cm-md-var-comment")
      // 包含非法行警告标记
      expect(classNames).toContain("cm-md-var-invalid-text")
      expect(classNames.some((c) => c.includes("cm-md-var-invalid-line"))).toBe(true)
    })
  })

  describe("handleMarkdownVarBlockTab", () => {
    it("在 key 位置按下 Tab 跳转并选中右侧的单行或多行 value 内容", () => {
      const doc = [
        "$$$ varTemplate --start 「title: 」",
        'key1: "value1"',
        "key2:",
        '  """',
        "  multi_value",
        '  """',
        "$$$ varTemplate --end",
      ].join("\n")

      const state = EditorState.create({
        doc,
        // 光标在 key1 的 'e' 上 (第 2 行)
        selection: { anchor: doc.indexOf("key1") + 1 },
      })
      const view = new EditorView({ state })

      // Tab 前进 -> 选中 value1
      const handled = handleMarkdownVarBlockTab(view, 1)
      expect(handled).toBe(true)
      const sel = view.state.selection.main
      expect(view.state.sliceDoc(sel.from, sel.to)).toBe("value1")

      // 在 value1 时再次 Tab -> 跳转到下一个 key (key2)
      const handledNext = handleMarkdownVarBlockTab(view, 1)
      expect(handledNext).toBe(true)
      const selNext = view.state.selection.main
      expect(view.state.sliceDoc(selNext.from, selNext.to)).toBe("key2")

      // 在 key2 时再次 Tab -> 跳转到 key2 的多行内容
      const handledMulti = handleMarkdownVarBlockTab(view, 1)
      expect(handledMulti).toBe(true)
      const selMulti = view.state.selection.main
      expect(view.state.sliceDoc(selMulti.from, selMulti.to)).toBe("multi_value")

      // 在最后一个多行内容时再次 Tab -> 循环回第一个 key (key1)
      const handledLoop = handleMarkdownVarBlockTab(view, 1)
      expect(handledLoop).toBe(true)
      const selLoop = view.state.selection.main
      expect(view.state.sliceDoc(selLoop.from, selLoop.to)).toBe("key1")
    })

    it("支持 Shift+Tab 反向循环遍历", () => {
      const doc = [
        "$$$ varTemplate --start 「title: 」",
        'key1: "value1"',
        'key2: "value2"',
        "$$$ varTemplate --end",
      ].join("\n")

      const state = EditorState.create({
        doc,
        selection: { anchor: doc.indexOf("key1") },
      })
      const view = new EditorView({ state })

      // Shift+Tab 反向 -> 循环到最后一个 value (value2)
      const handled = handleMarkdownVarBlockTab(view, -1)
      expect(handled).toBe(true)
      const sel = view.state.selection.main
      expect(view.state.sliceDoc(sel.from, sel.to)).toBe("value2")

      // 再次 Shift+Tab -> 倒退到 key2
      const handledPrev = handleMarkdownVarBlockTab(view, -1)
      expect(handledPrev).toBe(true)
      const selPrev = view.state.selection.main
      expect(view.state.sliceDoc(selPrev.from, selPrev.to)).toBe("key2")
    })
  })

  describe("mergeMarkdownVarBlock", () => {
    it("若当前块是文档中的第一个变量模板块，返回 isAlreadyTop: true", () => {
      const doc = EditorState.create({
        doc: ["$$$ varTemplate --start 「title: 」", 'a: "1"', "$$$ varTemplate --end"].join("\n"),
      }).doc

      const res = mergeMarkdownVarBlock(doc, 0, 2)
      expect(res.isAlreadyTop).toBe(true)
      expect(res.success).toBe(false)
    })

    it("若当前块在第一个变量模板块下方，合并键值对到第一个块并删除当前块", () => {
      const initialText = [
        "$$$ varTemplate --start 「title: 」",
        'a: "1"',
        "$$$ varTemplate --end",
        "",
        "# 正文标题",
        "",
        "$$$ varTemplate --start 「title: 」",
        'b: "2"',
        "$$$ varTemplate --end",
      ].join("\n")

      const state = EditorState.create({ doc: initialText })
      const res = mergeMarkdownVarBlock(state.doc, 6, 8)
      expect(res.success).toBe(true)
      expect(res.changes).toBeDefined()

      const updated = state.update({ changes: res.changes! }).state.doc.toString()
      expect(updated).toContain('a: "1"\nb: "2"\n$$$ varTemplate --end')
      expect(updated).not.toContain('$$$ varTemplate --start 「title: 」\nb: "2"')
    })
  })

  describe("moveMarkdownVarBlockToTop", () => {
    it("若当前块已属于顶部变量模板块组，返回 isAlreadyTop: true", () => {
      const doc = EditorState.create({
        doc: [
          "$$$ varTemplate --start 「title: 1」",
          'a: "1"',
          "$$$ varTemplate --end",
          "",
          "$$$ varTemplate --start 「title: 2」",
          'b: "2"',
          "$$$ varTemplate --end",
          "",
          "# 正文",
        ].join("\n"),
      }).doc

      // 检查第 2 块（line 4 到 6）
      const res = moveMarkdownVarBlockToTop(doc, 4, 6)
      expect(res.isAlreadyTop).toBe(true)
      expect(res.success).toBe(false)
    })

    it("若顶部已有变量块组，将下方变量块移动至顶部变量块组下方（间隔一行）", () => {
      const initialText = [
        "$$$ varTemplate --start 「title: 1」",
        'a: "1"',
        "$$$ varTemplate --end",
        "",
        "# 正文",
        "",
        "$$$ varTemplate --start 「title: 2」",
        'b: "2"',
        "$$$ varTemplate --end",
      ].join("\n")

      const state = EditorState.create({ doc: initialText })
      const res = moveMarkdownVarBlockToTop(state.doc, 6, 8)
      expect(res.success).toBe(true)
      expect(res.changes).toBeDefined()

      const updated = state.update({ changes: res.changes! }).state.doc.toString()
      expect(updated).toBe(
        [
          "$$$ varTemplate --start 「title: 1」",
          'a: "1"',
          "$$$ varTemplate --end",
          "",
          "$$$ varTemplate --start 「title: 2」",
          'b: "2"',
          "$$$ varTemplate --end",
          "",
          "# 正文",
        ].join("\n"),
      )
    })

    it("若顶部没有任何变量块，将下方变量块移动至文档最顶部（位置 0）", () => {
      const initialText = [
        "# 正文",
        "正文内容",
        "",
        "$$$ varTemplate --start 「title: 」",
        'b: "2"',
        "$$$ varTemplate --end",
      ].join("\n")

      const state = EditorState.create({ doc: initialText })
      const res = moveMarkdownVarBlockToTop(state.doc, 3, 5)
      expect(res.success).toBe(true)
      expect(res.changes).toBeDefined()

      const updated = state.update({ changes: res.changes! }).state.doc.toString()
      expect(updated).toBe(
        [
          "$$$ varTemplate --start 「title: 」",
          'b: "2"',
          "$$$ varTemplate --end",
          "",
          "# 正文",
          "正文内容",
        ].join("\n"),
      )
    })
  })

  describe("斜杠命令 /varTemplate 默认空 title", () => {
    it("默认生成的模板 title 为空", () => {
      const commands = getMarkdownSlashCommands("/varTemplate", false, true, [], "zh")
      expect(commands).toHaveLength(1)
      expect(commands[0].content).toContain("$$$ varTemplate --start 「title: 」")
    })
  })
})

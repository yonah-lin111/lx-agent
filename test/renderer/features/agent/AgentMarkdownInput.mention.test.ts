// @vitest-environment jsdom
import { markdown } from "@codemirror/lang-markdown"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import { describe, expect, it } from "vitest"
import { markdownMarkerHighlight } from "@/features/markdown/extensions/markdownEditorExtensions"

const collectDecoratedRanges = (source: string): string[] => {
  const extension = markdownMarkerHighlight()
  const pluginSpec = extension[0]!
  const state = EditorState.create({
    doc: source,
    extensions: [markdown({ extensions: [GFM] }), extension],
  })
  const view = new EditorView({ state })
  const plugin = view.plugin(pluginSpec)
  const ranges: string[] = []
  if (plugin) {
    const cursor = plugin.decorations.iter()
    while (cursor.value) {
      ranges.push(view.state.doc.sliceString(cursor.from, cursor.to))
      cursor.next()
    }
  }
  return ranges
}

describe("AgentMarkdownInput 标记与提及高亮", () => {
  it("普通 @path、参考引用 token 都被装饰", () => {
    const source =
      "@src/foo.ts @[refer-image](img/logo.png) @[refer-project](/root) @[refer-file](docs/a.md)"
    const ranges = collectDecoratedRanges(source)
    expect(ranges).toContain("@src/foo.ts")
    expect(ranges).toContain("@[refer-image](img/logo.png)")
    expect(ranges).toContain("@[refer-project](/root)")
    expect(ranges).toContain("@[refer-file](docs/a.md)")
  })

  it("普通文本不被装饰为提及", () => {
    const source = "hello world 123 !@# 邮箱 a@b.com"
    const ranges = collectDecoratedRanges(source)
    expect(ranges.filter((r) => r.includes("@"))).toHaveLength(0)
  })

  it("不带路径内容的 @ 不装饰（如独立 @ 符号）", () => {
    const source = "请 @ 我"
    const ranges = collectDecoratedRanges(source)
    expect(ranges.filter((r) => r.includes("@"))).toHaveLength(0)
  })

  it("Markdown 标题、列表、粗体、代码块等标记被正确装饰", () => {
    const source = "### 标题\n- [ ] 待办\n**粗体**\n`code`"
    const ranges = collectDecoratedRanges(source)
    expect(ranges).toContain("###")
    expect(ranges).toContain("-")
    expect(ranges).toContain("[ ]")
    expect(ranges).toContain("**")
    expect(ranges).toContain("`")
  })
})
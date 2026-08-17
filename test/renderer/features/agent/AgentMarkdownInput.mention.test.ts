// @vitest-environment jsdom
import { Text } from "@codemirror/state"
import { describe, expect, it } from "vitest"
import { buildMentionDecorations } from "@/features/agent/components/AgentMarkdownInput"

const collectDecoratedRanges = (doc: Text): string[] => {
  const ranges: string[] = []
  const cursor = buildMentionDecorations(doc).iter()
  while (cursor.value) {
    ranges.push(doc.sliceString(cursor.from, cursor.to))
    cursor.next()
  }
  return ranges
}

describe("AgentMarkdownInput @ 提及高亮", () => {
  it("普通 @path、参考引用、参考图片 token 都被装饰", () => {
    const source =
      "@src/foo.ts @[refer-image](img/logo.png) @[refer-project](/root) @[refer-file](docs/a.md)"
    const doc = Text.of([source])
    const ranges = collectDecoratedRanges(doc)
    expect(ranges).toContain("@src/foo.ts")
    expect(ranges).toContain("@[refer-image](img/logo.png)")
    expect(ranges).toContain("@[refer-project](/root)")
    expect(ranges).toContain("@[refer-file](docs/a.md)")
  })

  it("普通文本不被装饰", () => {
    const doc = Text.of(["hello world 123 !@# 邮箱 a@b.com"])
    expect(collectDecoratedRanges(doc)).toHaveLength(0)
  })

  it("不带路径内容的 @ 不装饰（如独立 @ 符号）", () => {
    const doc = Text.of(["请 @ 我"])
    expect(collectDecoratedRanges(doc)).toHaveLength(0)
  })
})
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LxCodeBlock } from "@/components/ui/LxCodeBlock"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { LxMarkdownPreview as EditorMarkdownPreview } from "@/features/markdown/LxMarkdownPreview"

vi.mock("@/features/markdown/components/MermaidDiagram", () => ({
  MermaidDiagram: (): null => null,
}))

const CODE_HTML =
  '<section class="markdown-code-block"><pre><code>const a = 1</code></pre></section>'

describe("流式期间禁用代码块/模板块头部吸顶", () => {
  afterEach(() => {
    cleanup()
  })

  it("LxMarkdownPreview（聊天预览）：默认吸顶，prop 开启后追加静态类", () => {
    const { container, rerender } = render(
      <LxMarkdownPreview html={CODE_HTML} previewMode="preview" />,
    )
    const article = container.querySelector("article.markdown-preview")
    expect(article?.className).not.toContain("markdown-block-headers-static")

    rerender(<LxMarkdownPreview html={CODE_HTML} previewMode="preview" disableStickyBlockHeaders />)
    expect(container.querySelector("article.markdown-preview")?.className).toContain(
      "markdown-block-headers-static",
    )
  })

  it("LxMarkdownPreview（编辑器预览）：prop 开启后追加静态类", () => {
    const previewRef = createRef<HTMLElement>()
    const { container } = render(
      <EditorMarkdownPreview
        html="<p>hello</p>"
        previewMode="preview"
        previewRef={previewRef}
        disableStickyBlockHeaders
      />,
    )
    expect(container.querySelector("article.markdown-preview")?.className).toContain(
      "markdown-block-headers-static",
    )
  })

  it("LxCodeBlock：默认吸顶，prop 开启后追加静态类", () => {
    const { container, rerender } = render(<LxCodeBlock code="const a = 1" language="ts" />)
    const wrapper = container.querySelector(".lx-code-block-wrapper")
    expect(wrapper?.className).toContain("markdown-preview")
    expect(wrapper?.className).not.toContain("markdown-block-headers-static")

    rerender(<LxCodeBlock code="const a = 1" language="ts" disableStickyBlockHeaders />)
    expect(container.querySelector(".lx-code-block-wrapper")?.className).toContain(
      "markdown-block-headers-static",
    )
  })
})

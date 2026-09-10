import { describe, expect, it } from "vitest"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"

describe("markdownRenderer", () => {
  it("为 fenced code block 添加语言栏和复制按钮挂载点", () => {
    const html = markdownRenderer.render("```typescript\nconst answer = 42\n```")

    expect(html).toContain('class="markdown-code-block"')
    expect(html).toContain('class="markdown-code-language">typescript</span>')
    expect(html).toContain('class="markdown-code-copy"')
    expect(html).toContain('class="markdown-code-collapse"')
    expect(html).toContain('class="markdown-code-content"')
    expect(html).toContain('class="language-typescript hljs"')
    expect(html).toContain('class="hljs-keyword">const</span>')
    expect(html).toContain(" answer = ")
    expect(html).toContain('class="hljs-number">42</span>')
  })

  it("为 Mermaid 代码块生成图表挂载点", () => {
    const source = "flowchart LR\n  A[Start] --> B[End]"
    const html = markdownRenderer.render(`\`\`\`mermaid\n${source}\n\`\`\``)

    expect(html).toContain('class="markdown-mermaid"')
    expect(html).toContain(`data-mermaid-source="${encodeURIComponent(`${source}\n`)}"`)
    expect(html).not.toContain('class="markdown-code-block"')
  })
})

describe("markdownRenderer 图片渲染", () => {
  it("外链 https/http 图片渲染为 img 并保留 src", () => {
    expect(markdownRenderer.render("![动图](https://example.com/animated.gif)")).toContain(
      '<img src="https://example.com/animated.gif" alt="动图">',
    )
    expect(markdownRenderer.render("![图](http://example.com/a.png)")).toContain(
      '<img src="http://example.com/a.png" alt="图">',
    )
  })

  it("data:image/gif 与 lx-image 协议渲染为 img", () => {
    expect(markdownRenderer.render("![gif](data:image/gif;base64,R0lGOD)")).toContain(
      '<img src="data:image/gif;base64,R0lGOD" alt="gif">',
    )
    expect(markdownRenderer.render("![local](lx-image://local/tmp/a.gif)")).toContain(
      '<img src="lx-image://local/tmp/a.gif" alt="local">',
    )
  })

  it("file/javascript/data:image/svg+xml 链接不渲染为 img", () => {
    const blockedUrls = [
      "file:///tmp/a.gif",
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz4=",
    ]

    for (const url of blockedUrls) {
      const html = markdownRenderer.render(`![x](${url})`)

      expect(html).not.toContain("<img")
      expect(html).toContain("![x]")
    }
  })
})

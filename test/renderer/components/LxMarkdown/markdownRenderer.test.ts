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

  it("渲染带类型和路径的 Markdown 引用", () => {
    const html = markdownRenderer.render("@[refer-image](/Users/yonah/Desktop/example.png)")

    expect(html).toContain('class="markdown-reference markdown-reference-image"')
    expect(html).toContain('data-reference-path="/Users/yonah/Desktop/example.png"')
    expect(html).toContain("参考图片")
    expect(html).toContain("example.png")
  })
})

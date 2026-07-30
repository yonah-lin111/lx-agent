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

  it("渲染模板块并提供原始内容复制数据", () => {
    const content = "# 标题\n\n- 内容"
    const html = markdownRenderer.render(`&&& addTemplate\n${content}\n&&&`)

    expect(html).toContain('class="markdown-template-block"')
    expect(html).toContain('data-template-command="addTemplate"')
    expect(html).toContain(`data-template-content="${encodeURIComponent(`${content}\n`)}"`)
    expect(html).toContain('class="markdown-template-copy"')
    expect(html).toContain('class="markdown-template-collapse"')
    expect(html).toContain(">标题</h1>")
    expect(html).toContain("<li>内容</li>")
  })

  it("不在模板块内部解析嵌套模板块", () => {
    const html = markdownRenderer.render(
      "&&& addTemplate\n外层\n\n&&& bugTemplate\n内层\n&&&\n\n&&&",
    )

    expect(html.match(/class="markdown-template-block"/g)).toHaveLength(1)
    expect(html).toContain("内层")
  })
})

import { describe, expect, it } from "vitest"
import { getMarkdownReferenceImageSource } from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"
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
    const htmlImage = markdownRenderer.render("@[refer-image](/Users/yonah/Desktop/example.png)")

    expect(htmlImage).toContain('class="markdown-reference markdown-reference-image"')
    expect(htmlImage).toContain('data-reference-path="/Users/yonah/Desktop/example.png"')
    expect(htmlImage).toContain("image:")
    expect(htmlImage).toContain("example.png")

    const htmlCommon = markdownRenderer.render("@[refer-common](/Users/yonah/Desktop/example.txt)")

    expect(htmlCommon).toContain('class="markdown-reference markdown-reference-common"')
    expect(htmlCommon).toContain('data-reference-path="/Users/yonah/Desktop/example.txt"')
    expect(htmlCommon).toContain("common:")
    expect(htmlCommon).toContain("example.txt")
  })

  it("将本地图片路径转换为可加载的自定义协议 URL", () => {
    expect(getMarkdownReferenceImageSource("/Users/yonah/Desktop/example image#.png")).toBe(
      "lx-image://local/Users/yonah/Desktop/example%20image%23.png",
    )
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

  it("渲染 @文件提及 并转换为父文件夹/文件名格式的缩略文本与完整内容 dataset", () => {
    const html = markdownRenderer.render(
      "请查看 @src/renderer/src/components/ui/LxMarkdown/LxMarkdownEditor.tsx 文件",
    )

    expect(html).toContain('class="markdown-file-mention"')
    expect(html).toContain(
      `data-full-mention="${encodeURIComponent("@src/renderer/src/components/ui/LxMarkdown/LxMarkdownEditor.tsx")}"`,
    )
    expect(html).toContain(
      `data-display-label="${encodeURIComponent("@LxMarkdown/LxMarkdownEditor.tsx")}"`,
    )
    expect(html).toContain("@LxMarkdown/LxMarkdownEditor.tsx")
  })

  it("渲染引用项目的 @文件提及 并转换为 @引用项目名称/.../@父文件夹名称/文件名 格式", () => {
    const markdown =
      "@[refer-project](/Users/yonah/projects/other-app)\n\n请查看 @other-app/src/renderer/src/components/ui/LxMarkdown/LxMarkdownEditor.tsx 文件"
    const html = markdownRenderer.render(markdown)

    expect(html).toContain('class="markdown-file-mention"')
    expect(html).toContain('data-is-referenced="true"')
    expect(html).toContain("markdown-file-mention-node--referenced")
    expect(html).toContain(
      `data-full-mention="${encodeURIComponent("@other-app/src/renderer/src/components/ui/LxMarkdown/LxMarkdownEditor.tsx")}"`,
    )
    expect(html).toContain(
      `data-display-label="${encodeURIComponent("@other-app/.../@LxMarkdown/LxMarkdownEditor.tsx")}"`,
    )
    expect(html).toContain("@other-app/.../@LxMarkdown/LxMarkdownEditor.tsx")
  })
})

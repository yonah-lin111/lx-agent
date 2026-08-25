import { describe, expect, it } from "vitest"
import { getMarkdownReferenceImageSource } from "@/features/markdown/commands/markdownReferenceCommands"
import {
  markdownRenderer,
  stripEmptyTemplateItems,
} from "@/features/markdown/utils/markdownRenderer"

describe("markdownRenderer", () => {
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

  it("渲染模板块并提供清理后的原始内容复制数据", () => {
    const content = "# 标题\n\n- 内容"
    const html = markdownRenderer.render(`&&& addTemplate\n${content}\n&&&`)

    expect(html).toContain('class="markdown-template-block"')
    expect(html).toContain('data-template-command="addTemplate"')
    expect(html).toContain(`data-template-content="${encodeURIComponent(content)}"`)
    expect(html).toContain('class="markdown-template-copy"')
    expect(html).toContain('class="markdown-template-collapse"')
    expect(html).toContain(">标题</h1>")
    expect(html).toContain("<li>内容</li>")
  })

  it("将模板块内的 // 行渲染为灰色斜体注释，且复制数据剔除注释行", () => {
    const content = "# 标题\n\n// 这是注释\n\n- 内容\n\n  // 缩进注释"
    const html = markdownRenderer.render(`&&& addTemplate\n${content}\n&&&`)

    expect(html).toContain('class="markdown-template-comment"')
    expect(html).toContain("这是注释")
    expect(html).toContain("缩进注释")
    expect(html).toContain(`data-template-content="${encodeURIComponent("# 标题\n\n- 内容")}"`)
    expect(html).not.toContain("data-template-content=" + encodeURIComponent("这是注释"))
  })

  it("模板块外的 // 行不渲染为注释", () => {
    const html = markdownRenderer.render("// 普通文本")

    expect(html).not.toContain('class="markdown-template-comment"')
    expect(html).toContain("// 普通文本")
  })

  it("缩进注释行紧跟列表项时仍渲染为注释并保留缩进", () => {
    const html = markdownRenderer.render("&&& addTemplate\n- 要求:\n  - 支持\n  // 缩进注释\n&&&")

    expect(html).toContain('class="markdown-template-comment"')
    expect(html).toContain('<div class="markdown-template-comment">  // 缩进注释</div>')
  })

  it("不在模板块内部解析嵌套模板块", () => {
    const html = markdownRenderer.render(
      "&&& addTemplate\n外层\n\n&&& bugTemplate\n内层\n&&&\n\n&&&",
    )

    expect(html.match(/class="markdown-template-block"/g)).toHaveLength(1)
    expect(html).toContain("内层")
  })

  it("渲染模板块完成状态并提供切换按钮挂载点", () => {
    const html = markdownRenderer.render("&&& addTemplate\n内容\n&&& done")

    expect(html).toContain('data-template-status="done"')
    expect(html).toContain("markdown-template-block--done")
    expect(html).toContain('class="markdown-template-status"')
    expect(html.indexOf('class="markdown-template-status"')).toBeLessThan(
      html.indexOf('class="markdown-template-copy"'),
    )
  })

  it("渲染模板块进行中状态并提供切换按钮挂载点", () => {
    const html = markdownRenderer.render("&&& addTemplate\n内容\n&&& in_progress")

    expect(html).toContain('data-template-status="in_progress"')
    expect(html).toContain("markdown-template-block--in-progress")
    expect(html).toContain('class="markdown-template-status"')
  })

  it("带 id 与工作区绑定标记的结束行仍识别为模板块结束", () => {
    const html = markdownRenderer.render(
      `&&& addTemplate\n内容\n&&& done {id:0123456789abcdef0123456789abcdef} {wt:feature-x}`,
    )

    expect(html).toContain('data-template-status="done"')
    expect(html).toContain("markdown-template-block--done")
    expect(html).not.toContain("{wt:feature-x}")
  })

  it("未标记完成时模板块默认为未完成状态", () => {
    const html = markdownRenderer.render("&&& addTemplate\n内容\n&&&")

    expect(html).toContain('data-template-status="todo"')
    expect(html).not.toContain("markdown-template-block--done")
    expect(html).not.toContain("markdown-template-block--in-progress")
  })

  it("为顶层模板块添加同步滚动锚点 data-line", () => {
    const html = markdownRenderer.render("&&& addTemplate\n内容\n&&&")

    expect(html).toContain('class="markdown-template-block" data-line="0"')
  })

  it("渲染 @文件提及 并转换为完整路径显示标签与完整内容 dataset", () => {
    const html = markdownRenderer.render(
      "请查看 @src/renderer/src/components/ui/LxMarkdown/LxMarkdownEditor.tsx 文件",
    )

    expect(html).toContain('class="markdown-file-mention"')
    expect(html).toContain(
      `data-full-mention="${encodeURIComponent("@src/renderer/src/components/ui/LxMarkdown/LxMarkdownEditor.tsx")}"`,
    )
    expect(html).toContain(
      `data-display-label="${encodeURIComponent("@src/renderer/src/components/ui/LxMarkdown/LxMarkdownEditor.tsx")}"`,
    )
    expect(html).toContain("@src/renderer/src/components/ui/LxMarkdown/LxMarkdownEditor.tsx")
  })

  it("渲染引用项目根路径下的 @文件提及 并标记引用状态", () => {
    const markdown =
      "@[refer-project](/Users/yonah/projects/other-app)\n\n请查看 @/Users/yonah/projects/other-app/src/renderer/src/components/ui/LxMarkdown/LxMarkdownEditor.tsx 文件"
    const html = markdownRenderer.render(markdown)

    expect(html).toContain('class="markdown-file-mention"')
    expect(html).toContain('data-is-referenced="true"')
    expect(html).toContain("markdown-file-mention-node--referenced")
    expect(html).toContain(
      `data-full-mention="${encodeURIComponent("@/Users/yonah/projects/other-app/src/renderer/src/components/ui/LxMarkdown/LxMarkdownEditor.tsx")}"`,
    )
  })

  it("stripEmptyTemplateItems 在 preserveSuppleBlocks=true 时保留 +++ 内部未填项", () => {
    const input = [
      "- 参考: ",
      "- 位置: src/a.ts",
      "+++ suppleTemplate",
      "- 参考: ",
      "- 位置: ",
      "+++",
      "- 要求: ",
      "  - ",
    ].join("\n")

    const cleaned = stripEmptyTemplateItems(input, true)
    expect(cleaned).toBe(
      ["- 位置: src/a.ts", "+++ suppleTemplate", "- 参考: ", "- 位置: ", "+++"].join("\n"),
    )
  })

  it("stripEmptyTemplateItems 在 preserveSuppleBlocks=false 时清理全部未填项", () => {
    const input = ["- 参考: ", "- 位置: src/a.ts", "- 要求: ", "  - ", "- 描述: 具体描述"].join(
      "\n",
    )

    const cleaned = stripEmptyTemplateItems(input, false)
    expect(cleaned).toBe(["- 位置: src/a.ts", "- 描述: 具体描述"].join("\n"))
  })
})

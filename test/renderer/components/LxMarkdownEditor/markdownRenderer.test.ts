import { describe, expect, it } from "vitest"
import { markdownRenderer } from "@/components/ui/LxMarkdownEditor/markdownRenderer"

describe("markdownRenderer", () => {
  it("为 fenced code block 添加语言栏和复制按钮挂载点", () => {
    const html = markdownRenderer.render("```typescript\nconst answer = 42\n```")

    expect(html).toContain('class="markdown-code-block"')
    expect(html).toContain('class="markdown-code-language">typescript</span>')
    expect(html).toContain('class="markdown-code-copy"')
    expect(html).toContain("const answer = 42")
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { markdownRenderer, renderMarkdown } from "@/components/ui/LxMarkdown/utils/markdownRenderer"

const unique = (label: string): string => `${label}-${Math.random().toString(36).slice(2)}`

describe("renderMarkdown 流式渲染", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("流式中未闭合代码块跳过语法高亮，但保留代码块结构与内容", () => {
    const html = renderMarkdown(`\`\`\`ts\nconst ${unique("value")} = 1`, { streaming: true })

    expect(html).toContain("markdown-code-block")
    expect(html).not.toContain("hljs-keyword")
    expect(html).toContain("const ")
  })

  it("流式中已闭合代码块保持正常语法高亮", () => {
    const source = `\`\`\`ts\nconst ${unique("closed")} = 1\n\`\`\``
    const html = renderMarkdown(source, { streaming: true })

    expect(html).toContain("hljs-keyword")
  })

  it("非流式（生成结束）时未闭合代码块也正常高亮", () => {
    const html = renderMarkdown(`\`\`\`ts\nconst ${unique("final")} = 1`, { streaming: false })

    expect(html).toContain("hljs-keyword")
  })

  it("相同文本与 streaming 标志复用缓存，不重复解析", () => {
    const text = `缓存命中检查 ${unique("cache")}`
    const renderSpy = vi.spyOn(markdownRenderer, "render")

    const first = renderMarkdown(text, { streaming: true })
    const second = renderMarkdown(text, { streaming: true })

    expect(second).toBe(first)
    expect(renderSpy).toHaveBeenCalledTimes(1)
  })

  it("streaming 标志参与缓存键：未闭合代码块在结束后重新高亮", () => {
    const text = `\`\`\`ts\nconst ${unique("switch")} = 1`

    const streamingHtml = renderMarkdown(text, { streaming: true })
    const finalHtml = renderMarkdown(text, { streaming: false })

    expect(streamingHtml).not.toContain("hljs-keyword")
    expect(finalHtml).toContain("hljs-keyword")
  })
})

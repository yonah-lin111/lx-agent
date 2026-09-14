import { afterEach, describe, expect, it, vi } from "vitest"

// 统计语法高亮调用次数：验证缓存复用行为。
const { highlightSpy } = vi.hoisted(() => ({ highlightSpy: vi.fn() }))

vi.mock("@/lib/codeHighlight", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/codeHighlight")>()
  highlightSpy.mockImplementation((content: string, language: string | null | undefined): string =>
    actual.highlightCode(content, language),
  )
  return { ...actual, highlightCode: highlightSpy }
})

import { markdownRenderer, renderMarkdown } from "@/components/ui/LxMarkdown/utils/markdownRenderer"

const unique = (label: string): string => `${label}_${Math.random().toString(36).slice(2)}`

describe("renderMarkdown 流式渲染", () => {
  afterEach(() => {
    highlightSpy.mockClear()
  })

  it("流式中未闭合代码块跳过语法高亮，但保留代码块结构与内容", () => {
    const html = renderMarkdown(`\`\`\`ts\nconst ${unique("value")} = 1`, { streaming: true })

    expect(html).toContain("markdown-code-block")
    expect(html).not.toContain("hljs-keyword")
    expect(html).toContain("const ")
  })

  it("流式中已闭合代码块保持正常语法高亮，且高亮结果按内容缓存复用", () => {
    const suffix = unique("closed")
    const fence = `\`\`\`ts\nconst ${suffix} = 1\n\`\`\``

    highlightSpy.mockClear()
    const firstHtml = renderMarkdown(`前置 ${suffix}\n\n${fence}`, { streaming: true })
    expect(firstHtml).toContain("hljs-keyword")
    expect(highlightSpy).toHaveBeenCalledTimes(1)

    highlightSpy.mockClear()
    const secondHtml = renderMarkdown(`后置 ${suffix}\n\n${fence}`, { streaming: true })
    expect(secondHtml).toContain("hljs-keyword")
    // 同一代码块内容命中高亮缓存，逐帧重渲染不重复高亮。
    expect(highlightSpy).toHaveBeenCalledTimes(0)
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
    renderSpy.mockRestore()
  })

  it("streaming 标志参与缓存键：未闭合代码块在结束后重新高亮", () => {
    const text = `\`\`\`ts\nconst ${unique("switch")} = 1`

    const streamingHtml = renderMarkdown(text, { streaming: true })
    const finalHtml = renderMarkdown(text, { streaming: false })

    expect(streamingHtml).not.toContain("hljs-keyword")
    expect(finalHtml).toContain("hljs-keyword")
  })
})

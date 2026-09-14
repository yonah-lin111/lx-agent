import { afterEach, describe, expect, it, vi } from "vitest"

// 统计语法高亮调用次数：验证增量/缓存复用行为。
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

  it("流式中未闭合代码块保持语法高亮（不再无色）", () => {
    const html = renderMarkdown(`\`\`\`ts\nconst ${unique("value")} = 1`, { streaming: true })

    expect(html).toContain("markdown-code-block")
    expect(html).toContain("hljs-keyword")
  })

  it("流式增量高亮：已完成行复用缓存，仅重高亮尾部增长行", () => {
    const suffix = unique("inc")
    const firstLine = `const a_${suffix} = 1`
    const secondLine = `const b_${suffix} = 2`
    const textV1 = `\`\`\`ts\n${firstLine}\n${secondLine}`

    highlightSpy.mockClear()
    renderMarkdown(textV1, { streaming: true })
    // 首帧：前缀（第一行 + 换行）与尾部各高亮一次。
    expect(highlightSpy).toHaveBeenCalledTimes(2)

    highlightSpy.mockClear()
    renderMarkdown(`${textV1}3`, { streaming: true })
    // 同帧内文本增长（未换行）：前缀命中缓存，仅尾部重新高亮。
    expect(highlightSpy).toHaveBeenCalledTimes(1)
    expect(highlightSpy).toHaveBeenCalledWith(`${secondLine}3`, "ts")
  })

  it("已闭合代码块的高亮结果按内容复用，逐帧重渲染不重复高亮", () => {
    const suffix = unique("closed")
    const fence = `\`\`\`ts\nconst ${suffix} = 1\n\`\`\``

    highlightSpy.mockClear()
    renderMarkdown(`前置 ${suffix}\n\n${fence}`, { streaming: true })
    expect(highlightSpy).toHaveBeenCalledTimes(1)

    highlightSpy.mockClear()
    renderMarkdown(`后置 ${suffix}\n\n${fence}`, { streaming: true })
    expect(highlightSpy).toHaveBeenCalledTimes(0)
  })

  it("非流式（生成结束）时未闭合代码块正常高亮", () => {
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

  it("streaming 标志参与缓存键：流式与终态结果各自独立", () => {
    const text = `\`\`\`ts\nconst ${unique("switch")} = 1`
    const renderSpy = vi.spyOn(markdownRenderer, "render")

    const streamingHtml = renderMarkdown(text, { streaming: true })
    const finalHtml = renderMarkdown(text, { streaming: false })

    expect(streamingHtml).toContain("hljs-keyword")
    expect(finalHtml).toContain("hljs-keyword")
    expect(renderSpy).toHaveBeenCalledTimes(2)
    renderSpy.mockRestore()
  })
})

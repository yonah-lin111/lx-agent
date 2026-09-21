// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { sanitizeHtmlDocument } from "@/features/agent/components/visuals/sanitizeVisual"

describe("sanitizeHtmlDocument 保留根节点属性", () => {
  it("保留 body/html 上的布局与语言属性（body 布局类丢失会导致预览不居中）", () => {
    const rawHtml = `<!DOCTYPE html>
      <html lang="zh-CN">
        <head><title>Layout</title></head>
        <body class="min-h-screen flex items-center justify-center bg-zinc-950">
          <div class="w-full max-w-2xl">智能实例与部署</div>
        </body>
      </html>`

    const cleaned = sanitizeHtmlDocument(rawHtml)

    expect(cleaned).toContain('lang="zh-CN"')
    expect(cleaned).toContain('class="min-h-screen flex items-center justify-center bg-zinc-950"')
    expect(cleaned).toContain('class="w-full max-w-2xl"')
    expect(cleaned).toContain("智能实例与部署")
  })

  it("根节点上的危险属性与内联样式仍被剥离", () => {
    const rawHtml = `<!DOCTYPE html>
      <html onload="alert(1)">
        <head></head>
        <body onpageshow="alert(2)" data-state="ready" style="background:url(javascript:alert(3))">
          <p>ok</p>
        </body>
      </html>`

    const cleaned = sanitizeHtmlDocument(rawHtml)

    expect(cleaned).not.toContain("onload")
    expect(cleaned).not.toContain("onpageshow")
    expect(cleaned).not.toContain("javascript:")
    expect(cleaned).toContain('data-state="ready"')
    expect(cleaned).toContain("ok")
  })

  it("allowScripts 链路（设计预览）保留 body 内联事件与 class", () => {
    const rawHtml = `<!DOCTYPE html><html><body class="p-8" onload="init()"><p>ok</p></body></html>`

    const cleaned = sanitizeHtmlDocument(rawHtml, { allowScripts: true })

    expect(cleaned).toContain('class="p-8"')
    expect(cleaned).toContain("onload")
  })
})

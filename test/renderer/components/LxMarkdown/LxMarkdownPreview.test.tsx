// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"

const previewHtml = `<section class="markdown-code-block"><header class="markdown-code-block-header"><span class="markdown-code-actions"><span class="markdown-code-copy"></span><span class="markdown-code-collapse"></span></span></header><div class="markdown-code-content"><pre><code>const answer = 42</code></pre></div></section>`

describe("LxMarkdownPreview", () => {
  it("父组件保存后重新渲染时保留代码操作节点", async () => {
    const previewRef = { current: null }
    const view = render(
      <LxMarkdownPreview html={previewHtml} previewMode="split" previewRef={previewRef} />,
    )

    await screen.findByRole("button", { name: "复制代码" })

    view.rerender(
      <LxMarkdownPreview html={previewHtml} previewMode="split" previewRef={previewRef} />,
    )

    expect(screen.queryByRole("button", { name: "复制代码" })).not.toBeNull()
    expect(screen.queryByRole("button", { name: "折叠内容" })).not.toBeNull()
  })

  it("点击超链接时不触发页面跳转", () => {
    const previewRef = { current: null }
    render(
      <LxMarkdownPreview
        html='<a href="https://example.com" target="_blank">外部链接</a>'
        previewMode="split"
        previewRef={previewRef}
      />,
    )

    const link = screen.getByRole("link", { name: "外部链接" })
    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(true)
  })

  it("sanitizeCopy 开启时复制选中内容会剥离块边界换行伪影", () => {
    const previewRef = { current: null }
    const { container } = render(
      <LxMarkdownPreview
        html="<p>第一行</p><p>第二行</p>"
        previewMode="split"
        previewRef={previewRef}
        sanitizeCopy
      />,
    )

    const content = container.querySelector(".markdown-preview-content") as HTMLDivElement
    const firstParagraph = content.firstChild as HTMLParagraphElement
    const lastParagraph = content.lastElementChild as HTMLParagraphElement

    const range = document.createRange()
    range.setStart(firstParagraph.firstChild as Text, 0)
    range.setEndAfter(lastParagraph)

    const getSelection = vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => "第一行\n第二行\n\n",
    } as unknown as Selection)

    const store = new Map<string, string>()
    const dataTransfer = {
      setData: (type: string, data: string) => store.set(type, data),
      getData: (type: string) => store.get(type) ?? "",
    }
    const event = new Event("copy", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", { value: dataTransfer, configurable: true })
    content.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dataTransfer.getData("text/plain")).toBe("第一行\n第二行")
    getSelection.mockRestore()
  })

  it("sanitizeCopy 未开启时复制选中内容不做干预", () => {
    const previewRef = { current: null }
    const { container } = render(
      <LxMarkdownPreview
        html="<p>第一行</p><p>第二行</p>"
        previewMode="split"
        previewRef={previewRef}
      />,
    )

    const content = container.querySelector(".markdown-preview-content") as HTMLDivElement
    const firstParagraph = content.firstChild as HTMLParagraphElement
    const lastParagraph = content.lastElementChild as HTMLParagraphElement

    const range = document.createRange()
    range.setStart(firstParagraph.firstChild as Text, 0)
    range.setEndAfter(lastParagraph)

    const getSelection = vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => "第一行\n第二行\n",
    } as unknown as Selection)

    const store = new Map<string, string>()
    const dataTransfer = {
      setData: (type: string, data: string) => store.set(type, data),
      getData: (type: string) => store.get(type) ?? "",
    }
    const event = new Event("copy", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", { value: dataTransfer, configurable: true })
    content.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(dataTransfer.getData("text/plain")).toBe("")
    getSelection.mockRestore()
  })
})

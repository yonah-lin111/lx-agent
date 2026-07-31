// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"

const previewHtml = `<section class="markdown-code-block"><header class="markdown-code-block-header"><span class="markdown-code-actions"><span class="markdown-code-copy"></span><span class="markdown-code-collapse"></span></span></header><div class="markdown-code-content"><pre><code>const answer = 42</code></pre></div></section><span class="markdown-file-mention" data-full-mention="%40src%2Fexample.ts" data-display-label="%40example.ts" data-is-referenced="false"><span class="markdown-file-mention-node">@example.ts</span></span>`

describe("LxMarkdownPreview", () => {
  it("父组件保存后重新渲染时保留代码操作和文件提及提示", async () => {
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

    fireEvent.mouseEnter(screen.getByText("@example.ts"))

    expect((await screen.findByRole("tooltip")).textContent).toContain("@src/example.ts")
  })

  it("悬停本地图片引用时显示图片预览和文件名", async () => {
    const previewRef = { current: null }
    render(
      <LxMarkdownPreview
        html={
          '<span class="markdown-reference markdown-reference-image" data-reference-path="/Users/yonah/Desktop/example image.png">image: example image.png</span>'
        }
        previewMode="split"
        previewRef={previewRef}
      />,
    )

    fireEvent.mouseEnter(screen.getByText("image: example image.png"))

    const image = await screen.findByAltText("example image.png")
    const tooltip = image.closest('[role="tooltip"]')
    expect(tooltip?.textContent).toBe("")
    expect(image.getAttribute("src")).toBe(
      "lx-image://local/Users/yonah/Desktop/example%20image.png",
    )
  })

  it("本地图片加载失败时显示提示", async () => {
    const previewRef = { current: null }
    render(
      <LxMarkdownPreview
        html={
          '<span class="markdown-reference markdown-reference-image" data-reference-path="/Users/yonah/Desktop/missing.png">image: missing.png</span>'
        }
        previewMode="split"
        previewRef={previewRef}
      />,
    )

    fireEvent.mouseEnter(screen.getByText("image: missing.png"))
    fireEvent.error(await screen.findByAltText("missing.png"))

    expect(await screen.findByText("图片加载失败")).not.toBeNull()
  })
})

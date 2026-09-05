// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LxCodeBlock } from "@/components/ui/LxCodeBlock"

describe("LxCodeBlock", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("正确渲染代码语言头部与语法高亮内容", () => {
    const code = '<div class="p-4">Hello World</div>'
    const { container } = render(<LxCodeBlock code={code} language="html" />)

    expect(screen.getByText("html")).toBeDefined()
    expect(container.querySelector("pre code")).not.toBeNull()
    expect(container.querySelector("pre code")?.textContent).toContain("Hello World")
    expect(container.querySelector(".markdown-code-block")).not.toBeNull()
  })

  it("支持点击折叠按钮折叠与展开代码内容", () => {
    const code = "const a = 1;"
    const { container } = render(<LxCodeBlock code={code} language="typescript" collapsible />)

    const codeContent = container.querySelector(".markdown-code-content") as HTMLElement
    expect(codeContent.style.display).not.toBe("none")

    const collapseButton = screen.getByRole("button", { name: /collapse/i })
    fireEvent.click(collapseButton)

    expect(codeContent.style.display).toBe("none")
    expect(container.querySelector(".markdown-code-block.is-collapsed")).not.toBeNull()

    const expandButton = screen.getByRole("button", { name: /expand/i })
    fireEvent.click(expandButton)

    expect(codeContent.style.display).not.toBe("none")
  })

  it("支持复制代码及自定义 copyContent", async () => {
    const code = "line 1\nline 2"
    const fullContent = "line 1\nline 2\nline 3\nline 4"
    render(<LxCodeBlock code={code} language="plaintext" copyContent={fullContent} copyable />)

    const copyButton = screen.getByRole("button", { name: /copy/i })
    fireEvent.click(copyButton)

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(fullContent)
  })
})

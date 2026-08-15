// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MarkdownEditorToolbar } from "@/features/markdown/components/MarkdownEditorToolbar"

describe("MarkdownEditorToolbar 页面管理与交互", () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  const defaultProps = {
    actions: [],
    isSaved: true,
    onInsertTable: () => {},
    pageMode: true,
    activePageIndex: 0,
    pageName: "Page 1",
  }

  it("当新增页面时（pages长度增加），应当自动触发页面名称编辑模式并开启聚焦", () => {
    const pages = [{ id: "1", name: "Page 1", content: "" }]
    const { rerender } = render(<MarkdownEditorToolbar {...defaultProps} pages={pages} />)

    // Initially not editing
    expect(screen.queryByLabelText("页面名称")).toBeNull()

    // Rerender with a newly added page
    const nextPages = [...pages, { id: "2", name: "Page 2", content: "" }]

    rerender(
      <MarkdownEditorToolbar
        {...defaultProps}
        pages={nextPages}
        activePageIndex={1}
        pageName="Page 2"
      />,
    )

    // After pages length increases, it should auto enter editing mode
    const input = screen.getByLabelText("页面名称") as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe("Page 2")
  })
})

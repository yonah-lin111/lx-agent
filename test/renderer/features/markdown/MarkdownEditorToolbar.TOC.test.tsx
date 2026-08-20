// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MarkdownEditorToolbar } from "@/features/markdown/components/MarkdownEditorToolbar"

describe("MarkdownEditorToolbar TOC 功能", () => {
  afterEach(() => {
    cleanup()
  })

  const defaultProps = {
    actions: [],
    isSaved: true,
    onInsertTable: () => {},
    onScrollToLine: vi.fn(),
  }

  const sampleContent = `
# Heading 1
Some normal text.

&&& addTemplate 「title: My Custom Template」
Template content here.
&&& done {id:12345678901234567890123456789012}

## Heading 2
  `.trim()

  it("正确解析并渲染标题和模板块大纲", async () => {
    render(<MarkdownEditorToolbar {...defaultProps} content={sampleContent} activeLine={1} />)

    // Trigger hover on the TOC button to open the tooltip
    const tocBtn = screen.getAllByLabelText("Table of Contents")[0]
    fireEvent.mouseEnter(tocBtn)

    // Verify template block catalog title is present
    const templateItem = await screen.findByText("My Custom Template")
    expect(templateItem).not.toBeNull()

    // Switch to headings catalog
    const headingTabBtn = screen.getByText("Headings")
    fireEvent.click(headingTabBtn)

    // Verify headings are present
    const heading1 = await screen.findByText("Heading 1")
    expect(heading1).not.toBeNull()
    expect(screen.getByText("Heading 2")).not.toBeNull()
  })

  it("点击目录项时能触发滚动回调", async () => {
    const onScrollToLine = vi.fn()
    render(
      <MarkdownEditorToolbar
        {...defaultProps}
        content={sampleContent}
        activeLine={1}
        onScrollToLine={onScrollToLine}
      />,
    )

    const tocBtn = screen.getAllByLabelText("Table of Contents")[0]
    fireEvent.mouseEnter(tocBtn)

    // Click on a template item
    const templateItem = await screen.findByText("My Custom Template")
    fireEvent.click(templateItem)

    // Verify onScrollToLine is called with correct line number
    // Line 4 is where "&&& addTemplate" starts (1-based)
    expect(onScrollToLine).toHaveBeenCalledWith(4)
  })

  it("支持关键字搜索过滤", async () => {
    render(<MarkdownEditorToolbar {...defaultProps} content={sampleContent} activeLine={1} />)

    const tocBtn = screen.getAllByLabelText("Table of Contents")[0]
    fireEvent.mouseEnter(tocBtn)

    // Initially "My Custom Template" is visible
    const templateItem = await screen.findByText("My Custom Template")
    expect(templateItem).not.toBeNull()

    // Search for non-existent keyword
    const searchInput = screen.getByPlaceholderText("Search templates...")
    fireEvent.change(searchInput, { target: { value: "NotExist" } })

    // Verify "My Custom Template" is filtered out
    expect(screen.queryByText("My Custom Template")).toBeNull()
    expect(screen.getByText("None")).not.toBeNull()
  })
})

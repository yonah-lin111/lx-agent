// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MarkdownVariableEntry } from "@/features/markdown/commands/markdownVariableCommands"
import { MarkdownVariableCommandMenu } from "@/features/markdown/components/MarkdownVariableCommandMenu"

const mockVariables: MarkdownVariableEntry[] = [
  {
    name: "single_var",
    value: "single line content",
  },
  {
    name: "multi_var",
    value: "line 1\nline 2\nline 3",
  },
]

describe("MarkdownVariableCommandMenu", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("高亮激活单行变量时，同样展开详细内容框", () => {
    const { container } = render(
      <MarkdownVariableCommandMenu
        activeIndex={0}
        position={{ top: 10, left: 10 }}
        triggerChar="¥"
        variables={mockVariables}
        visible={true}
      />,
    )

    // 单行项处于激活状态，应当展开其完整内容卡片（带有 whitespace-pre-wrap）
    const detailBox = container.querySelector(".whitespace-pre-wrap")
    expect(detailBox).not.toBeNull()
    expect(detailBox?.textContent).toBe("single line content")
  })

  it("切换高亮到多行变量时，展开多行详细内容框", () => {
    const { container } = render(
      <MarkdownVariableCommandMenu
        activeIndex={1}
        position={{ top: 10, left: 10 }}
        triggerChar="¥"
        variables={mockVariables}
        visible={true}
      />,
    )

    // 多行项处于激活状态，应当展开其完整内容卡片（带有 whitespace-pre-wrap）
    const detailBox = container.querySelector(".whitespace-pre-wrap")
    expect(detailBox).not.toBeNull()
    expect(detailBox?.textContent).toBe("line 1\nline 2\nline 3")
  })

  it("点击变量项时触发 onSelect 回调", () => {
    const onSelect = vi.fn()
    render(
      <MarkdownVariableCommandMenu
        activeIndex={0}
        position={{ top: 10, left: 10 }}
        triggerChar="¥"
        variables={mockVariables}
        visible={true}
        onSelect={onSelect}
      />,
    )

    const firstOption = screen.getByRole("option", { name: /single_var/ })
    fireEvent.mouseDown(firstOption)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(mockVariables[0])
  })
})

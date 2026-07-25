import { describe, expect, it } from "vitest"
import {
  createMarkdownBlockInsertion,
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  isInsideMarkdownCodeFence,
} from "@/components/ui/LxMarkdownEditor/markdownBlockCommands"

describe("Markdown 块命令", () => {
  it("在行首标记末尾识别相应块命令", () => {
    expect(getMarkdownBlockTrigger("## ", 10, 13)).toMatchObject({
      kind: "heading",
      from: 10,
      to: 13,
    })
    expect(getMarkdownBlockTrigger("-", 0, 1)).toMatchObject({ kind: "unorderedList" })
    expect(getMarkdownBlockTrigger("|", 0, 1)).toMatchObject({ kind: "table" })
  })

  it("不在行首标记末尾时不显示命令", () => {
    expect(getMarkdownBlockTrigger("Text #", 0, 6)).toBeNull()
    expect(getMarkdownBlockTrigger("# heading", 0, 9)).toBeNull()
  })

  it("识别代码围栏的闭合位置", () => {
    expect(isInsideMarkdownCodeFence("```php\necho 'hello';\n")).toBe(true)
    expect(isInsideMarkdownCodeFence("```php\necho 'hello';\n```\n")).toBe(false)
  })

  it("为不同标记提供匹配命令和可编辑模板", () => {
    expect(getMarkdownBlockCommands("unorderedList").map((command) => command.id)).toEqual([
      "unorderedList",
      "taskList",
    ])
    expect(createMarkdownBlockInsertion("heading2")).toEqual({
      text: "## Heading",
      selectionStart: 3,
      selectionEnd: 10,
    })
    expect(createMarkdownBlockInsertion("orderedList")).toEqual({
      text: "1. item",
      selectionStart: 3,
      selectionEnd: 7,
    })
    expect(createMarkdownBlockInsertion("codeBlock")).toEqual({
      text: "```language\n\n```",
      selectionStart: 3,
      selectionEnd: 11,
    })
  })
})

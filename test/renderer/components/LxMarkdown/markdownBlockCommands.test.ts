import { describe, expect, it } from "vitest"
import {
  createMarkdownBlockInsertion,
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  isInsideMarkdownCodeFence,
  isInsideMarkdownTemplateBlock,
  toggleMarkdownTemplateDone,
} from "@/components/ui/LxMarkdown/commands/markdownBlockCommands"

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

  it("识别带完成标记的模板块结束行并关闭块", () => {
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate\n")).toBe(true)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate done\n")).toBe(true)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate\n内容\n&&&\n")).toBe(false)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate done\n内容\n&&&\n")).toBe(false)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate\n内容\n&&& done\n")).toBe(false)
  })

  it("切换模板块结束行的 done 标记", () => {
    expect(toggleMarkdownTemplateDone("&&&", true)).toBe("&&& done")
    expect(toggleMarkdownTemplateDone("&&& done", false)).toBe("&&&")
    expect(toggleMarkdownTemplateDone("&&& done", true)).toBe("&&& done")
    expect(toggleMarkdownTemplateDone("普通文本", true)).toBeNull()
    expect(toggleMarkdownTemplateDone("&&& addTemplate", true)).toBeNull()
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
      text: "```language\n```",
      selectionStart: 3,
      selectionEnd: 11,
    })
  })
})

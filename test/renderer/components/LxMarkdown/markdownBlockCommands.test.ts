import { describe, expect, it } from "vitest"
import {
  createMarkdownBlockInsertion,
  cycleMarkdownTemplateStatus,
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  getMarkdownTemplateBlockContent,
  getMarkdownTemplateStatus,
  getMarkdownTemplateStatuses,
  isInsideMarkdownCodeFence,
  isInsideMarkdownTemplateBlock,
  toggleMarkdownTemplateCommentLines,
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

  it("识别带状态标记的模板块结束行并关闭块", () => {
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate\n")).toBe(true)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate 「title: 标题」\n")).toBe(true)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate done\n")).toBe(false)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate in_progress\n")).toBe(false)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate\n内容\n&&&\n")).toBe(false)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate\n内容\n&&& done\n")).toBe(false)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate\n内容\n&&& in_progress\n")).toBe(false)
  })

  it("解析模板块结束行的源码状态", () => {
    expect(getMarkdownTemplateStatus("&&&")).toBe("todo")
    expect(getMarkdownTemplateStatus("&&& done")).toBe("done")
    expect(getMarkdownTemplateStatus("&&& in_progress")).toBe("in_progress")
    expect(getMarkdownTemplateStatus("普通文本")).toBeNull()
    expect(getMarkdownTemplateStatus("&&& addTemplate")).toBeNull()
  })

  it("循环切换模板块结束行的状态", () => {
    expect(cycleMarkdownTemplateStatus("&&&")).toBe("&&& in_progress")
    expect(cycleMarkdownTemplateStatus("&&& in_progress")).toBe("&&& done")
    expect(cycleMarkdownTemplateStatus("&&& done")).toBe("&&&")
    expect(cycleMarkdownTemplateStatus("普通文本")).toBeNull()
    expect(cycleMarkdownTemplateStatus("&&& addTemplate")).toBeNull()
  })

  it("扫描内容中全部模板块的状态，未闭合模板块不计入", () => {
    expect(getMarkdownTemplateStatuses("&&& addTemplate\n内容\n&&&")).toEqual(["todo"])
    expect(getMarkdownTemplateStatuses("&&& addTemplate\n内容\n&&& in_progress")).toEqual([
      "in_progress",
    ])
    expect(
      getMarkdownTemplateStatuses(
        "&&& addTemplate\n内容\n&&& in_progress\n\n&&& bugTemplate\n内容\n&&& done",
      ),
    ).toEqual(["in_progress", "done"])
    expect(getMarkdownTemplateStatuses("&&& addTemplate\n未闭合")).toEqual([])
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

  it("提取光标所在模板块的正文", () => {
    const doc = [
      "前文",
      "&&& addTemplate",
      "- 参考: @src/LxMarkdownEditor.tsx",
      "&&&",
      "中间文本",
      "&&& bugTemplate",
      "- 位置: @[refer-file](/abs/a.ts)",
      "&&&",
      "后文",
    ].join("\n")

    const firstBody = "- 参考: @src/LxMarkdownEditor.tsx\n"
    const firstBodyStart = doc.indexOf(firstBody)
    expect(getMarkdownTemplateBlockContent(doc, firstBodyStart + 1)).toBe(firstBody)

    const middleStart = doc.indexOf("中间文本")
    expect(getMarkdownTemplateBlockContent(doc, middleStart + 1)).toBeNull()

    const secondBody = "- 位置: @[refer-file](/abs/a.ts)\n"
    const secondBodyStart = doc.indexOf(secondBody)
    expect(getMarkdownTemplateBlockContent(doc, secondBodyStart + 1)).toBe(secondBody)
  })

  it("未闭合模板块正文延伸到文档末尾", () => {
    const doc = "&&& addTemplate\n- 位置: lxmded"
    expect(getMarkdownTemplateBlockContent(doc, doc.length)).toBe("- 位置: lxmded")
  })

  it("为每行添加模板块注释，空行保持原样", () => {
    const doc = "- 位置: a.ts\n- 描述: 描述\n\n- 要求:"
    expect(toggleMarkdownTemplateCommentLines(doc)).toBe(
      "// - 位置: a.ts\n// - 描述: 描述\n\n// - 要求:",
    )
  })

  it("解除已注释行的注释并保留缩进", () => {
    const doc = "// - 位置: a.ts\n  // 备注\n//   - 子项"
    expect(toggleMarkdownTemplateCommentLines(doc)).toBe("- 位置: a.ts\n  备注\n  - 子项")
  })

  it("再次切换可在注释与解除注释间往返", () => {
    const doc = "// - 位置: a.ts\n- 描述: 描述"
    const commented = toggleMarkdownTemplateCommentLines(doc)
    expect(commented).toBe("// // - 位置: a.ts\n// - 描述: 描述")
    expect(toggleMarkdownTemplateCommentLines(commented)).toBe(doc)
  })

  it("注释保留原有缩进，解除后还原", () => {
    const doc = "  - 你是谁"
    const commented = toggleMarkdownTemplateCommentLines(doc)
    expect(commented).toBe("  // - 你是谁")
    expect(toggleMarkdownTemplateCommentLines(commented)).toBe(doc)
  })
})

import { describe, expect, it } from "vitest"
import {
  createMarkdownBlockInsertion,
  createMarkdownTemplateId,
  cycleMarkdownTemplateStatus,
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  getMarkdownTemplateBlockContent,
  getMarkdownTemplateBlockStartLine,
  getMarkdownTemplateIdRanges,
  getMarkdownTemplateStatus,
  getMarkdownTemplateStatuses,
  getMarkdownTemplateWorktree,
  getMarkdownTemplateWtRanges,
  isInsideMarkdownCodeFence,
  isInsideMarkdownLogBlock,
  isInsideMarkdownTemplateBlock,
  setMarkdownTemplateWorktree,
  toggleMarkdownTemplateCommentLines,
} from "@/features/markdown/commands/markdownBlockCommands"

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
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate --start 「title: 标题」\n")).toBe(true)
    expect(isInsideMarkdownTemplateBlock("&&& done\n")).toBe(false)
    expect(isInsideMarkdownTemplateBlock("&&& in_progress\n")).toBe(false)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate\n内容\n&&&\n")).toBe(false)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate\n内容\n&&& done\n")).toBe(false)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate\n内容\n&&& in_progress\n")).toBe(false)
    expect(isInsideMarkdownTemplateBlock("&&& addTemplate --start\n内容\n&&& addTemplate --end\n")).toBe(false)
    expect(isInsideMarkdownLogBlock("+++ logTemplate --start\n- log 1\n")).toBe(true)
    expect(isInsideMarkdownLogBlock("+++ logTemplate --start\n- log 1\n+++ logTemplate --end\n")).toBe(false)
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
    expect(getMarkdownTemplateBlockStartLine(doc, doc.length)).toBe(1)
  })

  it("定位模板块开始行", () => {
    const doc = ["前文", "&&& addTemplate", "- 正文", "&&&", "后文"].join("\n")
    const bodyPos = doc.indexOf("- 正文")
    expect(getMarkdownTemplateBlockStartLine(doc, bodyPos)).toBe(2)
    expect(getMarkdownTemplateBlockStartLine(doc, 0)).toBeNull()

    const docWithFlags = ["前文", "&&& addTemplate --start 「title: 标题」", "- 正文", "&&& addTemplate --end", "后文"].join("\n")
    const bodyPos2 = docWithFlags.indexOf("- 正文")
    expect(getMarkdownTemplateBlockStartLine(docWithFlags, bodyPos2)).toBe(2)
    expect(getMarkdownTemplateBlockContent(docWithFlags, bodyPos2)).toBe("- 正文\n")
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

describe("模板块 id", () => {
  const id = "0123456789abcdef0123456789abcdef"

  it("生成 uuid 去连字符的 32 位小写十六进制 id", () => {
    expect(createMarkdownTemplateId()).toMatch(/^[0-9a-f]{32}$/)
    expect(createMarkdownTemplateId()).not.toContain("-")
  })

  it("带 id 的结束行仍能识别并关闭模板块", () => {
    expect(isInsideMarkdownTemplateBlock(`&&& addTemplate\n内容\n&&& {id:${id}}\n`)).toBe(false)
    expect(isInsideMarkdownTemplateBlock(`&&& addTemplate\n内容\n&&& done {id:${id}}\n`)).toBe(
      false,
    )
  })

  it("解析带 id 结束行的源码状态", () => {
    expect(getMarkdownTemplateStatus(`&&& {id:${id}}`)).toBe("todo")
    expect(getMarkdownTemplateStatus(`&&& done {id:${id}}`)).toBe("done")
    expect(getMarkdownTemplateStatus(`&&& in_progress {id:${id}}`)).toBe("in_progress")
  })

  it("循环切换状态时保留 id", () => {
    expect(cycleMarkdownTemplateStatus(`&&& {id:${id}}`)).toBe(`&&& in_progress {id:${id}}`)
    expect(cycleMarkdownTemplateStatus(`&&& in_progress {id:${id}}`)).toBe(`&&& done {id:${id}}`)
    expect(cycleMarkdownTemplateStatus(`&&& done {id:${id}}`)).toBe(`&&& {id:${id}}`)
    expect(cycleMarkdownTemplateStatus(`&&& done`)).toBe("&&&")
    expect(cycleMarkdownTemplateStatus(`&&& addTemplate --end {id:${id}}`)).toBe(
      `&&& addTemplate --end in_progress {id:${id}}`,
    )
    expect(cycleMarkdownTemplateStatus(`&&& addTemplate --end in_progress {id:${id}}`)).toBe(
      `&&& addTemplate --end done {id:${id}}`,
    )
    expect(cycleMarkdownTemplateStatus(`&&& addTemplate --end done {id:${id}}`)).toBe(
      `&&& addTemplate --end {id:${id}}`,
    )
  })

  it("扫描带 id 模板块的状态", () => {
    expect(getMarkdownTemplateStatuses(`&&& addTemplate\n内容\n&&& done {id:${id}}`)).toEqual([
      "done",
    ])
  })

  it("定位全部模板块 id 的源码范围，仅限结束行", () => {
    const doc = [
      "前文 {id:deadbeefdeadbeefdeadbeefdeadbeef}",
      "&&& addTemplate",
      "- 内容",
      `&&& in_progress {id:${id}}`,
      `正文 {id:${id}}`,
      "&&& bugTemplate",
      "&&& done {id:11111111111111111111111111111111}",
    ].join("\n")

    const endLineId = doc.indexOf(`{id:${id}}`)
    const todoLineId = doc.indexOf("{id:11111111111111111111111111111111}")
    expect(getMarkdownTemplateIdRanges(doc)).toEqual([
      { from: endLineId, to: endLineId + `{id:${id}}`.length },
      { from: todoLineId, to: todoLineId + "{id:11111111111111111111111111111111}".length },
    ])
  })
})

describe("模板块工作区绑定 {wt:}", () => {
  const id = "0123456789abcdef0123456789abcdef"

  it("带 wt 的结束行仍能识别并关闭模板块，且状态解析正常", () => {
    expect(isInsideMarkdownTemplateBlock(`&&& addTemplate\n内容\n&&& {wt:feature-x}\n`)).toBe(false)
    expect(isInsideMarkdownTemplateBlock(`&&& addTemplate\n内容\n&&& done {wt:feature-x}\n`)).toBe(
      false,
    )
    expect(getMarkdownTemplateStatus(`&&& {wt:feature-x}`)).toBe("todo")
    expect(getMarkdownTemplateStatus(`&&& done {id:${id}} {wt:feature-x}`)).toBe("done")
  })

  it("读取结束行的工作区绑定分支", () => {
    expect(getMarkdownTemplateWorktree(`&&& {wt:feature-x}`)).toBe("feature-x")
    expect(getMarkdownTemplateWorktree(`&&& done {id:${id}} {wt:feature-x}`)).toBe("feature-x")
    expect(getMarkdownTemplateWorktree(`&&& done {id:${id}}`)).toBeNull()
    expect(getMarkdownTemplateWorktree(`&&& addTemplate`)).toBeNull()
    expect(getMarkdownTemplateWorktree("普通文本")).toBeNull()
  })

  it("写入工作区绑定，保留状态与 id", () => {
    expect(setMarkdownTemplateWorktree(`&&&`, "feature-x")).toBe("&&& {wt:feature-x}")
    expect(setMarkdownTemplateWorktree(`&&& done {id:${id}}`, "feature-x")).toBe(
      `&&& done {id:${id}} {wt:feature-x}`,
    )
    expect(setMarkdownTemplateWorktree(`&&& in_progress {wt:old}`, "feature-x")).toBe(
      "&&& in_progress {wt:feature-x}",
    )
    expect(setMarkdownTemplateWorktree(`&&& done {id:${id}} {wt:feature-x}`, null)).toBe(
      `&&& done {id:${id}}`,
    )
    expect(
      setMarkdownTemplateWorktree(`&&& addTemplate --end done {id:${id}}`, "feature-x"),
    ).toBe(`&&& addTemplate --end done {id:${id}} {wt:feature-x}`)
    expect(
      setMarkdownTemplateWorktree(`&&& addTemplate --end done {id:${id}} {wt:feature-x}`, null),
    ).toBe(`&&& addTemplate --end done {id:${id}}`)
    expect(setMarkdownTemplateWorktree("普通文本", "feature-x")).toBe("普通文本")
  })

  it("循环切换状态时保留 wt", () => {
    expect(cycleMarkdownTemplateStatus(`&&& {wt:feature-x}`)).toBe("&&& in_progress {wt:feature-x}")
    expect(cycleMarkdownTemplateStatus(`&&& in_progress {wt:feature-x}`)).toBe(
      "&&& done {wt:feature-x}",
    )
    expect(cycleMarkdownTemplateStatus(`&&& done {wt:feature-x}`)).toBe("&&& {wt:feature-x}")
  })

  it("扫描带 wt 模板块的状态", () => {
    expect(getMarkdownTemplateStatuses(`&&& addTemplate\n内容\n&&& done {wt:feature-x}`)).toEqual([
      "done",
    ])
  })

  it("定位全部模板块 wt 的源码范围，仅限结束行", () => {
    const doc = [
      "前文 {wt:feature-x}",
      "&&& addTemplate",
      "- 内容",
      "&&& done {wt:feature-x}",
      "正文 {wt:feature-x}",
      "&&& bugTemplate",
      "&&& {wt:other/branch}",
    ].join("\n")

    const firstWt = doc.indexOf("{wt:feature-x}", doc.indexOf("&&& done"))
    const secondWt = doc.indexOf("{wt:other/branch}")
    expect(getMarkdownTemplateWtRanges(doc)).toEqual([
      { from: firstWt, to: firstWt + "{wt:feature-x}".length },
      { from: secondWt, to: secondWt + "{wt:other/branch}".length },
    ])
  })

  it("识别新语法 --start 与 --end 模板块及状态", () => {
    const doc = [
      "&&& addTemplate --start 「title: 测试」",
      "- 描述: 任务内容",
      "&&& addTemplate --end in_progress {id:0123456789abcdef0123456789abcdef}",
    ].join("\n")

    expect(isInsideMarkdownTemplateBlock(doc)).toBe(false)
    expect(getMarkdownTemplateStatuses(doc)).toEqual(["in_progress"])
    expect(getMarkdownTemplateStatus("&&& addTemplate --end done")).toBe("done")
    expect(getMarkdownTemplateStatus("&&& addTemplate --end in_progress")).toBe("in_progress")
    expect(getMarkdownTemplateStatus("&&& addTemplate --end")).toBe("todo")
  })
})

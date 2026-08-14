import { describe, expect, it } from "vitest"
import { getFileMentionDeletionRange } from "@/features/markdown/extensions/markdownFileMentions"

describe("getFileMentionDeletionRange", () => {
  it("紧贴文件提及末尾时保留原生逐字删除", () => {
    const content = "读取 @src/main/index.ts"

    expect(getFileMentionDeletionRange(content, content.length)).toBeNull()
  })

  it("仅在文件提及后恰好紧邻一个空格且光标在其后时整块删除", () => {
    const content = "读取 @src/main/index.ts "

    expect(getFileMentionDeletionRange(content, content.length)).toEqual({
      start: 3,
      end: content.length,
    })
  })

  it("文件提及后有多个空格时，光标在末尾不应整块删除提及", () => {
    const content = "读取 @src/main/index.ts  "

    expect(getFileMentionDeletionRange(content, content.length)).toBeNull()
  })

  it("删除 Markdown 文件引用后紧邻的一个空格", () => {
    const content = "读取 @[refer-file](/Users/test/My File.txt) "

    expect(getFileMentionDeletionRange(content, content.length)).toEqual({
      start: 3,
      end: content.length,
    })
  })

  it("Markdown 文件引用后有多个空格时，光标在末尾不应整块删除引用", () => {
    const content = "读取 @[refer-file](/Users/test/My File.txt)  "

    expect(getFileMentionDeletionRange(content, content.length)).toBeNull()
  })

  it("不会跨行删除文件提及", () => {
    const content = "@src/main/index.ts\n下一行"

    expect(getFileMentionDeletionRange(content, 19)).toBeNull()
  })
})

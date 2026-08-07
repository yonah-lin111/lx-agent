import { describe, expect, it } from "vitest"
import { getFileMentionDeletionRange } from "@/features/markdown/extensions/markdownFileMentions"

describe("getFileMentionDeletionRange", () => {
  it("紧贴文件提及末尾时保留原生逐字删除", () => {
    const content = "读取 @src/main/index.ts"

    expect(getFileMentionDeletionRange(content, content.length)).toBeNull()
  })

  it("删除文件提及后的连续水平空白", () => {
    const content = "读取 @src/main/index.ts  "

    expect(getFileMentionDeletionRange(content, content.length)).toEqual({ start: 3, end: 23 })
  })

  it("删除 Markdown 文件引用后的连续水平空白", () => {
    const content = "读取 @[refer-file](/Users/test/My File.txt) "

    expect(getFileMentionDeletionRange(content, content.length)).toEqual({
      start: 3,
      end: content.length,
    })
  })

  it("不会跨行删除文件提及", () => {
    const content = "@src/main/index.ts\n下一行"

    expect(getFileMentionDeletionRange(content, 19)).toBeNull()
  })
})

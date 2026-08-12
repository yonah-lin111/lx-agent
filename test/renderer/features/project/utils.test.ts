import { describe, expect, it } from "vitest"
import {
  countTemplateBlocks,
  getMentionDirectoryTag,
  MAX_RECENT_ITEMS,
  parseMarkdownPages,
  pushRecentItemId,
} from "@/features/project/utils"

// 模板块结束行的合法 32 位十六进制 id。
const BLOCK_ID = "a".repeat(32)

describe("parseMarkdownPages", () => {
  it("空数据返回单个空白页", () => {
    const pages = parseMarkdownPages("")
    expect(pages).toHaveLength(1)
    expect(pages[0].content).toBe("")
  })

  it("解析合法的页面 JSON", () => {
    const pages = parseMarkdownPages(
      JSON.stringify([{ id: "page-1", name: "Page 1", content: "hello" }]),
    )
    expect(pages).toEqual([{ id: "page-1", name: "Page 1", content: "hello" }])
  })

  it("非法 JSON 时抛出异常", () => {
    expect(() => parseMarkdownPages("not-json")).toThrow()
  })

  it("非数组 JSON 时抛出异常", () => {
    expect(() => parseMarkdownPages('{"id":"x"}')).toThrow()
  })
})

describe("pushRecentItemId", () => {
  it("新 id 移到列表最前面", () => {
    expect(pushRecentItemId(["a", "b"], "c")).toEqual(["c", "a", "b"])
  })

  it("已存在 id 不重复并移到最前面", () => {
    expect(pushRecentItemId(["a", "b", "c"], "b")).toEqual(["b", "a", "c"])
  })

  it("最前面已是目标 id 时保持不变", () => {
    expect(pushRecentItemId(["b", "a"], "b")).toEqual(["b", "a"])
  })

  it("超出容量时移除末尾旧 id", () => {
    const ids = Array.from({ length: MAX_RECENT_ITEMS }, (_, index) => `item-${index}`)
    const next = pushRecentItemId(ids, "new-item")
    expect(next).toHaveLength(MAX_RECENT_ITEMS)
    expect(next[0]).toBe("new-item")
    expect(next).not.toContain("item-9")
  })
})

describe("getMentionDirectoryTag", () => {
  it("test 目录包裹时返回 test 标签", () => {
    const tag = getMentionDirectoryTag("src/test/foo.ts")
    expect(tag).toEqual({
      label: "test",
      bgClass: "border-rose-400/20 bg-rose-400/10 text-rose-300",
    })
  })

  it("temp 目录包裹时返回 temp 标签", () => {
    const tag = getMentionDirectoryTag("temp/cache.json")
    expect(tag).toEqual({
      label: "temp",
      bgClass: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    })
  })

  it("目录名大小写不敏感", () => {
    expect(getMentionDirectoryTag("src/Test/spec.ts")?.label).toBe("Test")
    expect(getMentionDirectoryTag("TEMP/x.md")?.label).toBe("TEMP")
  })

  it("文件名或末段是 test/temp 不匹配", () => {
    expect(getMentionDirectoryTag("src/test.ts")).toBeNull()
    expect(getMentionDirectoryTag("src/temp")).toBeNull()
  })

  it("无 test/temp 目录时返回 null", () => {
    expect(getMentionDirectoryTag("src/components/Button.tsx")).toBeNull()
  })
})

describe("countTemplateBlocks", () => {
  it("统计未完成、进行中与已完成的模板块数量", () => {
    const itemData = JSON.stringify([
      {
        id: "page-1",
        name: "Page 1",
        content: `&&& addTemplate\n内容\n&&& done {id:${BLOCK_ID}}\n`,
      },
      {
        id: "page-2",
        name: "Page 2",
        content: `&&& bugTemplate\n内容\n&&& in_progress {id:${BLOCK_ID}}\n&&& commonTemplate\n内容\n&&& {id:${BLOCK_ID}}\n`,
      },
    ])
    expect(countTemplateBlocks(itemData)).toEqual({ todo: 1, inProgress: 1, done: 1 })
  })

  it("无模板块时数量为零", () => {
    const itemData = JSON.stringify([{ id: "page-1", name: "Page 1", content: "# 标题" }])
    expect(countTemplateBlocks(itemData)).toEqual({ todo: 0, inProgress: 0, done: 0 })
  })

  it("非法数据按空内容处理", () => {
    expect(countTemplateBlocks("invalid")).toEqual({ todo: 0, inProgress: 0, done: 0 })
  })
})

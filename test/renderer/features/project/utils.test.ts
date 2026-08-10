import { describe, expect, it } from "vitest"
import {
  countTemplateBlocks,
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
  it("新 id 追加到列表末尾", () => {
    expect(pushRecentItemId(["a", "b"], "c")).toEqual(["a", "b", "c"])
  })

  it("已存在 id 不调整顺序且不重复", () => {
    expect(pushRecentItemId(["a", "b", "c"], "b")).toEqual(["a", "b", "c"])
  })

  it("末尾 id 保持不变", () => {
    expect(pushRecentItemId(["a", "b"], "b")).toEqual(["a", "b"])
  })

  it("超出容量时移除最前面的旧 id", () => {
    const ids = Array.from({ length: MAX_RECENT_ITEMS }, (_, index) => `item-${index}`)
    const next = pushRecentItemId(ids, "new-item")
    expect(next).toHaveLength(MAX_RECENT_ITEMS)
    expect(next[next.length - 1]).toBe("new-item")
    expect(next).not.toContain("item-0")
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

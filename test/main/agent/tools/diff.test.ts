import { describe, expect, it } from "vitest"
import { generateStructuredDiff, isBinaryContent, MAX_DIFF_CHANGED_LINES } from "@/agent/tools/diff"

// Unicode 替换符（与实现一致的二进制特征）。
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd)

describe("isBinaryContent", () => {
  it("识别 null 字节", () => {
    expect(isBinaryContent("abc\0def")).toBe(true)
  })

  it("识别替换符（无效 utf-8 解码产物）", () => {
    expect(isBinaryContent(`abc${REPLACEMENT_CHAR}def`)).toBe(true)
  })

  it("普通文本返回 false", () => {
    expect(isBinaryContent("plain text\nsecond line")).toBe(false)
  })
})

describe("generateStructuredDiff", () => {
  it("单行替换：统计、行号与词级高亮", () => {
    const diff = generateStructuredDiff(
      "line1\nconst a = 1\nline3\n",
      "line1\nconst a = 2\nline3\n",
    )
    expect(diff.truncated).toBe(false)
    expect(diff.stats).toEqual({ added: 1, removed: 1 })

    const del = diff.lines.find((line) => line.type === "del")
    const add = diff.lines.find((line) => line.type === "add")
    expect(del?.oldLine).toBe(2)
    expect(del?.text).toBe("const a = 1")
    expect(add?.newLine).toBe(2)
    expect(add?.text).toBe("const a = 2")

    // 词级高亮：变更 token 标记 changed。
    expect(del?.parts?.some((part) => part.changed && part.text === "1")).toBe(true)
    expect(add?.parts?.some((part) => part.changed && part.text === "2")).toBe(true)
  })

  it("新文件：全量新增", () => {
    const diff = generateStructuredDiff("", "a\nb\nc\n")
    expect(diff.stats).toEqual({ added: 3, removed: 0 })
    const adds = diff.lines.filter((line) => line.type === "add")
    expect(adds.map((line) => line.newLine)).toEqual([1, 2, 3])
    expect(adds.map((line) => line.text)).toEqual(["a", "b", "c"])
  })

  it("中部插入：仅新增行，无词级片段", () => {
    const diff = generateStructuredDiff("a\nb\nd\n", "a\nb\nc\nd\n")
    expect(diff.stats).toEqual({ added: 1, removed: 0 })
    const adds = diff.lines.filter((line) => line.type === "add")
    expect(adds).toHaveLength(1)
    expect(adds[0].newLine).toBe(3)
    expect(adds[0].text).toBe("c")
    expect(adds[0].parts).toBeUndefined()
  })

  it("中部变更：保留变更前后的上下文窗口", () => {
    const oldText = Array.from({ length: 100 }, (_, i) => `line${i + 1}`).join("\n")
    const newText = oldText.replace("line50", "changed50")
    const diff = generateStructuredDiff(oldText, newText)
    expect(diff.truncated).toBe(false)
    expect(diff.stats).toEqual({ added: 1, removed: 1 })

    const del = diff.lines.find((line) => line.type === "del")
    expect(del?.oldLine).toBe(50)
    expect(del?.text).toBe("line50")

    // 变更前的上下文尾部（最后 4 行）。
    const delIndex = diff.lines.findIndex((line) => line.type === "del")
    expect(delIndex).toBeGreaterThanOrEqual(4)
    const before = diff.lines.slice(delIndex - 4, delIndex)
    expect(before.every((line) => line.type === "context")).toBe(true)
    expect(before.at(-1)?.newLine).toBe(49)
  })

  it("变更行超限截断：保留头部并统计全量", () => {
    const big = Array.from({ length: MAX_DIFF_CHANGED_LINES + 60 }, (_, i) => `line${i}`).join("\n")
    const diff = generateStructuredDiff("", big)
    expect(diff.truncated).toBe(true)
    expect(diff.stats.added).toBe(MAX_DIFF_CHANGED_LINES + 60)
    expect(diff.stats.removed).toBe(0)
    expect(diff.lines.filter((line) => line.type === "add")).toHaveLength(MAX_DIFF_CHANGED_LINES)
  })
})

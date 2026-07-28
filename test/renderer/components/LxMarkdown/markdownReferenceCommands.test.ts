import { describe, expect, it } from "vitest"
import {
  createMarkdownReference,
  getMarkdownReferenceName,
  isMarkdownReferenceType,
} from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"

describe("markdownReferenceCommands", () => {
  it("创建保留绝对路径的引用语法", () => {
    expect(createMarkdownReference("file", "/Users/yonah/Desktop/example.wav")).toBe(
      "@[refer-file](/Users/yonah/Desktop/example.wav)",
    )
  })

  it("从路径提取展示名称", () => {
    expect(getMarkdownReferenceName("/Users/yonah/Desktop/1411kbps音乐/example.wav")).toBe(
      "example.wav",
    )
  })

  it("仅接受支持的引用类型", () => {
    expect(isMarkdownReferenceType("image")).toBe(true)
    expect(isMarkdownReferenceType("audio")).toBe(false)
  })
})

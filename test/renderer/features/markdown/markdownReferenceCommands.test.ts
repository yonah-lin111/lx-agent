import { describe, expect, it } from "vitest"
import {
  createMarkdownReference,
  getMarkdownReferenceName,
  getMarkdownReferenceProjectPaths,
  isMarkdownReferenceType,
} from "@/features/markdown/commands/markdownReferenceCommands"

describe("markdownReferenceCommands", () => {
  it("创建保留绝对路径的引用语法", () => {
    expect(createMarkdownReference("file", "/Users/yonah/Desktop/example.wav")).toBe(
      "@[refer-file](/Users/yonah/Desktop/example.wav)",
    )
    expect(createMarkdownReference("common", "/Users/yonah/Desktop/example.txt")).toBe(
      "@[refer-common](/Users/yonah/Desktop/example.txt)",
    )
  })

  it("从路径提取展示名称", () => {
    expect(getMarkdownReferenceName("/Users/yonah/Desktop/1411kbps音乐/example.wav")).toBe(
      "example.wav",
    )
  })

  it("仅接受支持的引用类型", () => {
    expect(isMarkdownReferenceType("image")).toBe(true)
    expect(isMarkdownReferenceType("common")).toBe(true)
    expect(isMarkdownReferenceType("audio")).toBe(false)
  })

  it("提取并去重引用项目路径", () => {
    expect(
      getMarkdownReferenceProjectPaths(
        "@[refer-project](/Users/yonah/.lx/db)\n@[refer-project](/Users/yonah/.lx/db)",
      ),
    ).toEqual(["/Users/yonah/.lx/db"])
  })

  it("提取引用项目的目录名", () => {
    expect(getMarkdownReferenceName("/Users/yonah/projects/agent/memory-curator-agent")).toBe(
      "memory-curator-agent",
    )
  })
})

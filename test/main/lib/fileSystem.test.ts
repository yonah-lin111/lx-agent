import { describe, expect, it } from "vitest"
import { getProjectFileMatchScore } from "@/lib/fileSystem"

describe("getProjectFileMatchScore", () => {
  it("支持引用项目目录名的子序列模糊匹配", () => {
    expect(getProjectFileMatchScore("memory-curator-agent", "mca")).toBeGreaterThan(0)
  })

  it("支持跨引用项目目录名和文件名的子序列模糊匹配", () => {
    expect(
      getProjectFileMatchScore(
        "memory-curator-agent/src/main/ipc/promptHistoryHandlers.ts",
        "memoryhis",
      ),
    ).toBeGreaterThan(0)
  })
})

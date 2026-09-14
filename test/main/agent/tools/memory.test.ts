import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createMemoryTool } from "@/agent/tools/memory"

// 每个用例独立临时目录，用后清理。
const tmpDirs: string[] = []
const makeTmp = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "lx-memory-"))
  tmpDirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

// 提取工具结果首段文本。
const toolText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((block) => block.type === "text")?.text ?? ""

describe("memory view 路径解析", () => {
  it("相对路径越出 memory root 时不再拒绝（读类工具不设边界）", async () => {
    const cwd = await makeTmp()
    const escapedPath = join(cwd, ".lx", "escaped.md")
    await mkdir(join(cwd, ".lx"), { recursive: true })
    await writeFile(escapedPath, "escaped memory content", "utf-8")

    const tool = createMemoryTool(cwd)
    const result = await tool.execute("call_escape", { action: "view", path: "../escaped.md" })
    const text = toolText(result)
    expect(text).toContain("escaped memory content")
    expect(text).not.toContain("Access denied")
  })

  it("绝对路径指向 memory root 之外时不再拒绝", async () => {
    const cwd = await makeTmp()
    const outsidePath = join(cwd, "..", `outside-memory-${Date.now()}.md`)
    await writeFile(outsidePath, "absolute outside content", "utf-8")
    try {
      const tool = createMemoryTool(cwd)
      const result = await tool.execute("call_absolute", { action: "view", path: outsidePath })
      const text = toolText(result)
      expect(text).toContain("absolute outside content")
      expect(text).not.toContain("Access denied")
    } finally {
      await rm(outsidePath, { force: true })
    }
  })
})

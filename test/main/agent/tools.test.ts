import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentDiff } from "@shared/contracts/agent"
import { afterEach, describe, expect, it } from "vitest"
import { createBashTool } from "@/agent/tools/bash"
import { createEditTool } from "@/agent/tools/edit"
import { createFindTool } from "@/agent/tools/find"
import { createGrepTool } from "@/agent/tools/grep"
import { createLsTool } from "@/agent/tools/ls"
import { createReadTool } from "@/agent/tools/read"
import { createWriteTool } from "@/agent/tools/write"

// 每个用例独立临时目录，用后清理。
const tmpDirs: string[] = []
const makeTmp = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "lx-tools-"))
  tmpDirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

// 提取工具结果首段文本。
const toolText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((block) => block.type === "text")?.text ?? ""

// 从工具结果 details 提取结构化 diff。
const toolDiff = (result: { details?: unknown }): AgentDiff | undefined =>
  (result.details as { diff?: AgentDiff } | undefined)?.diff

// 查找 diff 行中的删除/新增行文本。
const changedLineTexts = (diff: AgentDiff, type: "del" | "add"): string[] =>
  diff.lines.filter((line) => line.type === type).map((line) => line.text)

describe("read / write / edit", () => {
  it("write + read 往返", async () => {
    const cwd = await makeTmp()
    const write = createWriteTool(cwd)
    const w = await write.execute("t1", { path: "new.txt", content: "line1\nline2\n" })
    expect(toolText(w)).toMatch(/Wrote|已写入/)

    const read = createReadTool(cwd)
    const r = await read.execute("t1", { path: "new.txt" })
    const text = toolText(r)
    expect(text).toContain("<type>file</type>")
    expect(text).toContain("1: line1")
    expect(text).toContain("2: line2")
    expect(text).toContain("(End of file - total 3 lines)")
  })

  it("write 新文件产出全量新增 diff", async () => {
    const cwd = await makeTmp()
    const write = createWriteTool(cwd)
    const w = await write.execute("t1", { path: "new.txt", content: "x\ny\n" })
    expect(toolText(w)).toMatch(/Wrote|已写入/)
    const diff = toolDiff(w)
    expect(diff?.stats).toEqual({ added: 2, removed: 0 })
    expect(changedLineTexts(diff!, "add")).toEqual(["x", "y"])
  })

  it("write 覆盖旧文件产出 diff", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "f.txt"), "a\nb\nc\n")
    const write = createWriteTool(cwd)
    const w = await write.execute("t1", { path: "f.txt", content: "a\nB!\nc\n" })
    expect(toolText(w)).toMatch(/Wrote|已写入/)
    const diff = toolDiff(w)
    expect(diff?.stats).toEqual({ added: 1, removed: 1 })
    expect(changedLineTexts(diff!, "del")).toEqual(["b"])
    expect(changedLineTexts(diff!, "add")).toEqual(["B!"])
  })

  it("read offset/limit 分页与行号", async () => {
    const cwd = await makeTmp()
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
    await writeFile(join(cwd, "big.txt"), lines.join("\n"))
    const read = createReadTool(cwd)
    const r = await read.execute("t1", { path: "big.txt", offset: 3, limit: 2 })
    const text = toolText(r)
    expect(text).toContain("3: line3")
    expect(text).toContain("4: line4")
    expect(text).not.toContain("1: line1")
    expect(text).toMatch(/Use offset=5 to continue/)
  })

  it("read 目录输出 entries 格式", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "file.txt"), "content")
    await mkdir(join(cwd, "subfolder"), { recursive: true })
    const read = createReadTool(cwd)
    const r = await read.execute("t1", { path: "." })
    const text = toolText(r)
    expect(text).toContain("<type>directory</type>")
    expect(text).toContain("<entries>")
    expect(text).toContain("file.txt")
    expect(text).toContain("subfolder/")
  })

  it("read 单行超长截断", async () => {
    const cwd = await makeTmp()
    const longLine = "a".repeat(2500)
    await writeFile(join(cwd, "long.txt"), longLine)
    const read = createReadTool(cwd)
    const r = await read.execute("t1", { path: "long.txt" })
    const text = toolText(r)
    expect(text).toContain("... (line truncated to 2000 chars)")
  })

  it("read 允许越界路径（操作其他目录内容）", async () => {
    const cwd = await makeTmp()
    const outsidePath = join(cwd, "../outside.txt")
    await writeFile(outsidePath, "outside content", "utf-8")
    try {
      const read = createReadTool(cwd)
      const r = await read.execute("t1", { path: "../outside.txt" })
      expect(toolText(r)).toContain("1: outside content")
    } finally {
      await rm(outsidePath, { force: true })
    }
  })

  it("edit 替换并产出结构化 diff", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "f.txt"), "a\nb\nc\n")
    const edit = createEditTool(cwd)
    const e = await edit.execute("t1", { path: "f.txt", edits: [{ oldText: "b", newText: "B!" }] })
    expect(toolText(e)).toMatch(/Applied|已替换/)

    const diff = toolDiff(e)
    expect(diff?.stats).toEqual({ added: 1, removed: 1 })
    expect(changedLineTexts(diff!, "del")).toEqual(["b"])
    expect(changedLineTexts(diff!, "add")).toEqual(["B!"])
    expect(diff?.lines.find((line) => line.type === "del")?.oldLine).toBe(2)
    expect(await readFile(join(cwd, "f.txt"), "utf-8")).toBe("a\nB!\nc\n")
  })

  it("edit 拒绝非唯一 oldText", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "f.txt"), "x\nx\n")
    const edit = createEditTool(cwd)
    const e = await edit.execute("t1", { path: "f.txt", edits: [{ oldText: "x", newText: "y" }] })
    expect(toolText(e)).toMatch(/unique|不唯一/)
  })
})

describe("ls / grep / find", () => {
  it("ls 列出目录且目录带 / 后缀", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "a.ts"), "")
    await mkdir(join(cwd, "sub"), { recursive: true })
    await writeFile(join(cwd, "sub", "b.ts"), "")
    const ls = createLsTool(cwd)
    const r = await ls.execute("t1", {})
    expect(toolText(r)).toContain("a.ts")
    expect(toolText(r)).toContain("sub/")
  })

  it("grep 命中行含路径，非命中文件不出现", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "a.ts"), "const x = 1\n// TODO fix\n")
    await writeFile(join(cwd, "b.ts"), "console.log('no')\n")
    const grep = createGrepTool(cwd)
    const r = await grep.execute("t1", { pattern: "TODO" })
    expect(toolText(r)).toContain("a.ts")
    expect(toolText(r)).toContain("TODO")
    expect(toolText(r)).not.toContain("b.ts")
  })

  it("grep ignoreCase + literal", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "a.txt"), "Hello\nworld\n")
    const grep = createGrepTool(cwd)
    const ci = await grep.execute("t1", { pattern: "hello", ignoreCase: true })
    expect(toolText(ci)).toContain("Hello")
    const lit = await grep.execute("t1", { pattern: "w.d", literal: true })
    expect(toolText(lit)).toMatch(/No matches found|未找到匹配/)
  })

  it("find 按 glob 匹配", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "spec.ts"), "")
    await writeFile(join(cwd, "app.ts"), "")
    await mkdir(join(cwd, "src"), { recursive: true })
    await writeFile(join(cwd, "src", "inner.spec.ts"), "")
    const find = createFindTool(cwd)
    const r = await find.execute("t1", { pattern: "**/*.spec.ts" })
    const text = toolText(r)
    expect(text).toContain("spec.ts")
    expect(text).toContain("src/inner.spec.ts")
    expect(text).not.toContain("app.ts")
  })
})

describe("bash", () => {
  it("在 cwd 执行命令", async () => {
    const cwd = await makeTmp()
    await writeFile(join(cwd, "greeting.txt"), "hi")
    const bash = createBashTool(cwd)
    const r = await bash.execute("t1", { command: "cat greeting.txt" })
    expect(toolText(r)).toContain("hi")
  })

  it("命令失败返回退出码", async () => {
    const cwd = await makeTmp()
    const bash = createBashTool(cwd)
    const r = await bash.execute("t1", { command: "exit 3" })
    expect(toolText(r)).toMatch(/Command exited with code 3|退出码 3/)
  })
})

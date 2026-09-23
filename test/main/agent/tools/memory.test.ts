import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { parseMemoryXml } from "@/agent/memories/memoryManager"
import { createMemoryTool } from "@/agent/tools/memory"

// 每个用例独立临时目录，用后清理。
const tmpDirs: string[] = []
const makeTmp = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "lx-memory-tool-"))
  tmpDirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

// 提取工具结果首段文本。
const toolText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((block) => block.type === "text")?.text ?? ""

const readEntries = async (filePath: string) =>
  parseMemoryXml(await readFile(filePath, "utf-8")) ?? null

describe("memory 工具双作用域读写", () => {
  it("save 按 type 缺省归属：user 习惯写用户级，workflow 写项目级", async () => {
    const cwd = await makeTmp()
    const userRoot = join(cwd, "user-memory")
    const tool = createMemoryTool(cwd, { userRoot })

    await tool.execute("save_user", {
      action: "save",
      type: "user",
      name: "回复语言",
      content: "用简体中文回复",
    })
    await tool.execute("save_workflow", {
      action: "save",
      type: "workflow",
      name: "本仓库发布",
      content: "pnpm build → tag → push",
    })

    expect(await readEntries(join(userRoot, "memory.xml"))).toEqual([
      { type: "user", name: "回复语言", content: "用简体中文回复" },
    ])
    expect(await readEntries(join(cwd, ".lx", "memory", "memory.xml"))).toEqual([
      { type: "workflow", name: "本仓库发布", content: "pnpm build → tag → push" },
    ])
  })

  it("save 同名 upsert，scope 可显式覆盖", async () => {
    const cwd = await makeTmp()
    const userRoot = join(cwd, "user-memory")
    const tool = createMemoryTool(cwd, { userRoot })

    await tool.execute("save_v1", {
      action: "save",
      type: "user",
      name: "风格",
      content: "v1",
    })
    await tool.execute("save_v2", {
      action: "save",
      type: "workflow",
      name: "风格",
      content: "v2",
      scope: "user",
    })

    expect(await readEntries(join(userRoot, "memory.xml"))).toEqual([
      { type: "workflow", name: "风格", content: "v2" },
    ])
  })

  it("view 缺省展示双作用域并在缺失时初始化空存储", async () => {
    const cwd = await makeTmp()
    const userRoot = join(cwd, "user-memory")
    const tool = createMemoryTool(cwd, { userRoot })

    await tool.execute("save_1", { action: "save", type: "user", name: "习惯A", content: "内容A" })
    await tool.execute("save_2", {
      action: "save",
      type: "workflow",
      name: "流程B",
      content: "内容B",
    })

    const result = await tool.execute("view_all", { action: "view" })
    const text = toolText(result)
    expect(text).toContain("user scope")
    expect(text).toContain("project scope")
    expect(text).toContain("习惯A")
    expect(text).toContain("流程B")

    const freshCwd = await makeTmp()
    const freshUserRoot = join(freshCwd, "user-memory")
    const freshTool = createMemoryTool(freshCwd, { userRoot: freshUserRoot })
    const emptyResult = await freshTool.execute("view_empty", { action: "view", scope: "project" })
    expect(toolText(emptyResult)).toContain("<memories>")
    expect(existsSync(join(freshCwd, ".lx", "memory", "memory.xml"))).toBe(true)
  })

  it("search 命中 name/content，空 query 返回明确错误", async () => {
    const cwd = await makeTmp()
    const userRoot = join(cwd, "user-memory")
    const tool = createMemoryTool(cwd, { userRoot })

    await tool.execute("save_1", {
      action: "save",
      type: "workflow",
      name: "本仓库测试",
      content: "测试命令：pnpm vitest run <file>",
    })

    const byContent = await tool.execute("search_1", { action: "search", query: "vitest" })
    expect(toolText(byContent)).toContain("本仓库测试")
    const byName = await tool.execute("search_2", { action: "search", query: "本仓库" })
    expect(toolText(byName)).toContain("本仓库测试")

    const empty = await tool.execute("search_3", { action: "search" })
    expect(toolText(empty)).toContain("Empty search query provided.")
  })

  it("delete 缺省删除两侧同名记忆", async () => {
    const cwd = await makeTmp()
    const userRoot = join(cwd, "user-memory")
    const tool = createMemoryTool(cwd, { userRoot })

    await tool.execute("save_1", { action: "save", type: "user", name: "偏好", content: "u" })
    await tool.execute("save_2", {
      action: "save",
      type: "workflow",
      name: "偏好",
      content: "p",
      scope: "project",
    })

    const result = await tool.execute("delete_1", { action: "delete", name: "偏好" })
    expect(toolText(result)).toContain("Successfully deleted memory")
    expect(await readEntries(join(userRoot, "memory.xml"))).toEqual([])
    expect(await readEntries(join(cwd, ".lx", "memory", "memory.xml"))).toEqual([])

    const notFound = await tool.execute("delete_2", { action: "delete", name: "不存在" })
    expect(toolText(notFound)).toContain('No memory named "不存在" found')
  })
})

describe("memory 工具健壮性", () => {
  it("save 遇损坏文件先备份再重建", async () => {
    const cwd = await makeTmp()
    const userRoot = join(cwd, "user-memory")
    const projectDir = join(cwd, ".lx", "memory")
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, "memory.xml"), "garbage <<< not xml", "utf-8")

    const tool = createMemoryTool(cwd, { userRoot })
    const result = await tool.execute("save_heal", {
      action: "save",
      type: "workflow",
      name: "流程",
      content: "内容",
    })

    expect(toolText(result)).toContain("backed up")
    expect(await readEntries(join(projectDir, "memory.xml"))).toEqual([
      { type: "workflow", name: "流程", content: "内容" },
    ])
    const files = await readdir(projectDir)
    const backup = files.find((file) => file.startsWith("memory.xml.corrupt-"))
    expect(backup).toBeDefined()
    expect(await readFile(join(projectDir, backup as string), "utf-8")).toBe("garbage <<< not xml")
  })

  it("save/delete 缺参返回明确错误", async () => {
    const cwd = await makeTmp()
    const userRoot = join(cwd, "user-memory")
    const tool = createMemoryTool(cwd, { userRoot })

    const saveMissing = await tool.execute("save_missing", { action: "save", type: "user" })
    expect(toolText(saveMissing)).toContain("Missing required save parameters")

    const deleteMissing = await tool.execute("delete_missing", { action: "delete" })
    expect(toolText(deleteMissing)).toContain("Missing required delete parameter")
  })
})

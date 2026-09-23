import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  ensureMemoryFile,
  ensureWritableMemoryStore,
  formatMemoryPrompt,
  loadMemoryStores,
  MAX_MEMORY_INJECT_BYTES,
  MAX_MEMORY_INJECT_LINES,
  type MemoryEntry,
  parseMemoryXml,
  readMemoryStore,
  resolveMemoryFilePath,
  resolveMemoryRoot,
  serializeMemoryEntries,
  truncateMemoryEntries,
} from "@/agent/memories/memoryManager"
import {
  createDefaultSystemPromptManager,
  PROMPT_SECTION_NAMES,
} from "@/agent/prompts/systemPromptManager"

// 每个用例独立临时目录，用后清理。
const tmpDirs: string[] = []
const makeTmp = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "lx-memory-manager-"))
  tmpDirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const makeEntry = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
  type: "user",
  name: "回复语言",
  content: "用简体中文回复",
  ...overrides,
})

describe("memoryManager 存储路径与初始化", () => {
  it("user 作用域使用注入根目录，project 作用域使用 cwd", async () => {
    const cwd = await makeTmp()
    const userRoot = join(cwd, "user-memory")

    expect(resolveMemoryRoot("user", cwd, { userRoot })).toBe(userRoot)
    expect(resolveMemoryFilePath("user", cwd, { userRoot })).toBe(join(userRoot, "memory.xml"))
    expect(resolveMemoryRoot("project", cwd)).toBe(join(cwd, ".lx", "memory"))
    expect(resolveMemoryFilePath("project", cwd)).toBe(join(cwd, ".lx", "memory", "memory.xml"))
    expect(resolveMemoryRoot("project")).toBeNull()
  })

  it("ensureMemoryFile 初始化空 XML 并清理旧格式 MEMORY.md 与 notes/", async () => {
    const cwd = await makeTmp()
    const legacyRoot = join(cwd, ".lx", "memory")
    mkdirSync(join(legacyRoot, "notes"), { recursive: true })
    writeFileSync(join(legacyRoot, "MEMORY.md"), "# Project Memory\n- old junk", "utf-8")
    writeFileSync(join(legacyRoot, "notes", "old.md"), "---\ntype: project\n---\nold note", "utf-8")

    const filePath = ensureMemoryFile("project", cwd)

    expect(filePath).toBe(join(legacyRoot, "memory.xml"))
    expect(existsSync(join(legacyRoot, "MEMORY.md"))).toBe(false)
    expect(existsSync(join(legacyRoot, "notes"))).toBe(false)
    expect(parseMemoryXml(readFileSync(filePath as string, "utf-8"))).toEqual([])
  })
})

describe("memoryManager XML 编解码", () => {
  it("serialize/parse 往返保真：属性转义与多行内容", () => {
    const entries: MemoryEntry[] = [
      { type: "user", name: 'a&b "quote" <tag>', content: "line1 & <x>\nline2" },
      { type: "workflow", name: "发布流程", content: "pnpm build → tag → push" },
    ]

    const xml = serializeMemoryEntries(entries)

    expect(parseMemoryXml(xml)).toEqual(entries)
  })

  it("非法根节点返回 null，非法条目被跳过", () => {
    expect(parseMemoryXml("not xml at all")).toBeNull()
    expect(parseMemoryXml("<memories></memories>")).toEqual([])

    const xml = [
      "<memories>",
      '  <memory type="unknown" name="bad-type">x</memory>',
      '  <memory name="no-type">x</memory>',
      '  <memory type="user">no-name</memory>',
      '  <memory type="user" name="ok">fine</memory>',
      "</memories>",
    ].join("\n")

    expect(parseMemoryXml(xml)).toEqual([{ type: "user", name: "ok", content: "fine" }])
  })

  it("readMemoryStore 对缺失与损坏文件返回 null", async () => {
    const cwd = await makeTmp()
    expect(readMemoryStore("project", cwd)).toBeNull()

    const filePath = ensureMemoryFile("project", cwd) as string
    writeFileSync(filePath, "garbage <<< not xml", "utf-8")
    expect(readMemoryStore("project", cwd)).toBeNull()

    writeFileSync(filePath, serializeMemoryEntries([makeEntry()]), "utf-8")
    expect(readMemoryStore("project", cwd)?.entries).toEqual([makeEntry()])
  })

  it("ensureWritableMemoryStore 备份损坏文件后重置为空存储", async () => {
    const cwd = await makeTmp()
    const filePath = ensureMemoryFile("project", cwd) as string
    writeFileSync(filePath, "garbage <<< not xml", "utf-8")

    const ensured = ensureWritableMemoryStore("project", cwd)

    expect(ensured?.store.entries).toEqual([])
    expect(ensured?.backupPath).toContain("memory.xml.corrupt-")
    expect(readFileSync(ensured?.backupPath as string, "utf-8")).toBe("garbage <<< not xml")
    expect(parseMemoryXml(readFileSync(filePath, "utf-8"))).toEqual([])
  })
})

describe("memoryManager 截断与提示词组装", () => {
  it("truncateMemoryEntries 按完整元素截断，超限元素整体丢弃", () => {
    const small = makeEntry({ name: "small", content: "ok" })
    const oversized = makeEntry({
      type: "workflow",
      name: "oversized",
      content: "x".repeat(MAX_MEMORY_INJECT_BYTES + 1),
    })

    expect(truncateMemoryEntries([small, oversized])).toEqual({
      entries: [small],
      truncated: true,
    })
    expect(truncateMemoryEntries([oversized])).toEqual({ entries: [], truncated: true })
    expect(truncateMemoryEntries([small])).toEqual({ entries: [small], truncated: false })
    expect(truncateMemoryEntries([])).toEqual({ entries: [], truncated: false })
  })

  it("truncateMemoryEntries 行数超限时截断且保留前缀条目", () => {
    const entries = Array.from({ length: 60 }, (_, index) =>
      makeEntry({
        name: `note_${index}`,
        content: Array.from({ length: 5 }, () => "line").join("\n"),
      }),
    )

    const result = truncateMemoryEntries(entries)

    expect(result.truncated).toBe(true)
    expect(result.entries.length).toBeLessThan(entries.length)
    expect(result.entries.length).toBeGreaterThan(0)
    const keptLines = result.entries
      .map((entry) => serializeMemoryEntries([entry]).split("\n").length)
      .reduce((sum, count) => sum + count, 0)
    expect(keptLines).toBeLessThanOrEqual(MAX_MEMORY_INJECT_LINES)
  })

  it("formatMemoryPrompt 常驻指导语并注入双作用域块，截断时留标记", () => {
    const prompt = formatMemoryPrompt([
      {
        scope: "user",
        path: "/tmp/user/memory.xml",
        entries: [makeEntry({ name: "回复语言" })],
      },
      {
        scope: "project",
        path: "/tmp/project/memory.xml",
        entries: [
          makeEntry({ type: "workflow", name: "本仓库发布", content: "pnpm build" }),
          makeEntry({
            type: "workflow",
            name: "oversized",
            content: "y".repeat(MAX_MEMORY_INJECT_BYTES),
          }),
        ],
      },
    ])

    expect(prompt).toContain("<auto_memory>")
    expect(prompt).toContain("<user_memory>")
    expect(prompt).toContain("<project_memory>")
    expect(prompt).toContain("回复语言")
    expect(prompt).toContain("<memory_guidance>")
    expect(prompt).toContain("NEVER save one-off or task-specific content")
    expect(prompt).toContain("memory truncated")

    const emptyPrompt = formatMemoryPrompt([])
    expect(emptyPrompt).not.toContain("<user_memory>")
    expect(emptyPrompt).not.toContain("<project_memory>")
    expect(emptyPrompt).toContain("<memory_guidance>")
  })

  it("loadMemoryStores 同时加载 user 与 project 作用域", async () => {
    const cwd = await makeTmp()
    const userRoot = join(cwd, "user-memory")
    mkdirSync(userRoot, { recursive: true })
    writeFileSync(
      join(userRoot, "memory.xml"),
      serializeMemoryEntries([makeEntry({ name: "习惯" })]),
      "utf-8",
    )
    const projectFile = ensureMemoryFile("project", cwd) as string
    writeFileSync(
      projectFile,
      serializeMemoryEntries([makeEntry({ type: "workflow", name: "流程" })]),
      "utf-8",
    )

    const stores = loadMemoryStores(cwd, { userRoot })

    expect(stores.map((store) => store.scope)).toEqual(["user", "project"])
    expect(stores.map((store) => store.entries[0]?.name)).toEqual(["习惯", "流程"])
  })

  it("SystemPromptManager 注入双作用域记忆且 {{...}} 原文不参与插值", async () => {
    const cwd = await makeTmp()
    const userRoot = join(cwd, "user-memory")
    mkdirSync(userRoot, { recursive: true })
    writeFileSync(
      join(userRoot, "memory.xml"),
      [
        "<memories>",
        '  <memory type="user" name="tpl">Remember {{name}} and {{#if x}} rules</memory>',
        "</memories>",
      ].join("\n"),
      "utf-8",
    )

    const manager = createDefaultSystemPromptManager({ userMemoryRoot: userRoot })
    const assembly = await manager.assemble({ cwd })

    const memory = assembly.sections.find(
      (section) => section.name === PROMPT_SECTION_NAMES.WORKSPACE_MEMORY,
    )
    expect(memory).toBeDefined()
    expect(memory?.text).toContain("<user_memory>")
    expect(memory?.text).toContain("{{name}}")
    expect(memory?.text).toContain("{{#if x}}")
    expect(memory?.text).toContain("<memory_guidance>")
  })
})

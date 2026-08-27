import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  ensureMemoryWorkspace,
  formatMemorySummaryPrompt,
  loadWorkspaceMemory,
  parseMemoryCitation,
  parseMemoryCitationEntry,
  resolveMemoryPaths,
} from "@/agent/memories/memoryManager"
import {
  createDefaultSystemPromptManager,
  PROMPT_SECTION_NAMES,
} from "@/agent/prompts/systemPromptManager"

describe("Workspace Memory Manager", () => {
  const testDir = join(__dirname, "__tmp_memory_test__")

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it("正确解析内存路径并初始化目录结构", () => {
    const paths = resolveMemoryPaths(testDir)
    expect(paths.root).toBe(join(testDir, ".lx", "memory"))
    expect(paths.memoryFile).toBe(join(testDir, ".lx", "memory", "MEMORY.md"))

    ensureMemoryWorkspace(testDir)
    expect(existsSync(paths.root)).toBe(true)
    expect(existsSync(paths.notesDir)).toBe(true)
    expect(existsSync(paths.rolloutsDir)).toBe(true)
    expect(existsSync(paths.memoryFile)).toBe(true)
  })

  it("正确读取分层工作区记忆及统计", () => {
    const paths = ensureMemoryWorkspace(testDir)
    writeFileSync(
      paths.memoryFile,
      `# Architecture\nUse feature-first pattern.\n# Rules\nAlways run tests before push.`,
      "utf-8",
    )
    writeFileSync(join(paths.notesDir, "note1.md"), "Note 1", "utf-8")
    writeFileSync(join(paths.rolloutsDir, "rollout1.md"), "Rollout 1", "utf-8")

    const memory = loadWorkspaceMemory(testDir)
    expect(memory).not.toBeNull()
    expect(memory?.sections.length).toBe(2)
    expect(memory?.sections[0].title).toBe("Architecture")
    expect(memory?.sections[0].content).toBe("Use feature-first pattern.")
    expect(memory?.notesCount).toBe(1)
    expect(memory?.rolloutsCount).toBe(1)
  })

  it("正确生成记忆提示词模版（包含 Markdown 行内注脚引导）", () => {
    const paths = ensureMemoryWorkspace(testDir)
    writeFileSync(paths.memoryFile, `Testing memory content`, "utf-8")
    const memory = loadWorkspaceMemory(testDir)
    const prompt = formatMemorySummaryPrompt(memory)

    expect(prompt).toContain("<workspace_memory>")
    expect(prompt).toContain("<memory_summary>")
    expect(prompt).toContain("Testing memory content")
    expect(prompt).toContain("<memory_guidance>")
    expect(prompt).toContain("[^mem:")
  })

  it("正确解析行内注脚与单条 citation 格式", () => {
    const entry1 = parseMemoryCitationEntry("[^mem:.lx/memory/MEMORY.md:1-10|note=[architecture rule]]")
    expect(entry1).toEqual({
      path: ".lx/memory/MEMORY.md",
      lineStart: 1,
      lineEnd: 10,
      note: "architecture rule",
    })

    const entry2 = parseMemoryCitationEntry("[^mem:.lx/memory/MEMORY.md:42]")
    expect(entry2).toEqual({
      path: ".lx/memory/MEMORY.md",
      lineStart: 42,
      lineEnd: 42,
      note: undefined,
    })
  })

  it("从回复中任意位置正确提取行内 Markdown 注脚 [^mem:...]", () => {
    const responseText = `根据规范，前端代码需采用 feature-first 结构[^mem:.lx/memory/MEMORY.md:5-15|note=[feature structure]]，并且必须通过单测校验[^mem:.lx/memory/notes/testing.md:1-20]。`

    const { citation, cleanText } = parseMemoryCitation(responseText)
    expect(cleanText).toBe(responseText) // Markdown 注脚不破坏文本流
    expect(citation).not.toBeNull()
    expect(citation?.entries.length).toBe(2)
    expect(citation?.entries[0]).toEqual({
      path: ".lx/memory/MEMORY.md",
      lineStart: 5,
      lineEnd: 15,
      note: "feature structure",
    })
    expect(citation?.entries[1]).toEqual({
      path: ".lx/memory/notes/testing.md",
      lineStart: 1,
      lineEnd: 20,
      note: undefined,
    })
  })

  it("支持对历史/兼容 XML 标签格式的解析并安全清洗", () => {
    const legacyText = `Here is the legacy response.
<oai-mem-citation>
<citation_entries>
.lx/memory/MEMORY.md:1-5|note=[legacy citation]
</citation_entries>
<rollout_ids>
thread-123
</rollout_ids>
</oai-mem-citation>`

    const { citation, cleanText } = parseMemoryCitation(legacyText)
    expect(cleanText).toBe("Here is the legacy response.")
    expect(citation?.entries[0]).toEqual({
      path: ".lx/memory/MEMORY.md",
      lineStart: 1,
      lineEnd: 5,
      note: "legacy citation",
    })
    expect(citation?.rolloutIds).toEqual(["thread-123"])
  })

  it("SystemPromptManager 成功在 Layer 5 注入 WORKSPACE_MEMORY", async () => {
    const paths = ensureMemoryWorkspace(testDir)
    writeFileSync(paths.memoryFile, "Project specific custom guidelines", "utf-8")

    const manager = createDefaultSystemPromptManager()
    const assembly = await manager.assemble({ cwd: testDir })

    const memorySection = assembly.sections.find(
      (s) => s.name === PROMPT_SECTION_NAMES.WORKSPACE_MEMORY,
    )
    expect(memorySection).toBeDefined()
    expect(memorySection?.text).toContain("Project specific custom guidelines")
    expect(assembly.rendered).toContain("Project specific custom guidelines")
  })
})

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  ensureMemoryWorkspace,
  formatMemorySummaryPrompt,
  loadWorkspaceMemory,
  MAX_MEMORY_INDEX_LINES,
  resolveMemoryPaths,
  truncateMemoryIndex,
} from "@/agent/memories/memoryManager"
import {
  createDefaultSystemPromptManager,
  PROMPT_SECTION_NAMES,
} from "@/agent/prompts/systemPromptManager"
import { createMemoryTool } from "@/agent/tools/memory"

describe("Claude Code Workspace Memory Manager & Tool", () => {
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
    expect(existsSync(paths.memoryFile)).toBe(true)
  })

  it("正确截断超过 200 行或超大体积的索引", () => {
    const lines = Array.from({ length: 250 }, (_, i) => `- note_${i}: info ${i}`)
    const content = lines.join("\n")
    const truncated = truncateMemoryIndex(content)
    const truncatedLines = truncated.split("\n")
    expect(truncatedLines.length).toBeLessThanOrEqual(MAX_MEMORY_INDEX_LINES)
  })

  it("正确生成记忆提示词模版（对齐 auto_memory 指令规范）", () => {
    const paths = ensureMemoryWorkspace(testDir)
    writeFileSync(paths.memoryFile, `Testing memory content`, "utf-8")
    const memory = loadWorkspaceMemory(testDir)
    const prompt = formatMemorySummaryPrompt(memory)

    expect(prompt).toContain("<auto_memory>")
    expect(prompt).toContain("<memory_index>")
    expect(prompt).toContain("Testing memory content")
    expect(prompt).toContain("<memory_guidance>")
    expect(prompt).not.toContain("[^mem:")
  })

  it("SystemPromptManager 成功注入 auto_memory 提示词", async () => {
    const paths = ensureMemoryWorkspace(testDir)
    writeFileSync(paths.memoryFile, "- [test.md](notes/test.md): test summary", "utf-8")

    const manager = createDefaultSystemPromptManager()
    const assembly = await manager.assemble({ cwd: testDir })

    const memorySection = assembly.sections.find(
      (s) => s.name === PROMPT_SECTION_NAMES.WORKSPACE_MEMORY,
    )
    expect(memorySection).toBeDefined()
    expect(memorySection?.text).toContain("test summary")
    expect(assembly.rendered).toContain("<auto_memory>")
  })

  it("memory 工具正确执行 save, view, search 操作", async () => {
    const tool = createMemoryTool(testDir)

    // 1. Save
    const saveResult = await tool.execute("call_1", {
      action: "save",
      topic: "coding_guidelines",
      name: "Coding Guidelines",
      description: "Strict typescript and unit tests rules",
      type: "project",
      content: "## Rules\n1. Always run vitest.\n2. No any types.",
    })
    const saveFirst = saveResult.content[0]
    if (saveFirst.type === "text") {
      expect(saveFirst.text).toContain("Successfully saved memory note")
    }

    // 2. View Index
    const viewIndexResult = await tool.execute("call_2", { action: "view" })
    const viewIndexFirst = viewIndexResult.content[0]
    if (viewIndexFirst.type === "text") {
      expect(viewIndexFirst.text).toContain("coding_guidelines.md")
      expect(viewIndexFirst.text).toContain("Strict typescript and unit tests rules")
    }

    // 3. View Note
    const viewNoteResult = await tool.execute("call_3", {
      action: "view",
      path: "notes/coding_guidelines.md",
    })
    const viewNoteFirst = viewNoteResult.content[0]
    if (viewNoteFirst.type === "text") {
      expect(viewNoteFirst.text).toContain("Always run vitest.")
      expect(viewNoteFirst.text).toContain("name: Coding Guidelines")
    }

    // 4. Search
    const searchResult = await tool.execute("call_4", {
      action: "search",
      query: "vitest",
    })
    const searchFirst = searchResult.content[0]
    if (searchFirst.type === "text") {
      expect(searchFirst.text).toContain("coding_guidelines.md")
      expect(searchFirst.text).toContain("Always run vitest.")
    }

    // 5. Delete
    const deleteResult = await tool.execute("call_5", {
      action: "delete",
      topic: "coding_guidelines",
    })
    const deleteFirst = deleteResult.content[0]
    if (deleteFirst.type === "text") {
      expect(deleteFirst.text).toContain("Successfully deleted memory topic")
    }

    // 6. Verify Delete
    const viewIndexAfter = await tool.execute("call_6", { action: "view" })
    const viewIndexAfterFirst = viewIndexAfter.content[0]
    if (viewIndexAfterFirst.type === "text") {
      expect(viewIndexAfterFirst.text).not.toContain("coding_guidelines.md")
    }
  })
})

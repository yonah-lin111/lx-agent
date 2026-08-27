import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { join } from "path"
import type {
  MemoryCitation,
  MemoryCitationEntry,
  WorkspaceMemorySummary,
} from "@shared/contracts/agent"

export interface WorkspaceMemoryPaths {
  root: string
  memoryFile: string
  notesDir: string
  rolloutsDir: string
}

export function resolveMemoryPaths(cwd: string): WorkspaceMemoryPaths {
  const root = join(cwd, ".lx", "memory")
  return {
    root,
    memoryFile: join(root, "MEMORY.md"),
    notesDir: join(root, "notes"),
    rolloutsDir: join(root, "rollout_summaries"),
  }
}

export function ensureMemoryWorkspace(cwd: string): WorkspaceMemoryPaths {
  const paths = resolveMemoryPaths(cwd)
  if (!existsSync(paths.root)) {
    mkdirSync(paths.root, { recursive: true })
  }
  if (!existsSync(paths.notesDir)) {
    mkdirSync(paths.notesDir, { recursive: true })
  }
  if (!existsSync(paths.rolloutsDir)) {
    mkdirSync(paths.rolloutsDir, { recursive: true })
  }
  if (!existsSync(paths.memoryFile)) {
    const initialContent = `# Project Memory\n\nThis file indexes critical architectural patterns, user preferences, and project guidelines for this workspace.\n`
    writeFileSync(paths.memoryFile, initialContent, "utf-8")
  }
  return paths
}

export function loadWorkspaceMemory(cwd?: string): WorkspaceMemorySummary | null {
  if (!cwd) return null
  const paths = resolveMemoryPaths(cwd)
  if (!existsSync(paths.memoryFile)) return null

  try {
    const rawContent = readFileSync(paths.memoryFile, "utf-8").trim()
    if (!rawContent) return null

    const sections: { title: string; content: string }[] = []
    const lines = rawContent.split("\n")
    let currentTitle = "General"
    let currentLines: string[] = []

    for (const line of lines) {
      if (line.startsWith("#")) {
        if (currentLines.length > 0) {
          sections.push({ title: currentTitle, content: currentLines.join("\n").trim() })
          currentLines = []
        }
        currentTitle = line.replace(/^#+\s*/, "").trim()
      } else {
        currentLines.push(line)
      }
    }
    if (currentLines.length > 0) {
      sections.push({ title: currentTitle, content: currentLines.join("\n").trim() })
    }

    let notesCount = 0
    if (existsSync(paths.notesDir)) {
      notesCount = readdirSync(paths.notesDir).filter((f) => f.endsWith(".md")).length
    }

    let rolloutsCount = 0
    if (existsSync(paths.rolloutsDir)) {
      rolloutsCount = readdirSync(paths.rolloutsDir).filter((f) => f.endsWith(".md")).length
    }

    return {
      memoryPath: paths.memoryFile,
      rawContent,
      sections,
      notesCount,
      rolloutsCount,
    }
  } catch {
    return null
  }
}

export function formatMemorySummaryPrompt(summary: WorkspaceMemorySummary | null): string {
  if (!summary || !summary.rawContent) return ""

  let prompt = `<workspace_memory>\n`
  prompt += `Workspace memories are loaded from ${summary.memoryPath}. Follow established preferences and architecture rules.\n\n`
  prompt += `<memory_summary>\n${summary.rawContent}\n</memory_summary>\n`

  if (summary.notesCount > 0 || summary.rolloutsCount > 0) {
    prompt += `\nAdditional resources: ${summary.notesCount} topic notes, ${summary.rolloutsCount} rollout summaries under .lx/memory/.\n`
  }

  prompt += `\n<memory_guidance>\n`
  prompt += `When you leverage guidelines or facts from workspace memory (such as .lx/memory/MEMORY.md or instructions), you MUST cite them using the special Markdown citation syntax: [^mem:path:lineStart-lineEnd|note=[brief description]] or [^mem:path:lineStart-lineEnd] directly attached to the relevant sentence.\n`
  prompt += `DO NOT use regular markdown links like [file](path) for memory references. ALWAYS use [^mem:...].\n`
  prompt += `Example: All components must use design tokens[^mem:.lx/memory/MEMORY.md:1-5|note=[design standard]].\n`
  prompt += `</memory_guidance>\n`
  prompt += `</workspace_memory>`

  return prompt
}

export function parseMemoryCitationEntry(line: string): MemoryCitationEntry | null {
  let trimmed = line.trim()
  if (!trimmed) return null

  // Strip [^mem: ... ] or [cite: ... ] if present
  if (trimmed.startsWith("[^mem:") && trimmed.endsWith("]")) {
    trimmed = trimmed.slice(6, -1).trim()
  } else if (trimmed.startsWith("[cite:") && trimmed.endsWith("]")) {
    trimmed = trimmed.slice(6, -1).trim()
  }

  // format: path:lineStart-lineEnd|note=[...] or path:lineStart-lineEnd|note=...
  const noteIndex = trimmed.lastIndexOf("|note=")
  let note: string | undefined
  let location = trimmed

  if (noteIndex !== -1) {
    let noteRaw = trimmed.slice(noteIndex + 6).trim()
    if (noteRaw.startsWith("[") && noteRaw.endsWith("]")) {
      noteRaw = noteRaw.slice(1, -1).trim()
    }
    note = noteRaw
    location = trimmed.slice(0, noteIndex).trim()
  }

  const colonIndex = location.lastIndexOf(":")
  if (colonIndex === -1) {
    return {
      path: location,
      lineStart: 1,
      lineEnd: 1,
      note: note || undefined,
    }
  }

  const path = location.slice(0, colonIndex).trim()
  const rangePart = location.slice(colonIndex + 1).trim()
  const dashIndex = rangePart.indexOf("-")

  if (dashIndex === -1) {
    const line = parseInt(rangePart, 10)
    if (isNaN(line)) return null
    return { path, lineStart: line, lineEnd: line, note: note || undefined }
  }

  const start = parseInt(rangePart.slice(0, dashIndex).trim(), 10)
  const end = parseInt(rangePart.slice(dashIndex + 1).trim(), 10)

  if (isNaN(start) || isNaN(end)) return null
  return { path, lineStart: start, lineEnd: end, note: note || undefined }
}

export function parseMemoryCitation(text: string): {
  citation: MemoryCitation | null
  cleanText: string
} {
  const entries: MemoryCitationEntry[] = []
  const rolloutIds: string[] = []

  // 1. 解析 inline 脚注语法: [^mem:path:lines|note=[...]] 或 [^mem:path:lines]
  // 匹配类似 \[^mem: ... \] 结构
  const inlineRegex = /\[\^mem:((?:[^\]\[]|\[[^\]]*\])+)\]/g
  let inlineMatch: RegExpExecArray | null
  while ((inlineMatch = inlineRegex.exec(text)) !== null) {
    const entry = parseMemoryCitationEntry(inlineMatch[1])
    if (entry) {
      entries.push(entry)
    }
  }

  // 2. 兼容性解析: 传统 <oai-mem-citation> 标签块
  const xmlRegex = /<oai-mem-citation>([\s\S]*?)<\/oai-mem-citation>/g
  let xmlMatch: RegExpExecArray | null
  while ((xmlMatch = xmlRegex.exec(text)) !== null) {
    const blockContent = xmlMatch[1]
    const entriesMatch = /<citation_entries>([\s\S]*?)<\/citation_entries>/.exec(blockContent)
    if (entriesMatch) {
      const lines = entriesMatch[1].split("\n")
      for (const line of lines) {
        const entry = parseMemoryCitationEntry(line)
        if (entry) entries.push(entry)
      }
    }

    const idsMatch =
      /<rollout_ids>([\s\S]*?)<\/rollout_ids>/.exec(blockContent) ||
      /<thread_ids>([\s\S]*?)<\/thread_ids>/.exec(blockContent)
    if (idsMatch) {
      const ids = idsMatch[1]
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
      rolloutIds.push(...ids)
    }
  }

  // 清洗掉 XML 块（行内脚注 [^mem:...] 保留给前端 Markdown 渲染器或原样呈现）
  const cleanText = text.replace(/<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/g, "").trim()

  if (entries.length === 0 && rolloutIds.length === 0) {
    return { citation: null, cleanText }
  }

  // 对 entries 去重
  const uniqueEntries: MemoryCitationEntry[] = []
  const seen = new Set<string>()
  for (const item of entries) {
    const key = `${item.path}:${item.lineStart}-${item.lineEnd}:${item.note ?? ""}`
    if (!seen.has(key)) {
      seen.add(key)
      uniqueEntries.push(item)
    }
  }

  return {
    citation: {
      entries: uniqueEntries,
      rolloutIds: rolloutIds.length > 0 ? Array.from(new Set(rolloutIds)) : undefined,
    },
    cleanText,
  }
}

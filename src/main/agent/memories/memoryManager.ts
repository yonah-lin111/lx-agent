import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { WorkspaceMemorySummary } from "@shared/contracts/agent"

export const MAX_MEMORY_INDEX_LINES = 200
export const MAX_MEMORY_INDEX_BYTES = 25 * 1024 // 25 KB

export interface WorkspaceMemoryPaths {
  root: string
  memoryFile: string
  notesDir: string
}

export interface TopicNoteMetadata {
  name: string
  description: string
  type: "user" | "feedback" | "project" | "reference"
}

export function resolveMemoryPaths(cwd: string): WorkspaceMemoryPaths {
  const root = join(cwd, ".lx", "memory")
  return {
    root,
    memoryFile: join(root, "MEMORY.md"),
    notesDir: join(root, "notes"),
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
  if (!existsSync(paths.memoryFile)) {
    const initialContent = `# Project Memory Index\n\n- No memory recorded yet.\n`
    writeFileSync(paths.memoryFile, initialContent, "utf-8")
  }
  return paths
}

export function truncateMemoryIndex(content: string): string {
  const lines = content.split("\n")
  const truncatedLines: string[] = []
  let totalBytes = 0

  for (let i = 0; i < lines.length && i < MAX_MEMORY_INDEX_LINES; i++) {
    const line = lines[i]
    const lineBytes = Buffer.byteLength(line, "utf-8") + (i > 0 ? 1 : 0)
    if (totalBytes + lineBytes > MAX_MEMORY_INDEX_BYTES) {
      truncatedLines.push("... (memory index truncated)")
      break
    }
    truncatedLines.push(line)
    totalBytes += lineBytes
  }

  return truncatedLines.join("\n")
}

export function loadWorkspaceMemory(cwd?: string): WorkspaceMemorySummary | null {
  if (!cwd) return null
  const paths = resolveMemoryPaths(cwd)
  if (!existsSync(paths.memoryFile)) return null

  try {
    const rawContent = readFileSync(paths.memoryFile, "utf-8").trim()
    if (!rawContent) return null

    const truncated = truncateMemoryIndex(rawContent)

    let notesCount = 0
    if (existsSync(paths.notesDir)) {
      notesCount = readdirSync(paths.notesDir).filter((f) => f.endsWith(".md")).length
    }

    return {
      memoryPath: paths.memoryFile,
      rawContent: truncated,
      sections: [],
      notesCount,
      rolloutsCount: 0,
    }
  } catch {
    return null
  }
}

export function formatMemorySummaryPrompt(summary: WorkspaceMemorySummary | null): string {
  if (!summary || !summary.rawContent) return ""

  let prompt = `<auto_memory>\n`
  prompt += `Project memories are indexed from ${summary.memoryPath}.\n`
  prompt += `The index below contains high-level summaries. You can read detailed topic notes using the \`memory\` tool (\`action: "view"\`) or search with (\`action: "search"\`).\n\n`
  prompt += `<memory_index>\n${summary.rawContent}\n</memory_index>\n`

  prompt += `\n<memory_guidance>\n`
  prompt += `1. When you learn critical facts, architectural patterns, user preferences, or debugging solutions that cannot be easily derived from code, save them using the \`memory\` tool (\`action: "save"\`).\n`
  prompt += `2. When a user asks to forget or remove outdated facts/preferences, delete them using the \`memory\` tool (\`action: "delete"\`).\n`
  prompt += `3. DO NOT embed any memory citation tags or annotations into your output text. Answer cleanly and directly.\n`
  prompt += `</memory_guidance>\n`
  prompt += `</auto_memory>`

  return prompt
}

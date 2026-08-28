import { readdir, readFile, unlink, writeFile } from "node:fs/promises"
import { basename, join, relative } from "node:path"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { ensureMemoryWorkspace, truncateMemoryIndex } from "../memories/memoryManager"
import { resolveToCwd } from "./path-utils"

const memoryInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("view").describe("View the MEMORY.md index or a specific topic note"),
    path: z
      .string()
      .optional()
      .describe(
        "Relative path to a note file under .lx/memory/ (e.g. notes/user_preferences.md). Omit to view the main MEMORY.md index.",
      ),
  }),
  z.object({
    action: z.literal("save").describe("Save or update a memory topic note and update MEMORY.md"),
    topic: z
      .string()
      .describe(
        "Topic identifier/filename without extension (e.g. 'user_preferences', 'architecture_rules')",
      ),
    name: z.string().describe("Human readable title of the memory topic"),
    description: z
      .string()
      .describe("Concise 1-line description of what this memory topic covers for the index"),
    type: z
      .enum(["user", "feedback", "project", "reference"])
      .default("project")
      .describe(
        "Category of the memory (user: preferences/role, feedback: lessons/corrections, project: context/goals, reference: external info)",
      ),
    content: z.string().describe("Detailed markdown body of the topic note"),
  }),
  z.object({
    action: z.literal("search").describe("Search across memory index and topic notes for keywords"),
    query: z.string().describe("Keywords to search in memory files"),
  }),
  z.object({
    action: z
      .literal("delete")
      .describe("Delete a memory topic note and remove its entry from MEMORY.md"),
    topic: z
      .string()
      .optional()
      .describe("Topic identifier/filename without extension (e.g. 'user_preferences')"),
    path: z
      .string()
      .optional()
      .describe(
        "Relative path to the note file under .lx/memory/ (e.g. 'notes/user_preferences.md')",
      ),
  }),
])

export const createMemoryTool = (cwd: string): AgentTool<typeof memoryInputSchema> => ({
  name: "memory",
  label: "Project memory",
  description:
    "Manage long-term project memory aligned with Claude Code conventions. Use this tool to view the memory index/notes, save new learnings or user preferences, search existing memories, or delete outdated memories.",
  inputSchema: memoryInputSchema,
  execute: async (_toolCallId, params, signal) => {
    const throwIfAborted = (): void => {
      if (signal?.aborted) throw new Error("Operation aborted")
    }

    const paths = ensureMemoryWorkspace(cwd)

    if (params.action === "view") {
      throwIfAborted()
      const targetRelPath = params.path?.trim()
      let filePath = paths.memoryFile

      if (targetRelPath) {
        const resolved = resolveToCwd(targetRelPath, paths.root)
        if (!resolved) {
          return {
            content: [
              {
                type: "text",
                text: `Access denied or invalid path outside memory root: ${targetRelPath}`,
              },
            ],
            details: { error: "Access denied" },
          }
        }
        filePath = resolved
      }

      try {
        const content = await readFile(filePath, "utf-8")
        const isIndex = filePath === paths.memoryFile
        const displayContent = isIndex ? truncateMemoryIndex(content) : content
        const relName = relative(cwd, filePath)

        return {
          content: [
            {
              type: "text",
              text: `# File: ${relName}\n\n${displayContent}`,
            },
          ],
          details: { path: relName, bytes: Buffer.byteLength(displayContent, "utf-8") },
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        return {
          content: [
            {
              type: "text",
              text: `Failed to read memory file "${params.path ?? "MEMORY.md"}": ${errorMsg}`,
            },
          ],
          details: { error: errorMsg },
        }
      }
    }

    if (params.action === "save") {
      throwIfAborted()
      const cleanTopic = params.topic
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/^[._]+/, "")

      if (!cleanTopic) {
        return {
          content: [{ type: "text", text: "Invalid topic name provided." }],
          details: { error: "Invalid topic name" },
        }
      }

      const noteFileName = `${cleanTopic}.md`
      const noteRelPath = `notes/${noteFileName}`
      const noteFilePath = join(paths.notesDir, noteFileName)

      const frontmatter = [
        "---",
        `name: ${params.name.trim()}`,
        `description: ${params.description.trim()}`,
        `type: ${params.type}`,
        "---",
        "",
      ].join("\n")

      const fullNoteContent = `${frontmatter}${params.content.trim()}\n`
      await writeFile(noteFilePath, fullNoteContent, "utf-8")
      throwIfAborted()

      // 更新或插入 MEMORY.md 中的索引行
      let memoryIndexContent = ""
      try {
        memoryIndexContent = await readFile(paths.memoryFile, "utf-8")
      } catch {
        memoryIndexContent = "# Project Memory Index\n\n"
      }

      const indexEntryLine = `- [${noteFileName}](${noteRelPath}): ${params.description.trim()}`
      const lines = memoryIndexContent.split("\n")
      let replaced = false

      const newLines = lines.map((line) => {
        if (line.includes(`(${noteRelPath})`) || line.includes(`[${noteFileName}]`)) {
          replaced = true
          return indexEntryLine
        }
        return line
      })

      if (!replaced) {
        // 如果文件纯为空或仅有占位符
        const placeholderIndex = newLines.findIndex((l) => l.includes("- No memory recorded yet."))
        if (placeholderIndex !== -1) {
          newLines.splice(placeholderIndex, 1, indexEntryLine)
        } else {
          newLines.push(indexEntryLine)
        }
      }

      const updatedIndexContent =
        newLines
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim() + "\n"
      await writeFile(paths.memoryFile, updatedIndexContent, "utf-8")
      throwIfAborted()

      return {
        content: [
          {
            type: "text",
            text: `Successfully saved memory note to .lx/memory/${noteRelPath} and updated MEMORY.md index.`,
          },
        ],
        details: {
          notePath: `.lx/memory/${noteRelPath}`,
          topic: cleanTopic,
          name: params.name,
        },
      }
    }

    if (params.action === "search") {
      throwIfAborted()
      const query = params.query.trim().toLowerCase()
      if (!query) {
        return {
          content: [{ type: "text", text: "Empty search query provided." }],
          details: { matches: [] },
        }
      }

      const results: { file: string; matchLines: string[] }[] = []

      // 搜索 MEMORY.md
      try {
        const indexContent = await readFile(paths.memoryFile, "utf-8")
        const indexLines = indexContent.split("\n")
        const matched = indexLines.filter((l) => l.toLowerCase().includes(query))
        if (matched.length > 0) {
          results.push({ file: "MEMORY.md", matchLines: matched })
        }
      } catch {
        // ignore
      }

      // 搜索 notes/
      try {
        const noteFiles = await readdir(paths.notesDir)
        for (const file of noteFiles) {
          if (!file.endsWith(".md")) continue
          const fullPath = join(paths.notesDir, file)
          const content = await readFile(fullPath, "utf-8")
          const lines = content.split("\n")
          const matched = lines.filter((l) => l.toLowerCase().includes(query))
          if (matched.length > 0) {
            results.push({ file: `notes/${file}`, matchLines: matched.slice(0, 5) })
          }
        }
      } catch {
        // ignore
      }

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No memories found matching query "${params.query}".` }],
          details: { matches: [] },
        }
      }

      let output = `Found memory matches for "${params.query}":\n\n`
      for (const res of results) {
        output += `### ${res.file}\n`
        for (const line of res.matchLines) {
          output += `- ${line.trim()}\n`
        }
        output += "\n"
      }

      return {
        content: [{ type: "text", text: output.trim() }],
        details: { matches: results },
      }
    }

    if (params.action === "delete") {
      throwIfAborted()
      let cleanTopic = params.topic
        ?.trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/^[._]+/, "")

      let noteFileName = cleanTopic ? `${cleanTopic}.md` : ""
      if (!noteFileName && params.path) {
        const rawBase = basename(params.path.trim())
        if (rawBase.endsWith(".md")) {
          noteFileName = rawBase
          cleanTopic = rawBase.slice(0, -3)
        }
      }

      if (!noteFileName) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid delete parameters: please provide either a topic name or a note path.",
            },
          ],
          details: { error: "Missing topic or path" },
        }
      }

      const noteRelPath = `notes/${noteFileName}`
      const noteFilePath = join(paths.notesDir, noteFileName)

      // 1. 删除磁盘文件
      let fileDeleted = false
      try {
        await unlink(noteFilePath)
        fileDeleted = true
      } catch {
        // file might not exist, proceed to index removal
      }

      // 2. 从 MEMORY.md 移除索引项
      let memoryIndexContent = ""
      let indexModified = false
      try {
        memoryIndexContent = await readFile(paths.memoryFile, "utf-8")
        const lines = memoryIndexContent.split("\n")
        const filteredLines = lines.filter((line) => {
          const match = line.includes(`(${noteRelPath})`) || line.includes(`[${noteFileName}]`)
          if (match) indexModified = true
          return !match
        })

        if (indexModified) {
          const updatedIndex =
            filteredLines
              .join("\n")
              .replace(/\n{3,}/g, "\n\n")
              .trim() + "\n"
          await writeFile(paths.memoryFile, updatedIndex, "utf-8")
        }
      } catch {
        // ignore
      }

      if (!fileDeleted && !indexModified) {
        return {
          content: [
            {
              type: "text",
              text: `Memory "${noteFileName}" not found in notes or MEMORY.md index.`,
            },
          ],
          details: { deleted: false },
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted memory topic "${noteFileName}" from disk and MEMORY.md index.`,
          },
        ],
        details: {
          deleted: true,
          topic: cleanTopic,
          fileDeleted,
          indexModified,
        },
      }
    }

    return {
      content: [{ type: "text", text: "Unknown memory action." }],
      details: { error: "Unknown action" },
    }
  },
})

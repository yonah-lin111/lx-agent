import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import {
  DEFAULT_MEMORY_SCOPE_FOR_TYPE,
  ensureMemoryFile,
  ensureWritableMemoryStore,
  type MemoryEntry,
  type MemoryScope,
  type MemoryStoreOptions,
  parseMemoryXml,
  readMemoryStore,
  resolveMemoryFilePath,
  serializeMemoryEntries,
} from "../memories/memoryManager"

// 扁平 object schema：OpenAI 兼容端点要求 function 参数根节点为 type: object，
// 不接受 discriminatedUnion 生成的 oneOf 根节点；动作级必填约束在 execute 中校验。
export const memoryInputSchema = z.object({
  action: z
    .enum(["view", "save", "search", "delete"])
    .describe("Action to perform on long-term agent memory"),
  scope: z
    .enum(["user", "project"])
    .optional()
    .describe(
      'Memory scope: "user" stores cross-project habits in ~/.lx/memory, "project" stores repository-specific workflows in <project>/.lx/memory. Defaults to both scopes for view/search/delete, and to the type-based scope for save.',
    ),
  type: z
    .enum(["user", "workflow"])
    .optional()
    .describe(
      'Memory category. "user": durable habits/preferences of the user. "workflow": repeatable processes (test, build, release, commit). Required for save.',
    ),
  name: z
    .string()
    .optional()
    .describe(
      "Unique, self-explanatory memory name. Upsert key for save; target for delete. Required for save and delete.",
    ),
  content: z.string().optional().describe("Markdown body of the memory. Required for save."),
  query: z
    .string()
    .optional()
    .describe("Keywords matched against memory names and contents. Required for search."),
})

const ALL_SCOPES: readonly MemoryScope[] = ["user", "project"]

const scopeLabel = (scope: MemoryScope): string =>
  scope === "user"
    ? "user scope (~/.lx/memory/memory.xml)"
    : "project scope (<project>/.lx/memory/memory.xml)"

export const createMemoryTool = (
  cwd: string,
  options?: MemoryStoreOptions,
): AgentTool<typeof memoryInputSchema> => ({
  name: "memory",
  label: "Agent memory",
  description:
    'Manage long-term agent memory. Save ONLY durable user habits/preferences (type "user") and repeatable workflows (type "workflow"); never save one-off fixes, review findings, task progress, or facts derivable from the codebase. Actions: view the stored memories, save (upsert by name), search, or delete stale ones.',
  inputSchema: memoryInputSchema,
  execute: async (_toolCallId, params, signal) => {
    const throwIfAborted = (): void => {
      if (signal?.aborted) throw new Error("Operation aborted")
    }

    if (params.action === "view") {
      throwIfAborted()
      const scopes = params.scope ? [params.scope] : [...ALL_SCOPES]
      const sections: string[] = []

      for (const scope of scopes) {
        const filePath = ensureMemoryFile(scope, cwd, options)
        if (!filePath) continue
        const raw = await readFile(filePath, "utf-8")
        const isCorrupt = parseMemoryXml(raw) === null
        sections.push(
          `## ${scopeLabel(scope)}${isCorrupt ? " [unreadable: save will back it up and reset]" : ""}\n\n${raw.trim()}`,
        )
      }

      throwIfAborted()
      return {
        content: [{ type: "text", text: sections.join("\n\n") }],
        details: { scopes },
      }
    }

    if (params.action === "save") {
      throwIfAborted()
      const type = params.type
      const name = params.name?.trim()
      const content = params.content?.trim()
      if (!type || !name || !content) {
        return {
          content: [
            {
              type: "text",
              text: "Missing required save parameters: type, name and content are required.",
            },
          ],
          details: { error: "Missing required parameters" },
        }
      }

      const scope = params.scope ?? DEFAULT_MEMORY_SCOPE_FOR_TYPE[type]
      const ensured = ensureWritableMemoryStore(scope, cwd, options)
      if (!ensured) {
        return {
          content: [{ type: "text", text: `Failed to initialize the ${scope} memory store.` }],
          details: { error: "Memory store unavailable", scope },
        }
      }

      const { store, backupPath } = ensured
      const entry: MemoryEntry = { type, name, content }
      const existingIndex = store.entries.findIndex((item) => item.name === name)
      if (existingIndex >= 0) {
        store.entries[existingIndex] = entry
      } else {
        store.entries.push(entry)
      }
      await writeFile(store.path, serializeMemoryEntries(store.entries), "utf-8")
      throwIfAborted()

      const backupNote = backupPath
        ? ` The previous store was corrupted and was backed up to ${backupPath}.`
        : ""
      return {
        content: [
          {
            type: "text",
            text: `Successfully saved memory "${name}" (${type}) to ${scopeLabel(scope)}.${backupNote}`,
          },
        ],
        details: { scope, name, type, backupPath },
      }
    }

    if (params.action === "search") {
      throwIfAborted()
      const query = (params.query ?? "").trim().toLowerCase()
      if (!query) {
        return {
          content: [{ type: "text", text: "Empty search query provided." }],
          details: { matches: [] },
        }
      }

      const scopes = params.scope ? [params.scope] : [...ALL_SCOPES]
      const matches: { scope: MemoryScope; entry: MemoryEntry; matchLines: string[] }[] = []

      for (const scope of scopes) {
        const store = readMemoryStore(scope, cwd, options)
        if (!store) continue
        for (const entry of store.entries) {
          const matchedLines = entry.content
            .split("\n")
            .filter((line) => line.toLowerCase().includes(query))
          const nameOrTypeHit =
            entry.name.toLowerCase().includes(query) || entry.type.includes(query)
          if (matchedLines.length === 0 && !nameOrTypeHit) continue
          matches.push({ scope, entry, matchLines: matchedLines.slice(0, 5) })
        }
      }

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No memories found matching query "${params.query}".`,
            },
          ],
          details: { matches: [] },
        }
      }

      let output = `Found memory matches for "${params.query}":\n\n`
      for (const match of matches) {
        output += `### [${match.scope}/${match.entry.type}] ${match.entry.name}\n`
        for (const line of match.matchLines) {
          output += `- ${line.trim()}\n`
        }
        output += "\n"
      }

      return {
        content: [{ type: "text", text: output.trim() }],
        details: { matches },
      }
    }

    if (params.action === "delete") {
      throwIfAborted()
      const name = params.name?.trim()
      if (!name) {
        return {
          content: [
            {
              type: "text",
              text: "Missing required delete parameter: name is required.",
            },
          ],
          details: { error: "Missing required parameters" },
        }
      }

      const scopes = params.scope ? [params.scope] : [...ALL_SCOPES]
      const deletedScopes: MemoryScope[] = []
      const unreadableScopes: MemoryScope[] = []

      for (const scope of scopes) {
        const store = readMemoryStore(scope, cwd, options)
        if (!store) {
          const filePath = resolveMemoryFilePath(scope, cwd, options)
          if (filePath && existsSync(filePath)) unreadableScopes.push(scope)
          continue
        }
        const remaining = store.entries.filter((entry) => entry.name !== name)
        if (remaining.length === store.entries.length) continue
        await writeFile(store.path, serializeMemoryEntries(remaining), "utf-8")
        deletedScopes.push(scope)
      }

      throwIfAborted()

      if (deletedScopes.length === 0) {
        const unreadableNote = unreadableScopes.length
          ? ` Skipped unreadable store(s): ${unreadableScopes.join(", ")}.`
          : ""
        return {
          content: [
            {
              type: "text",
              text: `No memory named "${name}" found.${unreadableNote}`,
            },
          ],
          details: { deleted: false, deletedScopes, unreadableScopes },
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted memory "${name}" from: ${deletedScopes.join(", ")}.`,
          },
        ],
        details: { deleted: true, deletedScopes, unreadableScopes },
      }
    }

    return {
      content: [{ type: "text", text: "Unknown memory action." }],
      details: { error: "Unknown action" },
    }
  },
})

import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { spillManager } from "../spill/spillManager"
import { resolveToCwd } from "./path-utils"
import type { SessionDeps } from "./read"
import { DEFAULT_MAX_BYTES, truncateHead } from "./truncate"

const DEFAULT_LIMIT = 500

const lsSchema = z.object({
  path: z.string().describe("Directory to list, defaults to project root").optional(),
  limit: z.number().describe(`Maximum entries to return (default: ${DEFAULT_LIMIT})`).optional(),
})

// 创建 ls 工具：列出 cwd 内目录条目，字母序 + 目录 `/` 后缀，含 dotfiles。
export const createLsTool = (
  cwd: string,
  sessionDeps?: SessionDeps,
): AgentTool<typeof lsSchema> => ({
  name: "ls",
  label: "List directory",
  description: `List contents of a directory in the project. Entries are sorted alphabetically, directories have a trailing "/" suffix, and hidden files are included. Output is truncated to ${DEFAULT_LIMIT} entries or ${DEFAULT_MAX_BYTES / 1024}KB.`,
  inputSchema: lsSchema,
  execute: async (toolCallId, params) => {
    const dirPath = resolveToCwd(params.path || ".", cwd)
    if (!dirPath) {
      return {
        content: [
          {
            type: "text",
            text: `Access denied to path outside project root: ${params.path ?? "."}`,
          },
        ],
        details: { refused: true },
      }
    }

    try {
      const statResult = await stat(dirPath)
      if (!statResult.isDirectory()) {
        return {
          content: [{ type: "text", text: `Not a directory: ${params.path ?? "."}` }],
          details: { error: "not_a_directory" },
        }
      }

      const entries = await readdir(dirPath)
      entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))

      const effectiveLimit = params.limit ?? DEFAULT_LIMIT
      const results: string[] = []
      let entryLimitReached = false
      for (const entry of entries) {
        if (results.length >= effectiveLimit) {
          entryLimitReached = true
          break
        }
        let suffix = ""
        try {
          const entryStat = await stat(join(dirPath, entry))
          if (entryStat.isDirectory()) suffix = "/"
        } catch {
          continue
        }
        results.push(entry + suffix)
      }

      if (results.length === 0) {
        return { content: [{ type: "text", text: "(Empty directory)" }] }
      }

      const rawOutput = results.join("\n")
      const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER })
      let output = truncation.content
      const notices: string[] = []
      if (entryLimitReached) {
        notices.push(
          `Reached limit of ${effectiveLimit} entries; use limit=${effectiveLimit * 2} to see more`,
        )
      }
      if (truncation.truncated) {
        const sessionId = sessionDeps?.getSessionId?.() ?? undefined
        const { text } = spillManager.handleTruncation(rawOutput, truncation, {
          sessionId,
          toolCallId,
          customActionHint: "Use 'ls' on specific subdirectories to explore further.",
        })
        output = text
      } else if (notices.length > 0) {
        output += `\n\n[${notices.join(". ")}]`
      }

      return {
        content: [{ type: "text", text: output }],
        details: {
          entryLimitReached: entryLimitReached ? effectiveLimit : undefined,
          truncation: truncation.truncated ? truncation : undefined,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [
          { type: "text", text: `Failed to list directory ${params.path ?? "."}: ${message}` },
        ],
        details: { error: message },
      }
    }
  },
})

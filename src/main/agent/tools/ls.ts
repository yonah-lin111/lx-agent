import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { resolveToCwd } from "./path-utils"
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate"

const DEFAULT_LIMIT = 500

const lsSchema = z.object({
  path: z.string().describe("要列出的目录，默认为项目根目录").optional(),
  limit: z.number().describe(`最多返回的条目数（默认 ${DEFAULT_LIMIT}）`).optional(),
})

// 创建 ls 工具：列出 cwd 内目录条目，字母序 + 目录 `/` 后缀，含 dotfiles。
export const createLsTool = (cwd: string): AgentTool<typeof lsSchema> => ({
  name: "ls",
  label: "列出目录",
  description: `列出项目目录内指定目录的内容。条目按字母序排列，目录带 "/" 后缀，包含隐藏文件。输出截断到 ${DEFAULT_LIMIT} 条或 ${DEFAULT_MAX_BYTES / 1024}KB。`,
  inputSchema: lsSchema,
  execute: async (_toolCallId, params) => {
    const dirPath = resolveToCwd(params.path || ".", cwd)
    if (!dirPath) {
      return {
        content: [{ type: "text", text: `拒绝访问项目目录之外的路径: ${params.path ?? "."}` }],
        details: { refused: true },
      }
    }

    try {
      const statResult = await stat(dirPath)
      if (!statResult.isDirectory()) {
        return {
          content: [{ type: "text", text: `不是目录: ${params.path ?? "."}` }],
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
        return { content: [{ type: "text", text: "(空目录)" }] }
      }

      const rawOutput = results.join("\n")
      const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER })
      let output = truncation.content
      const notices: string[] = []
      if (entryLimitReached) {
        notices.push(`达到 ${effectiveLimit} 条限制，使用 limit=${effectiveLimit * 2} 查看更多`)
      }
      if (truncation.truncated) {
        notices.push(`达到 ${formatSize(DEFAULT_MAX_BYTES)} 限制`)
      }
      if (notices.length > 0) {
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
        content: [{ type: "text", text: `列出目录 ${params.path ?? "."} 失败: ${message}` }],
        details: { error: message },
      }
    }
  },
})

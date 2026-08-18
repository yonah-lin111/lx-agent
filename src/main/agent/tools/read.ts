import { readFile } from "node:fs/promises"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { spillManager } from "../spill/spillManager"
import { resolveToCwd } from "./path-utils"
import { DEFAULT_MAX_BYTES, formatSize, type TruncationResult, truncateHead } from "./truncate"

const readSchema = z.object({
  path: z.string().describe("相对于项目根目录的文件路径"),
  offset: z.number().describe("起始读取行号（1 起始）").optional(),
  limit: z.number().describe("最多读取的行数").optional(),
})

export interface SessionDeps {
  getSessionId?: () => string | null
}

export interface ReadToolDetails {
  truncation?: TruncationResult
}

// 判断文件是否疑似二进制（前 8KB 含空字节）。
const looksBinary = (buffer: Buffer): boolean => {
  const sample = buffer.subarray(0, 8 * 1024)
  return sample.includes(0)
}

// 创建 read 工具：读取 cwd 内文件内容，支持 offset/limit 分页，越界或二进制文件拒绝。
export const createReadTool = (
  cwd: string,
  sessionDeps?: SessionDeps,
): AgentTool<typeof readSchema> => ({
  name: "read",
  label: "读取文件",
  description:
    "读取项目目录内指定文件的内容。path 为相对于项目根目录的文件路径，支持子目录。可选用 offset/limit 按行号分页读取大文件。禁止访问项目目录之外的文件。",
  inputSchema: readSchema,
  executionMode: "sequential",
  execute: async (toolCallId, params) => {
    const absolutePath = resolveToCwd(params.path, cwd)
    if (!absolutePath) {
      return {
        content: [{ type: "text", text: `拒绝访问项目目录之外的文件: ${params.path}` }],
        details: { refused: true },
      }
    }

    try {
      const buffer = await readFile(absolutePath)
      if (looksBinary(buffer)) {
        return {
          content: [
            {
              type: "text",
              text: `文件 ${params.path} 是二进制文件（${buffer.length} 字节），无法读取内容。`,
            },
          ],
          details: { binary: true, size: buffer.length },
        }
      }

      const textContent = buffer.toString("utf-8")
      const allLines = textContent.split("\n")
      const totalFileLines = allLines.length
      const startLine = params.offset ? Math.max(0, params.offset - 1) : 0
      const startLineDisplay = startLine + 1
      if (startLine >= allLines.length) {
        return {
          content: [
            {
              type: "text",
              text: `Offset ${params.offset} 超出文件末尾（共 ${allLines.length} 行）。`,
            },
          ],
          details: { error: "offset_out_of_bounds", totalLines: allLines.length },
        }
      }

      let selectedContent: string
      let userLimitedLines: number | undefined
      if (params.limit !== undefined) {
        const endLine = Math.min(startLine + params.limit, allLines.length)
        selectedContent = allLines.slice(startLine, endLine).join("\n")
        userLimitedLines = endLine - startLine
      } else {
        selectedContent = allLines.slice(startLine).join("\n")
      }

      const truncation = truncateHead(selectedContent)
      let outputText: string
      if (truncation.firstLineExceedsLimit) {
        const firstLineSize = formatSize(Buffer.byteLength(allLines[startLine], "utf-8"))
        outputText = `[第 ${startLineDisplay} 行大小为 ${firstLineSize}，超过 ${formatSize(DEFAULT_MAX_BYTES)} 限制。]`
      } else if (truncation.truncated) {
        const endLineDisplay = startLineDisplay + truncation.outputLines - 1
        const nextOffset = endLineDisplay + 1
        const reason =
          truncation.truncatedBy === "lines" ? "" : `（${formatSize(DEFAULT_MAX_BYTES)} 限制）`
        const hint = `显示第 ${startLineDisplay}-${endLineDisplay} 行，共 ${totalFileLines} 行${reason}。使用 offset=${nextOffset} 继续读取。`
        const sessionId = sessionDeps?.getSessionId?.() ?? undefined
        const { text } = spillManager.handleTruncation(selectedContent, truncation, {
          sessionId,
          toolCallId,
          customActionHint: hint,
        })
        outputText = text
      } else if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
        const remaining = allLines.length - (startLine + userLimitedLines)
        const nextOffset = startLine + userLimitedLines + 1
        outputText = `${truncation.content}\n\n[文件还有 ${remaining} 行。使用 offset=${nextOffset} 继续读取。]`
      } else {
        outputText = truncation.content
      }

      return {
        content: [{ type: "text", text: outputText }],
        details: { truncation: truncation.truncated ? truncation : undefined },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: "text", text: `读取文件 ${params.path} 失败: ${message}` }],
        details: { error: message },
      }
    }
  },
})

import { readdir, readFile, stat } from "node:fs/promises"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { spillManager } from "../spill/spillManager"
import { resolveToCwd } from "./path-utils"
import { DEFAULT_MAX_BYTES, formatSize, type TruncationResult } from "./truncate"

export const MAX_READ_LINE_LENGTH = 2000
export const MAX_READ_LINE_SUFFIX = `... (line truncated to ${MAX_READ_LINE_LENGTH} chars)`
export const DEFAULT_READ_LIMIT = 2000

const readSchema = z.object({
  path: z.string().describe("相对于项目根目录的文件或目录路径"),
  offset: z.number().describe("起始读取行号（1 起始，默认 1）").optional(),
  limit: z.number().describe(`最多读取的行数（默认 ${DEFAULT_READ_LIMIT}）`).optional(),
})

export interface SessionDeps {
  getSessionId?: () => string | null
}

export interface ReadToolDetails {
  type?: "file" | "directory"
  lineStart?: number
  lineEnd?: number
  totalLines?: number
  totalEntries?: number
  truncation?: TruncationResult
  binary?: boolean
  size?: number
  refused?: boolean
  error?: string
}

// 判断文件是否疑似二进制（含空字节或控制字符占比过高）。
const isBinaryBuffer = (buffer: Buffer): boolean => {
  const sample = buffer.subarray(0, 4096)
  if (sample.length === 0) return false
  if (sample.includes(0)) return true

  let nonPrintableCount = 0
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i]
    if (byte < 9 || (byte > 13 && byte < 32)) {
      nonPrintableCount++
    }
  }

  return nonPrintableCount / sample.length > 0.3
}

// 创建 read 工具：读取项目目录内指定文件或目录，支持按行编号输出、offset/limit 分页、单行截断与目录兼容。
export const createReadTool = (
  cwd: string,
  sessionDeps?: SessionDeps,
): AgentTool<typeof readSchema> => ({
  name: "read",
  label: "读取文件",
  description:
    "读取项目目录内指定文件或目录的内容。支持按行号格式（<line>: <content>）分页读取大文件，或以 entries 形式列出目录结构。禁止访问项目目录之外的文件。",
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
      const fileStat = await stat(absolutePath)

      // 1. 处理目录读取
      if (fileStat.isDirectory()) {
        const rawEntries = await readdir(absolutePath, { withFileTypes: true })
        rawEntries.sort((a, b) => a.name.localeCompare(b.name))

        const formattedEntries = rawEntries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        const limit = params.limit ?? DEFAULT_READ_LIMIT
        const offset = Math.max(1, params.offset ?? 1)
        const start = offset - 1
        const sliced = formattedEntries.slice(start, start + limit)
        const isTruncated = start + sliced.length < formattedEntries.length

        const notice = isTruncated
          ? `\n(Showing ${sliced.length} of ${formattedEntries.length} entries. Use 'offset' parameter to read beyond entry ${offset + sliced.length})`
          : `\n(${formattedEntries.length} entries)`

        const output = [
          `<path>${params.path}</path>`,
          `<type>directory</type>`,
          `<entries>`,
          sliced.join("\n"),
          notice,
          `</entries>`,
        ].join("\n")

        return {
          content: [{ type: "text", text: output }],
          details: {
            type: "directory",
            totalEntries: formattedEntries.length,
            truncation: isTruncated
              ? {
                  content: output,
                  truncated: true,
                  truncatedBy: "lines",
                  totalLines: formattedEntries.length,
                  totalBytes: Buffer.byteLength(output, "utf-8"),
                  outputLines: sliced.length,
                  outputBytes: Buffer.byteLength(output, "utf-8"),
                  lastLinePartial: false,
                  firstLineExceedsLimit: false,
                  maxLines: limit,
                  maxBytes: DEFAULT_MAX_BYTES,
                }
              : undefined,
          },
        }
      }

      // 2. 处理普通文件读取
      const buffer = await readFile(absolutePath)
      if (isBinaryBuffer(buffer)) {
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
      const offset = Math.max(1, params.offset ?? 1)
      const startLine = offset - 1

      if (startLine >= totalFileLines && !(totalFileLines === 0 && offset === 1)) {
        return {
          content: [
            {
              type: "text",
              text: `Offset ${params.offset} 超出文件末尾（共 ${totalFileLines} 行）。`,
            },
          ],
          details: { error: "offset_out_of_bounds", totalLines: totalFileLines },
        }
      }

      const limit = params.limit ?? DEFAULT_READ_LIMIT
      const endLine = Math.min(startLine + limit, totalFileLines)

      // 逐行提取并做单行字符截断及行号编码
      const numberedLines: string[] = []
      let bytesCount = 0
      let byteTruncated = false

      for (let i = startLine; i < endLine; i++) {
        const rawLine = allLines[i]
        const lineText =
          rawLine.length > MAX_READ_LINE_LENGTH
            ? `${rawLine.slice(0, MAX_READ_LINE_LENGTH)}${MAX_READ_LINE_SUFFIX}`
            : rawLine
        const numberedLine = `${i + 1}: ${lineText}`
        const lineBytes = Buffer.byteLength(numberedLine, "utf-8") + (numberedLines.length > 0 ? 1 : 0)

        if (bytesCount + lineBytes > DEFAULT_MAX_BYTES && numberedLines.length > 0) {
          byteTruncated = true
          break
        }

        numberedLines.push(numberedLine)
        bytesCount += lineBytes
      }

      const lastLineNo = startLine + numberedLines.length
      const nextOffset = lastLineNo + 1
      const isLinesTruncated = endLine < totalFileLines
      const isTruncated = byteTruncated || isLinesTruncated

      let footerNote = ""
      if (byteTruncated) {
        footerNote = `\n\n(Output capped at ${formatSize(DEFAULT_MAX_BYTES)}. Showing lines ${offset}-${lastLineNo}. Use offset=${nextOffset} to continue.)`
      } else if (isLinesTruncated) {
        footerNote = `\n\n(Showing lines ${offset}-${lastLineNo} of ${totalFileLines}. Use offset=${nextOffset} to continue.)`
      } else {
        footerNote = `\n\n(End of file - total ${totalFileLines} lines)`
      }

      const outputBody = numberedLines.join("\n")
      const finalOutput = `<path>${params.path}</path>\n<type>file</type>\n<content>\n${outputBody}${footerNote}\n</content>`

      const truncationInfo: TruncationResult | undefined = isTruncated
        ? {
            content: finalOutput,
            truncated: true,
            truncatedBy: byteTruncated ? "bytes" : "lines",
            totalLines: totalFileLines,
            totalBytes: buffer.length,
            outputLines: numberedLines.length,
            outputBytes: bytesCount,
            lastLinePartial: false,
            firstLineExceedsLimit: false,
            maxLines: limit,
            maxBytes: DEFAULT_MAX_BYTES,
          }
        : undefined

      if (truncationInfo && sessionDeps?.getSessionId?.()) {
        const sessionId = sessionDeps.getSessionId()
        if (sessionId) {
          spillManager.handleTruncation(finalOutput, truncationInfo, {
            sessionId,
            toolCallId,
            customActionHint: `Use offset=${nextOffset} to continue.`,
          })
        }
      }

      return {
        content: [{ type: "text", text: finalOutput }],
        details: {
          type: "file",
          lineStart: offset,
          lineEnd: lastLineNo,
          totalLines: totalFileLines,
          truncation: truncationInfo,
        },
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

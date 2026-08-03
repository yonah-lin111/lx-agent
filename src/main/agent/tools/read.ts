import { readFile } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { z } from "zod"
import type { AgentTool } from "../core/types"

// 单次读取最大字节数。
const MAX_BYTES = 100 * 1024

// 判断相对路径是否逃逸 cwd。
const isPathWithinRoot = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
}

// 判断文件是否疑似二进制（前 8KB 含空字节）。
const looksBinary = (buffer: Buffer): boolean => {
  const sample = buffer.subarray(0, 8 * 1024)
  return sample.includes(0)
}

// 创建 read 工具：读取 cwd 内文件内容，越界或二进制文件拒绝。
export const createReadTool = (cwd: string): AgentTool<z.ZodType<{ path: string }>> => ({
  name: "read",
  label: "读取文件",
  description:
    "读取项目目录内指定文件的内容。path 为相对于项目根目录的文件路径，支持子目录。禁止访问项目目录之外的文件。",
  inputSchema: z.object({
    path: z.string().describe("相对于项目根目录的文件路径"),
  }),
  executionMode: "sequential",
  execute: async (_toolCallId, params) => {
    const target = resolve(cwd, params.path)
    if (!isPathWithinRoot(cwd, target)) {
      return {
        content: [{ type: "text", text: `拒绝访问项目目录之外的文件: ${params.path}` }],
        details: { refused: true },
      }
    }

    try {
      const buffer = await readFile(target)
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

      const truncated = buffer.length > MAX_BYTES
      const slice = truncated ? buffer.subarray(0, MAX_BYTES) : buffer
      const text = slice.toString("utf8")
      return {
        content: [
          {
            type: "text",
            text: truncated
              ? `${text}\n\n[内容过长已截断，文件共 ${buffer.length} 字节，仅显示前 ${MAX_BYTES} 字节]`
              : text,
          },
        ],
        details: { size: buffer.length, truncated },
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

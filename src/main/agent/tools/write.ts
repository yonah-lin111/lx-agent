import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { checkLspDiagnosticsFeedback, type LspFeedbackDeps } from "../lsp/feedback"
import { generateStructuredDiff, isBinaryContent } from "./diff"
import { withFileMutationQueue } from "./file-mutation-queue"
import { resolveToCwd } from "./path-utils"

const writeSchema = z.object({
  path: z.string().describe("Path of the file to write (relative to project root)"),
  content: z.string().describe("Content to write into the file"),
})

// 创建 write 工具：写入/覆盖 cwd 内文件，自动创建父目录，经 mutation queue 串行化，写后自动进行 LSP 诊断探测。
export const createWriteTool = (
  cwd: string,
  lspDeps?: LspFeedbackDeps,
): AgentTool<typeof writeSchema> => ({
  name: "write",
  label: "Write file",
  description:
    "Write content to a file. Creates the file if it does not exist, overwrites if it does, and automatically creates missing parent directories. Only files within the project root directory are allowed.",
  inputSchema: writeSchema,
  execute: async (_toolCallId, params, signal) => {
    const absolutePath = resolveToCwd(params.path, cwd)
    if (!absolutePath) {
      return {
        content: [
          { type: "text", text: `Access denied to path outside project root: ${params.path}` },
        ],
        details: { refused: true },
      }
    }
    const dir = dirname(absolutePath)

    return withFileMutationQueue(absolutePath, async () => {
      // 不在 abort 监听器里 reject：那会提前释放 queue，而磁盘操作可能仍在进行。
      // 每次 await 后检查 signal.aborted，既能响应 abort 又保持 queue 锁定到操作完成。
      const throwIfAborted = (): void => {
        if (signal?.aborted) throw new Error("Operation aborted")
      }

      throwIfAborted()
      // 写前读取旧内容用于 diff（文件不存在视为新文件，全量新增）。
      let oldContent = ""
      try {
        const buffer = await readFile(absolutePath)
        oldContent = buffer.toString("utf-8")
      } catch {
        oldContent = ""
      }
      throwIfAborted()

      await mkdir(dir, { recursive: true })
      throwIfAborted()

      await writeFile(absolutePath, params.content, "utf-8")
      throwIfAborted()

      // 二进制内容不做 diff（null 字节/替换符无法可靠展示）。
      const diff =
        !isBinaryContent(oldContent) && !isBinaryContent(params.content)
          ? generateStructuredDiff(oldContent, params.content, params.path)
          : undefined

      const baseText = `Wrote ${Buffer.byteLength(params.content, "utf-8")} bytes to ${params.path}`
      const { textSuffix, errors } = await checkLspDiagnosticsFeedback(
        params.path,
        absolutePath,
        cwd,
        lspDeps,
      )

      return {
        content: [
          {
            type: "text",
            text: `${baseText}${textSuffix}`,
          },
        ],
        details: {
          bytes: Buffer.byteLength(params.content, "utf-8"),
          ...(diff ? { diff } : {}),
          ...(errors.length > 0 ? { diagnostics: errors } : {}),
        },
      }
    })
  },
})

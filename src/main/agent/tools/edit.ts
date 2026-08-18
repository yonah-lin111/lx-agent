import { access, readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { checkLspDiagnosticsFeedback, type LspFeedbackDeps } from "../lsp/feedback"
import { generateStructuredDiff } from "./diff"
import { withFileMutationQueue } from "./file-mutation-queue"
import { resolveToCwd } from "./path-utils"

const replaceEditSchema = z.object({
  oldText: z.string().describe("需要替换的原文，须在文件中唯一且与其他 edits 不重叠"),
  newText: z.string().describe("替换后的新文本"),
})

const editSchema = z.object({
  path: z.string().describe("要编辑的文件路径（相对项目根目录）"),
  edits: z
    .array(replaceEditSchema)
    .describe("一个或多个目标替换。每个 oldText 都基于原始文件匹配，不做增量匹配。"),
})

type EditInput = z.infer<typeof editSchema>
type Edit = { oldText: string; newText: string }

// 兼容部分模型将 edits 传为 JSON 字符串或使用旧版 oldText/newText 顶层字段。
const prepareEditArguments = (input: unknown): EditInput => {
  if (!input || typeof input !== "object") {
    return input as EditInput
  }
  const args = input as Record<string, unknown>

  if (typeof args.edits === "string") {
    try {
      const parsed = JSON.parse(args.edits)
      if (Array.isArray(parsed)) args.edits = parsed
    } catch {
      // 忽略解析失败，交由 schema 校验报错
    }
  }

  const edits = Array.isArray(args.edits) ? [...args.edits] : []
  if (typeof args.oldText === "string" && typeof args.newText === "string") {
    edits.push({ oldText: args.oldText, newText: args.newText })
  }
  return { path: args.path as string, edits }
}

// 去除 UTF-8 BOM，返回 BOM 与去除后的文本。
const stripBom = (content: string): { bom: string; text: string } => {
  if (content.charCodeAt(0) === 0xfeff) {
    return { bom: "﻿", text: content.slice(1) }
  }
  return { bom: "", text: content }
}

const detectLineEnding = (content: string): "\r\n" | "\n" => {
  return content.includes("\r\n") ? "\r\n" : "\n"
}

const normalizeToLF = (text: string): string => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

const restoreLineEndings = (text: string, ending: "\r\n" | "\n"): string =>
  ending === "\r\n" ? text.replace(/\n/g, "\r\n") : text

// 对归一化后的内容应用编辑：唯一性 + 重叠检查 + 按位置替换。
const applyEditsToNormalizedContent = (
  normalizedContent: string,
  edits: Edit[],
  path: string,
): { baseContent: string; newContent: string } => {
  const normalizedEdits = edits.map((edit) => ({
    oldText: normalizeToLF(edit.oldText),
    newText: normalizeToLF(edit.newText),
  }))

  for (let i = 0; i < normalizedEdits.length; i++) {
    if (normalizedEdits[i].oldText.length === 0) {
      throw new Error(`edits[${i}] 的 oldText 不能为空（${path}）。`)
    }
  }

  const matchedEdits: Array<{
    editIndex: number
    matchIndex: number
    matchLength: number
    newText: string
  }> = []
  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i]
    const matchIndex = normalizedContent.indexOf(edit.oldText)
    if (matchIndex === -1) {
      throw new Error(
        `edits[${i}] 未在 ${path} 中找到匹配的 oldText。请确保 oldText 与文件内容完全一致（共 ${normalizedEdits.length} 处编辑）。`,
      )
    }

    let occurrences = 0
    let searchFrom = 0
    while (searchFrom <= normalizedContent.length - edit.oldText.length) {
      const found = normalizedContent.indexOf(edit.oldText, searchFrom)
      if (found === -1) break
      occurrences++
      searchFrom = found + edit.oldText.length
    }
    if (occurrences > 1) {
      throw new Error(
        `edits[${i}] 的 oldText 在 ${path} 中出现 ${occurrences} 次，不唯一。请补充上下文使 oldText 唯一。`,
      )
    }

    matchedEdits.push({
      editIndex: i,
      matchIndex,
      matchLength: edit.oldText.length,
      newText: edit.newText,
    })
  }

  matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex)
  for (let i = 1; i < matchedEdits.length; i++) {
    const previous = matchedEdits[i - 1]
    const current = matchedEdits[i]
    if (previous.matchIndex + previous.matchLength > current.matchIndex) {
      throw new Error(
        `edits[${previous.editIndex}] 与 edits[${current.editIndex}] 在 ${path} 中重叠。请合并为一次编辑或让目标区域不相交。`,
      )
    }
  }

  // 按位置从后往前替换，避免前面替换改变后面偏移。
  let newContent = normalizedContent
  for (let i = matchedEdits.length - 1; i >= 0; i--) {
    const edit = matchedEdits[i]
    newContent =
      newContent.slice(0, edit.matchIndex) +
      edit.newText +
      newContent.slice(edit.matchIndex + edit.matchLength)
  }

  if (normalizedContent === newContent) {
    throw new Error(`编辑未产生任何变化（${path}）。`)
  }

  return { baseContent: normalizedContent, newContent }
}

// 创建 edit 工具：目标文本替换，经 mutation queue 串行化，写后自动进行 LSP 诊断探测。
export const createEditTool = (
  cwd: string,
  lspDeps?: LspFeedbackDeps,
): AgentTool<typeof editSchema> => ({
  name: "edit",
  label: "编辑文件",
  description:
    "使用精确文本替换编辑单个文件。每个 edits[].oldText 必须在原文件中唯一且互不重叠。若两处改动相邻，请合并为一次编辑。禁止仅为连接远端改动而包含大段未改动区域。",
  inputSchema: editSchema,
  prepareArguments: prepareEditArguments,
  execute: async (_toolCallId, params, signal) => {
    const absolutePath = resolveToCwd(params.path, cwd)
    if (!absolutePath) {
      return {
        content: [{ type: "text", text: `拒绝访问项目目录之外的文件: ${params.path}` }],
        details: { refused: true },
      }
    }

    return withFileMutationQueue(absolutePath, async () => {
      // 不在 abort 监听器里 reject：那会提前释放 queue，而磁盘操作可能仍在进行。
      // 每次 await 后检查 signal.aborted，既能响应 abort 又保持 queue 锁定到操作完成。
      const throwIfAborted = (): void => {
        if (signal?.aborted) throw new Error("Operation aborted")
      }

      throwIfAborted()
      try {
        await access(absolutePath)
      } catch (error) {
        throwIfAborted()
        const code =
          error instanceof Error && "code" in error
            ? (error as NodeJS.ErrnoException).code
            : "unknown"
        return {
          content: [{ type: "text", text: `无法编辑文件 ${params.path}。错误码: ${code}。` }],
          details: { error: String(code) },
        }
      }
      throwIfAborted()

      const buffer = await readFile(absolutePath)
      const rawContent = buffer.toString("utf-8")
      throwIfAborted()

      const { bom, text } = stripBom(rawContent)
      const originalEnding = detectLineEnding(text)
      const normalizedContent = normalizeToLF(text)

      let baseContent: string
      let newContent: string
      try {
        const result = applyEditsToNormalizedContent(normalizedContent, params.edits, params.path)
        baseContent = result.baseContent
        newContent = result.newContent
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          details: { error: error instanceof Error ? error.message : String(error) },
        }
      }
      throwIfAborted()

      const finalContent = bom + restoreLineEndings(newContent, originalEnding)
      await writeFile(absolutePath, finalContent, "utf-8")
      throwIfAborted()

      const baseText = `已替换 ${params.edits.length} 处内容于 ${params.path}。`
      const { textSuffix, errors } = await checkLspDiagnosticsFeedback(
        params.path,
        absolutePath,
        cwd,
        lspDeps,
      )

      return {
        content: [{ type: "text", text: `${baseText}${textSuffix}` }],
        details: {
          diff: generateStructuredDiff(baseContent, newContent, params.path),
          ...(errors.length > 0 ? { diagnostics: errors } : {}),
        },
      }
    })
  },
})

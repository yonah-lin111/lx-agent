import { access, readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { checkLspDiagnosticsFeedback, type LspFeedbackDeps } from "../lsp/feedback"
import { generateStructuredDiff } from "./diff"
import { withFileMutationQueue } from "./file-mutation-queue"
import { resolveToCwd } from "./path-utils"

const replaceEditSchema = z.object({
  oldText: z
    .string()
    .describe(
      "Original text to replace, must be unique in the file and non-overlapping with other edits",
    ),
  newText: z.string().describe("New text to replace oldText with"),
})

const editSchema = z.object({
  path: z.string().describe("Path of the file to edit (relative to project root)"),
  edits: z
    .array(replaceEditSchema)
    .describe("One or more replacements. Each oldText matches against the original file."),
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
      throw new Error(`edits[${i}].oldText cannot be empty (${path}).`)
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
        `edits[${i}] oldText not found in ${path}. Ensure oldText matches file content exactly (${normalizedEdits.length} total edits).`,
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
        `edits[${i}] oldText matches ${occurrences} occurrences in ${path} (must be unique). Add more surrounding context to make oldText unique.`,
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
        `edits[${previous.editIndex}] and edits[${current.editIndex}] overlap in ${path}. Merge into one edit or ensure targets do not intersect.`,
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
    throw new Error(`Edit produced no changes (${path}).`)
  }

  return { baseContent: normalizedContent, newContent }
}

// 创建 edit 工具：目标文本替换，经 mutation queue 串行化，写后自动进行 LSP 诊断探测。
export const createEditTool = (
  cwd: string,
  lspDeps?: LspFeedbackDeps,
): AgentTool<typeof editSchema> => ({
  name: "edit",
  label: "Edit file",
  description:
    "Edit a single file using exact text replacements. Each edits[].oldText must be unique and non-overlapping in the original file. If two changes are adjacent, merge them into one edit. Do not include large unchanged regions solely to join distant changes.",
  inputSchema: editSchema,
  prepareArguments: prepareEditArguments,
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
          content: [
            { type: "text", text: `Cannot edit file ${params.path}. Error code: ${code}.` },
          ],
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

      const baseText = `Applied ${params.edits.length} edits to ${params.path}.`
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

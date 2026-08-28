import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { AgentDiff } from "@shared/contracts/agent"
import type { Diagnostic } from "vscode-languageserver-types"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { checkLspDiagnosticsFeedback, type LspFeedbackDeps } from "../lsp/feedback"
import { applyHunksToFile, parsePatch } from "./applyPatchParser"
import { generateStructuredDiff } from "./diff"
import { withFileMutationQueue } from "./file-mutation-queue"
import { resolveToCwd } from "./path-utils"

const applyPatchSchema = z.object({
  patch: z.string().describe(`Multi-file patch content following V4A format.
Syntax specification:
*** Begin Patch
*** Add File: <path>
<new file content>
*** Update File: <path>
<context and edits: '-' for removal, '+' for addition, ' ' (space) for context lines>
*** Delete File: <path>
*** End Patch`),
})

export interface ApplyPatchToolDetails {
  diffs?: AgentDiff[]
  diagnostics?: Diagnostic[]
  refused?: boolean
  error?: string
}

/**
 * 创建 apply_patch 工具：
 * - 纯原子性跨文件事务：先全部内存加载与上下文校验，任意一个文件/hunk 失败则全量回退拒绝。
 * - 写入时通过 withFileMutationQueue 串行化落盘。
 * - 生成结构化 diff 聚合与 LSP 写后诊断。
 */
export const createApplyPatchTool = (
  cwd: string,
  lspDeps?: LspFeedbackDeps,
): AgentTool<typeof applyPatchSchema> => ({
  name: "apply_patch",
  label: "Apply multi-file patch",
  description:
    "Apply patch across multiple files in a single atomic operation. Supports creating new files (*** Add File), modifying existing files (*** Update File), and deleting files (*** Delete File). If any hunk fails, all changes are aborted.",
  inputSchema: applyPatchSchema,
  execute: async (_toolCallId, params, signal) => {
    let parsed
    try {
      parsed = parsePatch(params.patch)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: "text", text: `Failed to parse patch: ${errorMsg}` }],
        details: { error: errorMsg },
      }
    }

    // 1. 路径边界检查与预处理
    const fileOperations: Array<{
      action: (typeof parsed.actions)[number]
      absolutePath: string
      relativePath: string
    }> = []

    for (const action of parsed.actions) {
      const abs = resolveToCwd(action.path, cwd)
      if (!abs) {
        return {
          content: [
            { type: "text", text: `Access denied to path outside project root: ${action.path}` },
          ],
          details: { refused: true },
        }
      }
      fileOperations.push({
        action,
        absolutePath: abs,
        relativePath: action.path,
      })
    }

    if (signal?.aborted) {
      return {
        content: [{ type: "text", text: "Operation aborted." }],
        details: { error: "aborted" },
      }
    }

    // 2. 预检与内存计算阶段（原子校验：任一失败则中断返回）
    type PlannedWrite =
      | {
          type: "write"
          absolutePath: string
          relativePath: string
          content: string
          oldContent: string
        }
      | { type: "delete"; absolutePath: string; relativePath: string; oldContent: string }

    const plans: PlannedWrite[] = []

    try {
      for (const op of fileOperations) {
        if (op.action.type === "add") {
          let exists = true
          try {
            await readFile(op.absolutePath)
          } catch {
            exists = false
          }
          if (exists) {
            throw new Error(`Cannot create file ${op.relativePath}: file already exists.`)
          }
          plans.push({
            type: "write",
            absolutePath: op.absolutePath,
            relativePath: op.relativePath,
            content: op.action.content,
            oldContent: "",
          })
        } else if (op.action.type === "delete") {
          let oldContent = ""
          try {
            const buf = await readFile(op.absolutePath)
            oldContent = buf.toString("utf-8")
          } catch (err) {
            throw new Error(
              `Cannot delete file ${op.relativePath}: file does not exist or is unreadable.`,
            )
          }
          plans.push({
            type: "delete",
            absolutePath: op.absolutePath,
            relativePath: op.relativePath,
            oldContent,
          })
        } else if (op.action.type === "update") {
          let oldContent = ""
          try {
            const buf = await readFile(op.absolutePath)
            oldContent = buf.toString("utf-8")
          } catch (err) {
            throw new Error(
              `Cannot update file ${op.relativePath}: file does not exist or is unreadable.`,
            )
          }

          const newContent = applyHunksToFile(oldContent, op.action.hunks, op.relativePath)
          plans.push({
            type: "write",
            absolutePath: op.absolutePath,
            relativePath: op.relativePath,
            content: newContent,
            oldContent,
          })
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: "text", text: `Patch validation failed, changes aborted: ${errorMsg}` }],
        details: { error: errorMsg },
      }
    }

    if (signal?.aborted) {
      return {
        content: [{ type: "text", text: "Operation aborted." }],
        details: { error: "aborted" },
      }
    }

    // 3. 落盘执行阶段（全部文件锁定与串行写）
    const diffs: AgentDiff[] = []
    const allDiagnostics: Diagnostic[] = []

    for (const plan of plans) {
      await withFileMutationQueue(plan.absolutePath, async () => {
        if (plan.type === "delete") {
          await unlink(plan.absolutePath).catch(() => {})
          diffs.push(generateStructuredDiff(plan.oldContent, "", plan.relativePath))
        } else {
          await mkdir(dirname(plan.absolutePath), { recursive: true })
          await writeFile(plan.absolutePath, plan.content, "utf-8")
          diffs.push(generateStructuredDiff(plan.oldContent, plan.content, plan.relativePath))

          // LSP 诊断
          const { errors } = await checkLspDiagnosticsFeedback(
            plan.relativePath,
            plan.absolutePath,
            cwd,
            lspDeps,
          )
          if (errors.length > 0) {
            allDiagnostics.push(...errors)
          }
        }
      })
    }

    const summary = `Successfully applied patch to ${plans.length} files:\n${plans
      .map(
        (p) =>
          `  - [${p.type === "delete" ? "delete" : p.oldContent === "" ? "add" : "update"}] ${p.relativePath}`,
      )
      .join("\n")}`

    return {
      content: [{ type: "text", text: summary }],
      details: {
        diffs,
        ...(allDiagnostics.length > 0 ? { diagnostics: allDiagnostics } : {}),
      },
    }
  },
})

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
  patch: z.string().describe(`遵循 V4A 格式的多文件补丁内容。
语法规范：
*** Begin Patch
*** Add File: <path>
<新文件内容>
*** Update File: <path>
<上下文与修改内容：'-' 开头表示删除，'+' 开头表示新增，' ' (空格) 开头表示上下文行>
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
  label: "应用多文件补丁",
  description:
    "在单个原子操作中对多个文件应用补丁。支持创建新文件 (*** Add File)、修改已有文件 (*** Update File) 以及删除文件 (*** Delete File)。若任意一处匹配失败，所有更改均不会落盘。",
  inputSchema: applyPatchSchema,
  execute: async (_toolCallId, params, signal) => {
    let parsed
    try {
      parsed = parsePatch(params.patch)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: "text", text: `解析补丁失败: ${errorMsg}` }],
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
          content: [{ type: "text", text: `拒绝访问项目目录之外的文件: ${action.path}` }],
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
      return { content: [{ type: "text", text: "操作已中止。" }], details: { error: "aborted" } }
    }

    // 2. 预检与内存计算阶段（原子校验：任一失败则中断返回）
    type PlannedWrite =
      | { type: "write"; absolutePath: string; relativePath: string; content: string; oldContent: string }
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
            throw new Error(`无法创建新文件 ${op.relativePath}：该文件已存在。`)
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
            throw new Error(`无法删除文件 ${op.relativePath}：文件不存在或无法读取。`)
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
            throw new Error(`无法更新文件 ${op.relativePath}：文件不存在或无法读取。`)
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
        content: [{ type: "text", text: `补丁校验失败，已放弃全部修改: ${errorMsg}` }],
        details: { error: errorMsg },
      }
    }

    if (signal?.aborted) {
      return { content: [{ type: "text", text: "操作已中止。" }], details: { error: "aborted" } }
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

    const summary = `成功应用补丁至 ${plans.length} 个文件：\n${plans
      .map((p) => `  - [${p.type === "delete" ? "删除" : p.oldContent === "" ? "新增" : "更新"}] ${p.relativePath}`)
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

import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { spillManager } from "../spill/spillManager"
import { resolveToCwd } from "./path-utils"
import type { SessionDeps } from "./read"
import { globToRegExp, walkFiles } from "./search"
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate"

const DEFAULT_LIMIT = 1000

const findSchema = z.object({
  pattern: z.string().describe("匹配文件的 glob 模式，如 '*.ts'、'**/*.json'、'src/**/*.spec.ts'"),
  path: z.string().describe("要搜索的目录，默认项目根目录").optional(),
  limit: z.number().describe(`最多返回的结果数（默认 ${DEFAULT_LIMIT}）`).optional(),
})

// 尝试使用系统 fd；fd 不可用时返回 undefined 触发纯 Node 降级。
const findWithFd = async (
  pattern: string,
  searchPath: string,
  effectiveLimit: number,
  signal?: AbortSignal,
  options?: { sessionId?: string; toolCallId?: string },
): Promise<ReturnType<AgentTool<typeof findSchema>["execute"]> | undefined> => {
  const args: string[] = ["--glob", "--color=never", "--hidden"]
  args.push("--max-results", String(effectiveLimit))

  let effectivePattern = pattern
  if (pattern.includes("/")) {
    args.push("--full-path")
    if (!pattern.startsWith("/") && !pattern.startsWith("**/") && pattern !== "**") {
      effectivePattern = `**/${pattern}`
    }
  }
  args.push("--", effectivePattern, searchPath)

  const child = spawn("fd", args, { stdio: ["ignore", "pipe", "pipe"] })
  const rl = createInterface({ input: child.stdout })
  let stderr = ""
  let spawnFailed = false
  const lines: string[] = []

  child.on("error", () => {
    spawnFailed = true
  })
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString()
  })

  const onAbort = () => child.kill()
  signal?.addEventListener("abort", onAbort, { once: true })

  rl.on("line", (line) => {
    if (line.trim()) lines.push(line)
  })

  const exitCode = await new Promise<number | null>((resolveExit) => {
    child.on("close", resolveExit)
  })
  signal?.removeEventListener("abort", onAbort)

  if (spawnFailed || exitCode === null) {
    return undefined
  }
  if (exitCode !== 0) {
    return {
      content: [{ type: "text", text: `fd 执行失败: ${stderr.trim() || `退出码 ${exitCode}`}` }],
      details: { error: stderr.trim() },
    }
  }

  return formatFindOutput(lines, effectiveLimit, options)
}

// 格式化 find 输出：相对搜索根 + 截断 + 提示。
const formatFindOutput = async (
  relativized: string[],
  effectiveLimit: number,
  options?: { sessionId?: string; toolCallId?: string },
): Promise<ReturnType<AgentTool<typeof findSchema>["execute"]>> => {
  if (relativized.length === 0) {
    return { content: [{ type: "text", text: "未找到匹配文件" }] }
  }
  const resultLimitReached = relativized.length >= effectiveLimit
  const rawOutput = relativized.join("\n")
  const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER })
  let output = truncation.content
  const notices: string[] = []
  if (resultLimitReached) {
    notices.push(`达到 ${effectiveLimit} 条结果限制`)
  }
  if (truncation.truncated) {
    const { text } = spillManager.handleTruncation(rawOutput, truncation, {
      sessionId: options?.sessionId,
      toolCallId: options?.toolCallId,
      customActionHint: "Use more specific pattern or path to narrow down find results.",
    })
    output = text
  } else if (notices.length > 0) {
    output += `\n\n[${notices.join(". ")}]`
  }
  return {
    content: [{ type: "text", text: output }],
    details: {
      resultLimitReached: resultLimitReached ? effectiveLimit : undefined,
      truncation: truncation.truncated ? truncation : undefined,
    },
  }
}

// 纯 Node 降级：递归扫描 + glob 匹配相对路径。
const findWithNode = async (
  pattern: string,
  searchPath: string,
  effectiveLimit: number,
  signal?: AbortSignal,
  options?: { sessionId?: string; toolCallId?: string },
): Promise<ReturnType<AgentTool<typeof findSchema>["execute"]>> => {
  const files = await walkFiles(searchPath, { signal, maxResults: effectiveLimit })
  const globRegex = globToRegExp(pattern)
  const matched = files.filter((file) => globRegex.test(file))
  return formatFindOutput(matched.slice(0, effectiveLimit), effectiveLimit, options)
}

// 创建 find 工具：优先 fd 降级纯 Node glob。
export const createFindTool = (
  cwd: string,
  sessionDeps?: SessionDeps,
): AgentTool<typeof findSchema> => ({
  name: "find",
  label: "查找文件",
  description: `按 glob 模式在项目内查找文件，返回相对搜索目录的路径。输出截断到 ${DEFAULT_LIMIT} 条或 ${DEFAULT_MAX_BYTES / 1024}KB。`,
  inputSchema: findSchema,
  execute: async (toolCallId, params, signal) => {
    const searchPath = resolveToCwd(params.path || ".", cwd)
    if (!searchPath) {
      return {
        content: [{ type: "text", text: `拒绝访问项目目录之外的路径: ${params.path ?? "."}` }],
        details: { refused: true },
      }
    }

    const effectiveLimit = Math.max(1, params.limit ?? DEFAULT_LIMIT)
    const sessionId = sessionDeps?.getSessionId?.() ?? undefined
    const options = { sessionId, toolCallId }
    const fdResult = await findWithFd(params.pattern, searchPath, effectiveLimit, signal, options)
    if (fdResult !== undefined) {
      return fdResult
    }
    return findWithNode(params.pattern, searchPath, effectiveLimit, signal, options)
  },
})

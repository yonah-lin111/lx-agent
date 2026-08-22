import { spawn } from "node:child_process"
import { readFile, stat } from "node:fs/promises"
import { basename, join, relative, sep } from "node:path"
import { createInterface } from "node:readline"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { spillManager } from "../spill/spillManager"
import { resolveToCwd } from "./path-utils"
import type { SessionDeps } from "./read"
import { globToRegExp, walkFiles } from "./search"
import { DEFAULT_MAX_BYTES, GREP_MAX_LINE_LENGTH, truncateHead, truncateLine } from "./truncate"

const DEFAULT_LIMIT = 100

const grepSchema = z.object({
  pattern: z.string().describe("搜索模式（正则或字面量）"),
  path: z.string().describe("要搜索的目录或文件，默认项目根目录").optional(),
  glob: z.string().describe("按 glob 过滤文件，如 '*.ts' 或 '**/*.spec.ts'").optional(),
  ignoreCase: z.boolean().describe("忽略大小写").optional(),
  literal: z.boolean().describe("将 pattern 视为字面量而非正则").optional(),
  context: z.number().describe("匹配行前后各显示的上下文行数").optional(),
  limit: z.number().describe(`最多返回的匹配数（默认 ${DEFAULT_LIMIT}）`).optional(),
})

type GrepArgs = z.infer<typeof grepSchema>

interface MatchEntry {
  filePath: string
  lineNumber: number
  lineText?: string
}

// 将匹配条目格式化为输出文本。
const formatMatches = async (
  matches: MatchEntry[],
  args: GrepArgs,
  searchPath: string,
  isDirectory: boolean,
): Promise<{ output: string; linesTruncated: boolean }> => {
  const contextValue = args.context && args.context > 0 ? args.context : 0
  const formatPath = (filePath: string): string => {
    if (isDirectory) {
      const rel = relative(searchPath, filePath)
      if (rel && !rel.startsWith(`..${sep}`)) return rel.split(sep).join("/")
    }
    return basename(filePath)
  }

  const fileCache = new Map<string, string[]>()
  const outputLines: string[] = []
  let linesTruncated = false

  for (const match of matches) {
    if (contextValue === 0 && match.lineText !== undefined) {
      const sanitized = match.lineText.replace(/\r\n/g, "\n").replace(/\r/g, "").replace(/\n$/, "")
      const { text, wasTruncated } = truncateLine(sanitized)
      if (wasTruncated) linesTruncated = true
      outputLines.push(`${formatPath(match.filePath)}:${match.lineNumber}: ${text}`)
      continue
    }

    // 需要上下文行时读取文件内容构建块。
    let lines = fileCache.get(match.filePath)
    if (!lines) {
      lines = (await readFile(match.filePath, "utf-8"))
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
      fileCache.set(match.filePath, lines)
    }
    if (!lines.length) {
      outputLines.push(`${formatPath(match.filePath)}:${match.lineNumber}: (无法读取文件)`)
      continue
    }
    const start = contextValue > 0 ? Math.max(1, match.lineNumber - contextValue) : match.lineNumber
    const end =
      contextValue > 0 ? Math.min(lines.length, match.lineNumber + contextValue) : match.lineNumber
    for (let current = start; current <= end; current++) {
      const lineText = (lines[current - 1] ?? "").replace(/\r/g, "")
      const { text, wasTruncated } = truncateLine(lineText)
      if (wasTruncated) linesTruncated = true
      const prefix = current === match.lineNumber ? ":" : "-"
      outputLines.push(
        `${formatPath(match.filePath)}${prefix}${current}${prefix === ":" ? ": " : " "}${text}`,
      )
    }
  }

  return { output: outputLines.join("\n"), linesTruncated }
}

// 尝试使用系统 ripgrep；rg 不可用时返回 undefined 触发纯 Node 降级。
const grepWithRg = async (
  args: GrepArgs,
  searchPath: string,
  isDirectory: boolean,
  effectiveLimit: number,
  signal?: AbortSignal,
  options?: { sessionId?: string; toolCallId?: string },
): Promise<ReturnType<AgentTool<typeof grepSchema>["execute"]> | undefined> => {
  const rgArgs = ["--json", "--line-number", "--color=never", "--hidden"]
  if (args.ignoreCase) rgArgs.push("--ignore-case")
  if (args.literal) rgArgs.push("--fixed-strings")
  if (args.glob) rgArgs.push("--glob", args.glob)
  rgArgs.push("--", args.pattern, searchPath)

  const child = spawn("rg", rgArgs, { stdio: ["ignore", "pipe", "pipe"] })
  const rl = createInterface({ input: child.stdout })
  let stderr = ""
  let spawnFailed = false
  const matches: MatchEntry[] = []
  let matchLimitReached = false

  child.on("error", () => {
    spawnFailed = true
  })
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString()
  })

  const onAbort = () => child.kill()
  signal?.addEventListener("abort", onAbort, { once: true })

  rl.on("line", (line) => {
    if (!line.trim() || matches.length >= effectiveLimit) return
    let event: {
      type?: string
      data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } }
    }
    try {
      event = JSON.parse(line)
    } catch {
      return
    }
    if (event.type === "match") {
      const filePath = event.data?.path?.text
      const lineNumber = event.data?.line_number
      const lineText = event.data?.lines?.text
      if (filePath && typeof lineNumber === "number") {
        matches.push({ filePath, lineNumber, lineText })
      }
      if (matches.length >= effectiveLimit) {
        matchLimitReached = true
        child.kill()
      }
    }
  })

  const exitCode = await new Promise<number | null>((resolveExit) => {
    child.on("close", resolveExit)
  })
  signal?.removeEventListener("abort", onAbort)

  if (spawnFailed || exitCode === null) {
    return undefined
  }
  if (exitCode !== 0 && exitCode !== 1) {
    return {
      content: [
        { type: "text", text: `ripgrep 执行失败: ${stderr.trim() || `退出码 ${exitCode}`}` },
      ],
      details: { error: stderr.trim() },
    }
  }

  return formatGrepOutput(
    matches,
    args,
    searchPath,
    isDirectory,
    effectiveLimit,
    matchLimitReached,
    options,
  )
}

// 统一格式化 grep 输出与截断/Spill 处理。
const formatGrepOutput = async (
  matches: MatchEntry[],
  args: GrepArgs,
  searchPath: string,
  isDirectory: boolean,
  effectiveLimit: number,
  matchLimitReached: boolean,
  options?: { sessionId?: string; toolCallId?: string },
): Promise<ReturnType<AgentTool<typeof grepSchema>["execute"]>> => {
  if (!matches.length) {
    return { content: [{ type: "text", text: "未找到匹配" }] }
  }
  const { output: rawOutput, linesTruncated } = await formatMatches(
    matches,
    args,
    searchPath,
    isDirectory,
  )
  const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER })
  let output = truncation.content
  const notices: string[] = []
  if (matchLimitReached) {
    notices.push(
      `达到 ${effectiveLimit} 条匹配限制，使用 limit=${effectiveLimit * 2} 获取更多或细化模式`,
    )
  }
  if (truncation.truncated) {
    const { text } = spillManager.handleTruncation(rawOutput, truncation, {
      sessionId: options?.sessionId,
      toolCallId: options?.toolCallId,
      customActionHint: "Use more specific grep pattern or path filter to narrow down matches.",
    })
    output = text
  } else {
    if (linesTruncated) {
      notices.push(`部分行截断到 ${GREP_MAX_LINE_LENGTH} 字符，使用 read 工具查看完整内容`)
    }
    if (notices.length > 0) {
      output += `\n\n[${notices.join(". ")}]`
    }
  }
  return {
    content: [{ type: "text", text: output }],
    details: {
      matchLimitReached: matchLimitReached ? effectiveLimit : undefined,
      truncation: truncation.truncated ? truncation : undefined,
      linesTruncated: linesTruncated || undefined,
    },
  }
}

// 纯 Node 降级：递归扫描 + 逐行正则匹配。
const grepWithNode = async (
  args: GrepArgs,
  searchPath: string,
  isDirectory: boolean,
  effectiveLimit: number,
  signal?: AbortSignal,
  options?: { sessionId?: string; toolCallId?: string },
): Promise<ReturnType<AgentTool<typeof grepSchema>["execute"]>> => {
  let filePaths: string[]
  if (isDirectory) {
    let files = await walkFiles(searchPath, { signal })
    if (args.glob) {
      const globRegex = globToRegExp(args.glob)
      files = files.filter((file) => globRegex.test(file))
    }
    filePaths = files.map((file) => join(searchPath, file))
  } else {
    filePaths = [searchPath]
  }

  let flags = ""
  if (args.ignoreCase) flags += "i"
  const pattern = args.literal ? args.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : args.pattern
  let regex: RegExp
  try {
    regex = new RegExp(pattern, flags)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: "text", text: `无效的正则表达式: ${message}` }],
      details: { error: message },
    }
  }

  const matches: MatchEntry[] = []
  let matchLimitReached = false
  for (const filePath of filePaths) {
    if (signal?.aborted) break
    const lines = (await readFile(filePath, "utf-8"))
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
    for (let index = 0; index < lines.length; index++) {
      if (regex.test(lines[index])) {
        matches.push({ filePath, lineNumber: index + 1, lineText: lines[index] })
        if (matches.length >= effectiveLimit) {
          matchLimitReached = true
          break
        }
      }
    }
    if (matchLimitReached) break
  }

  return formatGrepOutput(
    matches,
    args,
    searchPath,
    isDirectory,
    effectiveLimit,
    matchLimitReached,
    options,
  )
}

// 创建 grep 工具：优先 rg 降级纯 Node 扫描。
export const createGrepTool = (
  cwd: string,
  sessionDeps?: SessionDeps,
): AgentTool<typeof grepSchema> => ({
  name: "grep",
  label: "搜索内容",
  description: `搜索项目内文件内容。支持正则或字面量匹配，可按 glob 过滤文件，支持上下文行。输出截断到 ${DEFAULT_LIMIT} 条匹配或 ${DEFAULT_MAX_BYTES / 1024}KB，单行超 ${GREP_MAX_LINE_LENGTH} 字符截断。`,
  inputSchema: grepSchema,
  execute: async (toolCallId, params, signal) => {
    const searchPath = resolveToCwd(params.path || ".", cwd)
    if (!searchPath) {
      return {
        content: [{ type: "text", text: `拒绝访问项目目录之外的路径: ${params.path ?? "."}` }],
        details: { refused: true },
      }
    }

    let isDirectory = true
    try {
      isDirectory = (await stat(searchPath)).isDirectory()
    } catch {
      return {
        content: [{ type: "text", text: `路径不存在: ${params.path ?? "."}` }],
        details: { error: "path_not_found" },
      }
    }

    const effectiveLimit = Math.max(1, params.limit ?? DEFAULT_LIMIT)
    const sessionId = sessionDeps?.getSessionId?.() ?? undefined
    const options = { sessionId, toolCallId }
    const rgResult = await grepWithRg(
      params,
      searchPath,
      isDirectory,
      effectiveLimit,
      signal,
      options,
    )
    if (rgResult !== undefined) {
      return rgResult
    }
    return grepWithNode(params, searchPath, isDirectory, effectiveLimit, signal, options)
  },
})

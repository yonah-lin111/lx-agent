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
  pattern: z.string().describe("Search pattern (regex or literal string)"),
  path: z.string().describe("Directory or file to search in (defaults to project root)").optional(),
  glob: z.string().describe("Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'").optional(),
  ignoreCase: z.boolean().describe("Whether to ignore case sensitivity").optional(),
  literal: z.boolean().describe("Whether to treat pattern as literal string instead of regex").optional(),
  context: z.number().describe("Number of context lines before and after match").optional(),
  limit: z.number().describe(`Maximum matches to return (default: ${DEFAULT_LIMIT})`).optional(),
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
      outputLines.push(`${formatPath(match.filePath)}:${match.lineNumber}: (Unable to read file)`)
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
        { type: "text", text: `ripgrep execution failed: ${stderr.trim() || `exit code ${exitCode}`}` },
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
    return { content: [{ type: "text", text: "No matches found" }] }
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
      `Reached limit of ${effectiveLimit} matches; use limit=${effectiveLimit * 2} to see more or refine pattern`,
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
      notices.push(`Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars; use 'read' tool to view full content`)
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
      content: [{ type: "text", text: `Invalid regular expression: ${message}` }],
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
  label: "Search contents",
  description: `Search file contents in the project. Supports regex and literal strings, glob filtering, and context lines. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB, with lines over ${GREP_MAX_LINE_LENGTH} chars truncated.`,
  inputSchema: grepSchema,
  execute: async (toolCallId, params, signal) => {
    const searchPath = resolveToCwd(params.path || ".", cwd)
    if (!searchPath) {
      return {
        content: [{ type: "text", text: `Access denied to path outside project root: ${params.path ?? "."}` }],
        details: { refused: true },
      }
    }

    let isDirectory = true
    try {
      isDirectory = (await stat(searchPath)).isDirectory()
    } catch {
      return {
        content: [{ type: "text", text: `Path does not exist: ${params.path ?? "."}` }],
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

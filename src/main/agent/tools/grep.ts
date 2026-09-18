import { spawn } from "node:child_process"
import { readFile, stat } from "node:fs/promises"
import { basename, join, relative, sep } from "node:path"
import { createInterface } from "node:readline"
import { Worker } from "node:worker_threads"
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
  glob: z
    .string()
    .describe("Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'")
    .optional(),
  ignoreCase: z.boolean().describe("Whether to ignore case sensitivity").optional(),
  literal: z
    .boolean()
    .describe("Whether to treat pattern as literal string instead of regex")
    .optional(),
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

  // 中止必须作为中止语义返回：否则会落入 Node 重扫并因 signal.aborted 得到"No matches found"。
  if (signal?.aborted) {
    return {
      content: [{ type: "text", text: "Search aborted." }],
      details: { error: "aborted" },
    }
  }
  // 达到匹配上限主动 kill（exitCode null）：直接返回已收集结果，不再全量 Node 重扫。
  if (matchLimitReached) {
    return formatGrepOutput(matches, args, searchPath, isDirectory, effectiveLimit, true, options)
  }
  if (spawnFailed || exitCode === null) {
    return undefined
  }
  if (exitCode !== 0 && exitCode !== 1) {
    return {
      content: [
        {
          type: "text",
          text: `ripgrep execution failed: ${stderr.trim() || `exit code ${exitCode}`}`,
        },
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
      notices.push(
        `Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars; use 'read' tool to view full content`,
      )
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

// 纯 Node 降级扫描在 worker 线程执行：灾难性回溯正则不会锁死主进程，超时可 terminate。
const DEFAULT_NODE_SCAN_TIMEOUT_MS = 15_000
const NODE_SCAN_WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads")
const { readFileSync } = require("node:fs")
const { filePaths, pattern, flags, effectiveLimit } = workerData
try {
  const regex = new RegExp(pattern, flags)
  const matches = []
  let matchLimitReached = false
  for (const filePath of filePaths) {
    const lines = readFileSync(filePath, "utf-8").replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n").split("\\n")
    for (let index = 0; index < lines.length; index++) {
      if (!regex.test(lines[index])) continue
      matches.push({ filePath, lineNumber: index + 1, lineText: lines[index] })
      if (matches.length >= effectiveLimit) {
        matchLimitReached = true
        break
      }
    }
    if (matchLimitReached) break
  }
  parentPort.postMessage({ matches, matchLimitReached })
} catch (error) {
  parentPort.postMessage({ error: error && error.message ? error.message : String(error) })
}
`

interface NodeScanResult {
  matches?: MatchEntry[]
  matchLimitReached?: boolean
  timedOut?: boolean
  aborted?: boolean
  error?: string
}

// 在 worker 线程执行 Node 降级扫描；超时/中止直接 terminate，返回明确的终止语义。
const runNodeScanInWorker = (
  payload: { filePaths: string[]; pattern: string; flags: string; effectiveLimit: number },
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<NodeScanResult> => {
  return new Promise<NodeScanResult>((resolve) => {
    const worker = new Worker(NODE_SCAN_WORKER_SOURCE, { eval: true, workerData: payload })
    let settled = false
    let timer: NodeJS.Timeout | undefined
    const finish = (result: NodeScanResult): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      void worker.terminate()
      resolve(result)
    }
    const onAbort = (): void => finish({ aborted: true })
    timer = setTimeout(() => finish({ timedOut: true }), timeoutMs)
    signal?.addEventListener("abort", onAbort, { once: true })
    worker.once("message", (message: NodeScanResult) => finish(message))
    worker.once("error", (error: Error) => finish({ error: error.message }))
    worker.once("exit", (code) => {
      if (!settled && code !== 0) finish({ error: `scan worker exited with code ${code}` })
    })
  })
}

// 纯 Node 降级：递归扫描 + 逐行正则匹配（worker 隔离执行）。
const grepWithNode = async (
  args: GrepArgs,
  searchPath: string,
  isDirectory: boolean,
  effectiveLimit: number,
  signal?: AbortSignal,
  options?: { sessionId?: string; toolCallId?: string },
  scanTimeoutMs: number = DEFAULT_NODE_SCAN_TIMEOUT_MS,
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
  try {
    new RegExp(pattern, flags)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: "text", text: `Invalid regular expression: ${message}` }],
      details: { error: message },
    }
  }

  const scan = await runNodeScanInWorker(
    { filePaths, pattern, flags, effectiveLimit },
    scanTimeoutMs,
    signal,
  )
  if (scan.aborted) {
    return {
      content: [{ type: "text", text: "Search aborted." }],
      details: { error: "aborted" },
    }
  }
  if (scan.timedOut) {
    return {
      content: [
        {
          type: "text",
          text: `Search timed out after ${scanTimeoutMs}ms (possible catastrophic regex backtracking). Simplify the pattern and retry.`,
        },
      ],
      details: { error: "regex_timeout" },
    }
  }
  if (scan.error) {
    return {
      content: [{ type: "text", text: `Search failed: ${scan.error}` }],
      details: { error: scan.error },
    }
  }

  return formatGrepOutput(
    scan.matches ?? [],
    args,
    searchPath,
    isDirectory,
    effectiveLimit,
    scan.matchLimitReached ?? false,
    options,
  )
}

// grep 工具可调参数（测试注入更短/更长的降级扫描超时）。
export interface GrepToolOptions {
  nodeScanTimeoutMs?: number
}

// 创建 grep 工具：优先 rg 降级纯 Node 扫描。
export const createGrepTool = (
  cwd: string,
  sessionDeps?: SessionDeps,
  toolOptions: GrepToolOptions = {},
): AgentTool<typeof grepSchema> => ({
  name: "grep",
  label: "Search contents",
  description: `Search file contents in the project. Supports regex and literal strings, glob filtering, and context lines. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB, with lines over ${GREP_MAX_LINE_LENGTH} chars truncated.`,
  inputSchema: grepSchema,
  execute: async (toolCallId, params, signal) => {
    const searchPath = resolveToCwd(params.path || ".", cwd)

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
    return grepWithNode(
      params,
      searchPath,
      isDirectory,
      effectiveLimit,
      signal,
      options,
      toolOptions.nodeScanTimeoutMs,
    )
  },
})

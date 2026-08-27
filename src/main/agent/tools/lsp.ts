import { readFile } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { LspLocationResult, LspOperation, LspToolDetails } from "@shared/contracts/agent"
import type {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  MarkedString,
  MarkupContent,
  SymbolInformation,
} from "vscode-languageserver-types"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import type { LspManager } from "../lsp/lspManager"
import { displayPath } from "../lsp/server"
import { pathExists, resolveToCwd } from "./path-utils"

// 位置型结果最多展示行数（超出截断并标注省略）。
const MAX_RESULT_ROWS = 50
// 位置型结果提取行签名的最多数（约束文件读取开销）。
const MAX_SIGNATURES = 20
// 行签名最大长度（超出截断）。
const MAX_SIGNATURE_LENGTH = 100

// lsp 工具参数：filePath 相对 cwd；line/character 1-based；workspaceSymbol 需 query。
const lspSchema = z.object({
  operation: z.enum([
    "goToDefinition",
    "findReferences",
    "hover",
    "documentSymbol",
    "workspaceSymbol",
    "goToImplementation",
    "prepareCallHierarchy",
    "incomingCalls",
    "outgoingCalls",
  ]),
  filePath: z.string().describe("File path relative to project root"),
  line: z.number().describe("Line number (1-based)").optional(),
  character: z.number().describe("Character/column number (1-based)").optional(),
  query: z.string().describe("Search query for workspaceSymbol").optional(),
})

export interface LspToolDeps {
  lspManager: LspManager
  getSessionId: () => string | null
  cwd: string
}

// SymbolKind 名称（展示用；未列出的回退数字）。
const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: "file",
  2: "module",
  3: "namespace",
  4: "package",
  5: "class",
  6: "method",
  7: "property",
  8: "field",
  9: "constructor",
  10: "enum",
  11: "interface",
  12: "function",
  13: "variable",
  14: "constant",
  15: "string",
  16: "number",
  17: "boolean",
  18: "array",
  19: "object",
  20: "key",
  21: "null",
  22: "enum member",
  23: "struct",
  24: "event",
  25: "operator",
  26: "type parameter",
}

const kindName = (kind: number): string => SYMBOL_KIND_NAMES[kind] ?? `kind:${kind}`

// 位置 → 结果（LSP 0-based → 1-based；绝对路径）。
const toResult = (
  uri: string,
  line0: number,
  character0: number,
  label: string,
): LspLocationResult => ({
  filePath: fileURLToPath(uri),
  line: line0 + 1,
  character: character0 + 1,
  label,
})

// 按文件缓存行表（同一次调用内去重读取）。
type LineCache = Map<string, string[]>

// 读取目标行内容作为签名（越界/读失败返回空串）。
const readLineSignature = async (
  filePath: string,
  line1: number,
  cache: LineCache,
): Promise<string> => {
  let lines = cache.get(filePath)
  if (!lines) {
    try {
      lines = (await readFile(filePath, "utf8")).split("\n")
    } catch {
      lines = []
    }
    cache.set(filePath, lines)
  }
  const content = lines[line1 - 1]?.trim() ?? ""
  if (!content) return ""
  return content.length > MAX_SIGNATURE_LENGTH
    ? `${content.slice(0, MAX_SIGNATURE_LENGTH)}…`
    : content
}

// 解析 hover 内容为文本（string | MarkupContent | MarkedString | MarkedString[]）。
const hoverText = (hover: Hover): string => {
  const contents = hover.contents
  const toText = (entry: string | MarkupContent | MarkedString): string => {
    if (typeof entry === "string") return entry
    if ("language" in entry) return `\`\`\`${entry.language}\n${entry.value}\n\`\`\``
    return entry.value
  }
  const parts = Array.isArray(contents) ? contents : [contents]
  return parts.map(toText).join("\n\n")
}

// 汇总位置型结果（definition/references/implementation）：每行 `file:line:col|签名`。
const collectLocations = async (
  result: Location | Location[] | LocationLink[] | null,
  cwd: string,
  cache: LineCache,
): Promise<{ results: LspLocationResult[]; lines: string[] }> => {
  const list = result == null ? [] : Array.isArray(result) ? result : [result]
  const shown = list.slice(0, MAX_RESULT_ROWS)
  const results: LspLocationResult[] = []
  const lines: string[] = []
  for (const entry of shown) {
    let uri: string
    let rangeStart: { line: number; character: number }
    if ("targetUri" in entry) {
      const link = entry as LocationLink
      uri = link.targetUri
      rangeStart = (link.targetSelectionRange ?? link.targetRange).start
    } else {
      const location = entry as Location
      uri = location.uri
      rangeStart = location.range.start
    }
    const locationResult = toResult(uri, rangeStart.line, rangeStart.character, "")
    // 位置型结果无自然名称，读行内容作签名（限量，约束 IO）。
    if (results.length < MAX_SIGNATURES) {
      locationResult.label = await readLineSignature(
        locationResult.filePath,
        locationResult.line,
        cache,
      )
    }
    results.push(locationResult)
    lines.push(
      `${displayPath(locationResult.filePath, cwd)}:${locationResult.line}:${locationResult.character}${locationResult.label ? `|${locationResult.label}` : ""}`,
    )
  }
  if (list.length > shown.length) {
    lines.push(`… 等 ${list.length} 处`)
  }
  return { results, lines }
}

// documentSymbol 扁平化（DocumentSymbol 树递归；SymbolInformation 直展）。
const collectDocumentSymbols = async (
  symbols: DocumentSymbol[] | SymbolInformation[] | null,
  filePath: string,
  cwd: string,
): Promise<{ results: LspLocationResult[]; lines: string[] }> => {
  const results: LspLocationResult[] = []
  const lines: string[] = []
  const visitDocumentSymbol = (symbol: DocumentSymbol, indent: number): void => {
    const start = symbol.selectionRange?.start ?? symbol.range.start
    const label = `${symbol.name} (${kindName(symbol.kind)})`
    results.push(toResult(pathToFileURL(filePath).toString(), start.line, start.character, label))
    lines.push(`${"  ".repeat(indent)}${label} [${start.line + 1}:${start.character + 1}]`)
    for (const child of symbol.children ?? []) visitDocumentSymbol(child, indent + 1)
  }
  for (const symbol of symbols ?? []) {
    if ("children" in symbol) {
      visitDocumentSymbol(symbol, 0)
    } else {
      const info = symbol as SymbolInformation
      // vscode-css-language-server 对 @import/@keyframes 等符号不返回 location，跳过。
      if (!info.location) continue
      const start = info.location.range.start
      const label = info.containerName
        ? `${info.name} (${kindName(info.kind)}, ${info.containerName})`
        : `${info.name} (${kindName(info.kind)})`
      results.push(toResult(info.location.uri, start.line, start.character, label))
      lines.push(
        `${displayPath(results[results.length - 1].filePath, cwd)}:${start.line + 1}:${start.character + 1}|${label}`,
      )
    }
  }
  return { results, lines }
}

// callHierarchy 项 → 结果（label = name + detail）。
const collectHierarchyItems = (
  items: CallHierarchyItem[] | null,
  cwd: string,
): { results: LspLocationResult[]; lines: string[] } => {
  const results: LspLocationResult[] = []
  const lines: string[] = []
  for (const item of items ?? []) {
    const start = item.selectionRange?.start ?? item.range.start
    const label = item.detail ? `${item.name} ${item.detail}` : item.name
    const result = toResult(item.uri, start.line, start.character, label)
    results.push(result)
    lines.push(`${displayPath(result.filePath, cwd)}:${result.line}:${result.character}|${label}`)
  }
  return { results, lines }
}

// incoming/outgoing 调用：from/to 项 + 调用点范围。
const collectHierarchyCalls = (
  calls: CallHierarchyIncomingCall[] | CallHierarchyOutgoingCall[] | null,
  cwd: string,
): { results: LspLocationResult[]; lines: string[] } => {
  const results: LspLocationResult[] = []
  const lines: string[] = []
  for (const call of calls ?? []) {
    const item = "from" in call ? call.from : (call as CallHierarchyOutgoingCall).to
    const range = call.fromRanges[0]
    const start = item.selectionRange?.start ?? item.range.start
    const label = item.detail ? `${item.name} ${item.detail}` : item.name
    const result = toResult(item.uri, start.line, start.character, label)
    results.push(result)
    const callPoint = range ? ` (call @${range.start.line + 1}:${range.start.character + 1})` : ""
    lines.push(
      `${displayPath(result.filePath, cwd)}:${result.line}:${result.character}|${label}${callPoint}`,
    )
  }
  return { results, lines }
}

// 创建 lsp 工具：只读语义检索（定义/引用/hover/符号/调用层级），无副作用。
export const createLspTool = ({
  lspManager: manager,
  getSessionId,
  cwd,
}: LspToolDeps): AgentTool<typeof lspSchema> => ({
  name: "lsp",
  label: "LSP semantic search",
  description:
    "Language Server Protocol (LSP) semantic search within project. Supports goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls. filePath is relative to project root, line/character are 1-based.",
  inputSchema: lspSchema,
  executionMode: "parallel",
  execute: async (_toolCallId, params) => {
    const absolutePath = resolveToCwd(params.filePath, cwd)
    if (!absolutePath) {
      return {
        content: [
          {
            type: "text",
            text: `lsp ${params.operation} access denied to path outside project root: ${params.filePath}`,
          },
        ],
        details: { refused: true },
      }
    }
    const sessionId = getSessionId()
    if (!sessionId) {
      return {
        content: [{ type: "text", text: `lsp ${params.operation} failed: no active session` }],
        details: { refused: true },
      }
    }
    // 文档型操作（workspaceSymbol 为 workspace 级检索，不需目标文件存在）：
    // 目标文件不存在时显式报错，避免静默返回"0 处"误导。
    if (params.operation !== "workspaceSymbol" && !(await pathExists(absolutePath))) {
      return {
        content: [
          {
            type: "text",
            text: `lsp ${params.operation} failed: file not found: ${params.filePath}`,
          },
        ],
        details: {
          operation: params.operation,
          filePath: absolutePath,
          line: params.line ?? 1,
          character: params.character ?? 1,
          query: params.query,
          results: [],
          error: `File not found: ${params.filePath}`,
        },
      }
    }
    const clientResult = await manager.getClient(sessionId, absolutePath, cwd)
    if ("error" in clientResult) {
      return {
        content: [{ type: "text", text: `lsp ${params.operation} failed: ${clientResult.error}` }],
        details: {
          operation: params.operation,
          filePath: absolutePath,
          line: params.line ?? 1,
          character: params.character ?? 1,
          query: params.query,
          results: [],
          error: clientResult.error,
        },
      }
    }
    const client = clientResult.client
    // LSP 位置 0-based；工具参数 1-based。
    const line0 = Math.max(0, (params.line ?? 1) - 1)
    const character0 = Math.max(0, (params.character ?? 1) - 1)
    const cache: LineCache = new Map()
    try {
      let text: string
      let details: LspToolDetails
      switch (params.operation) {
        case "goToDefinition": {
          const collected = await collectLocations(
            await client.goToDefinition(absolutePath, line0, character0),
            cwd,
            cache,
          )
          text = formatRows(
            "goToDefinition",
            collected,
            `${params.filePath}:${line0 + 1}:${character0 + 1}`,
          )
          details = baseDetails(params, absolutePath, collected.results)
          break
        }
        case "findReferences": {
          const collected = await collectLocations(
            await client.findReferences(absolutePath, line0, character0),
            cwd,
            cache,
          )
          text = formatRows(
            "findReferences",
            collected,
            `${params.filePath}:${line0 + 1}:${character0 + 1}`,
          )
          details = baseDetails(params, absolutePath, collected.results)
          break
        }
        case "goToImplementation": {
          const collected = await collectLocations(
            await client.goToImplementation(absolutePath, line0, character0),
            cwd,
            cache,
          )
          text = formatRows(
            "goToImplementation",
            collected,
            `${params.filePath}:${line0 + 1}:${character0 + 1}`,
          )
          details = baseDetails(params, absolutePath, collected.results)
          break
        }
        case "hover": {
          const hover = await client.hover(absolutePath, line0, character0)
          const body = hover ? hoverText(hover) : ""
          text = body
            ? `hover ${params.filePath}:${line0 + 1}:${character0 + 1}:\n${body}`
            : `hover ${params.filePath}:${line0 + 1}:${character0 + 1}: (No content)`
          details = { ...baseDetails(params, absolutePath, []), text: body || undefined }
          break
        }
        case "documentSymbol": {
          const collected = await collectDocumentSymbols(
            await client.documentSymbol(absolutePath),
            absolutePath,
            cwd,
          )
          text = formatRows("documentSymbol", collected, params.filePath)
          details = baseDetails(params, absolutePath, collected.results)
          break
        }
        case "workspaceSymbol": {
          const query = params.query ?? ""
          const collected = await collectWorkspaceSymbols(
            await client.workspaceSymbol(query, absolutePath),
            cwd,
          )
          text = formatRows(`workspaceSymbol ${query ? `"${query}" ` : ""}`, collected, "")
          details = { ...baseDetails(params, absolutePath, collected.results), query }
          break
        }
        case "prepareCallHierarchy": {
          const collected = collectHierarchyItems(
            await client.prepareCallHierarchy(absolutePath, line0, character0),
            cwd,
          )
          text = formatRows(
            "prepareCallHierarchy",
            collected,
            `${params.filePath}:${line0 + 1}:${character0 + 1}`,
          )
          details = baseDetails(params, absolutePath, collected.results)
          break
        }
        case "incomingCalls": {
          const collected = collectHierarchyCalls(
            await client.incomingCalls(absolutePath, line0, character0),
            cwd,
          )
          text = formatRows(
            "incomingCalls",
            collected,
            `${params.filePath}:${line0 + 1}:${character0 + 1}`,
          )
          details = baseDetails(params, absolutePath, collected.results)
          break
        }
        case "outgoingCalls": {
          const collected = collectHierarchyCalls(
            await client.outgoingCalls(absolutePath, line0, character0),
            cwd,
          )
          text = formatRows(
            "outgoingCalls",
            collected,
            `${params.filePath}:${line0 + 1}:${character0 + 1}`,
          )
          details = baseDetails(params, absolutePath, collected.results)
          break
        }
      }
      return { content: [{ type: "text", text }], details }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const details: LspToolDetails = baseDetails(params, absolutePath, [])
      details.error = message
      return {
        content: [{ type: "text", text: `lsp ${params.operation} failed: ${message}` }],
        details,
      }
    }
  },
})

// workspaceSymbol 结果收集：符号自带 location，无需额外文件参数。
const collectWorkspaceSymbols = async (
  symbols: SymbolInformation[] | null,
  cwd: string,
): Promise<{ results: LspLocationResult[]; lines: string[] }> => {
  const results: LspLocationResult[] = []
  const lines: string[] = []
  for (const info of symbols ?? []) {
    // workspace/symbol 同样可能返回缺 location 的符号，跳过避免崩溃。
    if (!info.location) continue
    const start = info.location.range.start
    const label = info.containerName
      ? `${info.name} (${kindName(info.kind)}, ${info.containerName})`
      : `${info.name} (${kindName(info.kind)})`
    const result = toResult(info.location.uri, start.line, start.character, label)
    results.push(result)
    lines.push(`${displayPath(result.filePath, cwd)}:${result.line}:${result.character}|${label}`)
  }
  return { results, lines }
}

// 汇总文本：`操作名 [target]:` + 每行结果。
const formatRows = (
  operation: LspOperation | string,
  collected: { results: LspLocationResult[]; lines: string[] },
  target: string,
): string => {
  const count = collected.results.length
  const header = `${operation}${target ? ` ${target}` : ""} (${count} locations)`
  return count === 0 ? `${header}: No results found` : `${header}:\n${collected.lines.join("\n")}`
}

// 基础 details（后续按操作补 text/query）。
const baseDetails = (
  params: z.infer<typeof lspSchema>,
  absolutePath: string,
  results: LspLocationResult[],
): LspToolDetails => ({
  operation: params.operation as LspOperation,
  filePath: absolutePath,
  line: params.line ?? 1,
  character: params.character ?? 1,
  results,
})

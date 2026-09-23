import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { DomUtils, parseDocument } from "htmlparser2"

// 注入上限（按完整 <memory> 元素为单位截断，绝不切断元素）。
export const MAX_MEMORY_INJECT_LINES = 200
export const MAX_MEMORY_INJECT_BYTES = 25 * 1024 // 25 KB

/** 记忆作用域：user 跨项目持久化（~/.lx/memory），project 仅当前仓库（<cwd>/.lx/memory）。 */
export type MemoryScope = "user" | "project"

/** 记忆类型：只允许用户习惯与可复用工作流程。 */
export type MemoryType = "user" | "workflow"

/** save 缺省的 scope 归属：习惯跨项目，流程归仓库。 */
export const DEFAULT_MEMORY_SCOPE_FOR_TYPE: Record<MemoryType, MemoryScope> = {
  user: "user",
  workflow: "project",
}

/** 单条记忆。 */
export interface MemoryEntry {
  type: MemoryType
  name: string
  content: string
}

/** 单作用域记忆存储快照。 */
export interface MemoryStore {
  scope: MemoryScope
  path: string
  entries: MemoryEntry[]
}

/** user 作用域根目录覆盖（测试注入；缺省 ~/.lx/memory）。 */
export interface MemoryStoreOptions {
  userRoot?: string
}

const EMPTY_MEMORY_XML = "<memories>\n</memories>\n"

function isMemoryType(value: string | undefined): value is MemoryType {
  return value === "user" || value === "workflow"
}

export function resolveMemoryRoot(
  scope: MemoryScope,
  cwd?: string,
  options?: MemoryStoreOptions,
): string | null {
  if (scope === "user") return options?.userRoot ?? join(homedir(), ".lx", "memory")
  return cwd ? join(cwd, ".lx", "memory") : null
}

export function resolveMemoryFilePath(
  scope: MemoryScope,
  cwd?: string,
  options?: MemoryStoreOptions,
): string | null {
  const root = resolveMemoryRoot(scope, cwd, options)
  return root ? join(root, "memory.xml") : null
}

/** 旧版分层记忆（MEMORY.md + notes/）一次性清理；不留兼容路径。 */
function wipeLegacyMemory(root: string): void {
  const legacyIndex = join(root, "MEMORY.md")
  const legacyNotes = join(root, "notes")
  if (existsSync(legacyIndex)) rmSync(legacyIndex, { force: true })
  if (existsSync(legacyNotes)) rmSync(legacyNotes, { recursive: true, force: true })
}

/** 确保存储文件存在（顺带清理旧格式）；返回文件路径。 */
export function ensureMemoryFile(
  scope: MemoryScope,
  cwd?: string,
  options?: MemoryStoreOptions,
): string | null {
  const filePath = resolveMemoryFilePath(scope, cwd, options)
  if (!filePath) return null
  const root = dirname(filePath)
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  wipeLegacyMemory(root)
  if (!existsSync(filePath)) writeFileSync(filePath, EMPTY_MEMORY_XML, "utf-8")
  return filePath
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;")
}

/** 解析记忆 XML；根元素非法时返回 null（视为损坏）。 */
export function parseMemoryXml(raw: string): MemoryEntry[] | null {
  const document = parseDocument(raw, { xmlMode: true })
  const root = document.children.find((node) => node.type === "tag" && node.name === "memories")
  if (!root || root.type !== "tag") return null

  const entries: MemoryEntry[] = []
  for (const child of root.children) {
    if (child.type !== "tag" || child.name !== "memory") continue
    const name = child.attribs.name?.trim()
    if (!isMemoryType(child.attribs.type) || !name) continue
    entries.push({ type: child.attribs.type, name, content: DomUtils.textContent(child).trim() })
  }
  return entries
}

export function serializeMemoryEntries(entries: MemoryEntry[]): string {
  const lines: string[] = ["<memories>"]
  for (const entry of entries) {
    lines.push(`  <memory type="${entry.type}" name="${escapeXmlAttribute(entry.name)}">`)
    lines.push(escapeXmlText(entry.content))
    lines.push("  </memory>")
  }
  lines.push("</memories>")
  return lines.join("\n") + "\n"
}

export function readMemoryStore(
  scope: MemoryScope,
  cwd?: string,
  options?: MemoryStoreOptions,
): MemoryStore | null {
  const filePath = resolveMemoryFilePath(scope, cwd, options)
  if (!filePath || !existsSync(filePath)) return null
  try {
    const entries = parseMemoryXml(readFileSync(filePath, "utf-8"))
    if (!entries) return null
    return { scope, path: filePath, entries }
  } catch {
    return null
  }
}

/** 损坏文件备份为 memory.xml.corrupt-<时间戳>；成功返回备份路径。 */
function backupCorruptMemoryFile(filePath: string): string | null {
  const backupPath = `${filePath}.corrupt-${Date.now()}`
  try {
    renameSync(filePath, backupPath)
    return backupPath
  } catch {
    return null
  }
}

export interface WritableMemoryStore {
  store: MemoryStore
  /** 原文件损坏时非空：备份路径。 */
  backupPath?: string
}

/** 工具写入前的存储准备：文件缺失则创建；损坏则备份后重置。 */
export function ensureWritableMemoryStore(
  scope: MemoryScope,
  cwd?: string,
  options?: MemoryStoreOptions,
): WritableMemoryStore | null {
  const filePath = ensureMemoryFile(scope, cwd, options)
  if (!filePath) return null

  const store = readMemoryStore(scope, cwd, options)
  if (store) return { store }

  const backupPath = backupCorruptMemoryFile(filePath)
  if (!backupPath) return null
  writeFileSync(filePath, EMPTY_MEMORY_XML, "utf-8")
  return { store: { scope, path: filePath, entries: [] }, backupPath }
}

export interface TruncatedMemory {
  entries: MemoryEntry[]
  truncated: boolean
}

export function truncateMemoryEntries(entries: MemoryEntry[]): TruncatedMemory {
  const kept: MemoryEntry[] = []
  let lines = 0
  let bytes = 0

  for (const entry of entries) {
    const serialized = serializeMemoryEntries([entry])
    const entryLines = serialized.split("\n").length
    const entryBytes = Buffer.byteLength(serialized, "utf-8")
    if (
      lines + entryLines > MAX_MEMORY_INJECT_LINES ||
      bytes + entryBytes > MAX_MEMORY_INJECT_BYTES
    ) {
      return { entries: kept, truncated: true }
    }
    kept.push(entry)
    lines += entryLines
    bytes += entryBytes
  }

  return { entries: kept, truncated: false }
}

function formatStoreBlock(store: MemoryStore): string {
  const { entries, truncated } = truncateMemoryEntries(store.entries)
  let xml = serializeMemoryEntries(entries)
  if (truncated) {
    xml = xml.replace(
      "</memories>",
      `  <!-- memory truncated: use the memory tool action "view" for full content -->\n</memories>`,
    )
  }
  return `<${store.scope}_memory>\n${xml}</${store.scope}_memory>`
}

/** 加载当前会话可见的记忆作用域（文件缺失或损坏时跳过）。 */
export function loadMemoryStores(cwd?: string, options?: MemoryStoreOptions): MemoryStore[] {
  const stores: MemoryStore[] = []
  const userStore = readMemoryStore("user", cwd, options)
  if (userStore) stores.push(userStore)
  const projectStore = readMemoryStore("project", cwd, options)
  if (projectStore) stores.push(projectStore)
  return stores
}

// 常驻指导语：只沉淀用户习惯与可复用流程，明确拒绝一次性/任务型内容。
const MEMORY_GUIDANCE = [
  "<memory_guidance>",
  "1. Save a memory ONLY when it captures a durable user habit or a repeatable workflow:",
  '   - type "user": preferences, communication style, coding conventions the user insists on.',
  '   - type "workflow": repeatable multi-step processes (test, build, release, commit, environment setup).',
  "2. NEVER save one-off or task-specific content: bug fixes, review findings, current task progress,",
  "   architecture facts, or anything derivable from the codebase. When in doubt, do NOT save.",
  '3. Scope: habits that apply across projects use "user" scope; repository-specific workflows use "project" scope.',
  "4. Before saving, search for an existing memory with the same name and update it instead of duplicating.",
  '5. Delete outdated memories with action "delete" when the user asks to forget or a memory is stale.',
  "6. Never mention memory operations or citations in your reply; answer cleanly and directly.",
  "</memory_guidance>",
].join("\n")

/** 组装 auto_memory 提示词块（指导语常驻；无记忆时仅指导语）。 */
export function formatMemoryPrompt(stores: MemoryStore[]): string {
  const blocks = stores.map(formatStoreBlock).join("\n")
  const body = blocks ? `${blocks}\n\n` : ""
  return `<auto_memory>\n${body}${MEMORY_GUIDANCE}\n</auto_memory>`
}

import { isInsideMarkdownCodeFence } from "@/features/markdown/commands/markdownBlockCommands"

// 页面预设变量条目。
export interface MarkdownVariableEntry {
  name: string
  value: string
}

// 页面变量触发信息。
export interface MarkdownVariableTrigger {
  fragment: string
  start: number
  triggerChar: "$" | "¥"
}

// 变量触发正则：以边界或行首开头的 $ 或 ¥ 符号，后接合法标识符字符。
const MARKDOWN_VARIABLE_TRIGGER_RE = /(^|[\s.,;:!?，。；：！？、…()[\]{}])([$¥])([A-Za-z0-9_.-]*)$/u

/**
 * 判断光标位置是否处于文档顶部的 YAML Frontmatter 区域内。
 */
export const isInsideMarkdownFrontmatter = (docText: string, cursor: number): boolean => {
  if (!docText.startsWith("---")) return false
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(docText)
  if (!match) return false
  return cursor < match[0].length
}

/**
 * 解析光标前文本末尾的 $ 或 ¥ 变量触发片段；
 * 位于代码围栏或 Frontmatter 内时不触发。
 */
export const getMarkdownVariableTrigger = (
  prefix: string,
  docText = prefix,
): MarkdownVariableTrigger | null => {
  if (isInsideMarkdownCodeFence(prefix) || isInsideMarkdownFrontmatter(docText, prefix.length)) {
    return null
  }

  const match = MARKDOWN_VARIABLE_TRIGGER_RE.exec(prefix)
  if (!match) return null

  const triggerChar = match[2] as "$" | "¥"
  const fragment = match[3] ?? ""
  const start = prefix.length - fragment.length - 1

  return { fragment, start, triggerChar }
}

/**
 * 解析 Markdown 文本顶部的 frontmatter (--- \n ... \n ---)。
 * 支持：
 * 1. vars: 根块下的平级变量直接以 $name 导出；
 * 2. 其他自定义分组（如 temp:、env:）按点号命名空间（如 $temp.status）导出；
 * 3. 支持深层嵌套字典路径（如 $a.b.c）与多行 YAML 块 (| 或 >)；
 * 4. 容忍编辑过程中的未闭合行与注释。
 */
export const parseMarkdownVariables = (docText: string): MarkdownVariableEntry[] => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(docText)
  if (!match) return []

  const rawYaml = match[1]
  const entries: MarkdownVariableEntry[] = []
  const lines = rawYaml.split(/\r?\n/)
  const stack: Array<{ key: string; indent: number }> = []

  let currentKey: string | null = null
  let currentValueLines: string[] = []
  let isMultiLine = false
  let multiLineIndent = -1

  const flushCurrent = (): void => {
    if (currentKey !== null) {
      const val = isMultiLine
        ? currentValueLines.join("\n").trimEnd()
        : currentValueLines.join(" ").trim()
      entries.push({ name: currentKey, value: val })
      currentKey = null
      currentValueLines = []
      isMultiLine = false
      multiLineIndent = -1
    }
  }

  const getFullKey = (key: string): string => {
    const parts: string[] = []
    let startIdx = 0
    if (stack.length > 0 && stack[0].key === "vars") {
      startIdx = 1
    }
    for (let i = startIdx; i < stack.length; i++) {
      parts.push(stack[i].key)
    }
    parts.push(key)
    return parts.join(".")
  }

  for (const line of lines) {
    const indentMatch = line.match(/^(\s*)/)
    const indent = indentMatch ? indentMatch[1].length : 0

    if (isMultiLine) {
      if (line.trim() === "") {
        currentValueLines.push("")
        continue
      }
      if (indent > multiLineIndent) {
        currentValueLines.push(line.slice(multiLineIndent + 2))
        continue
      }
      flushCurrent()
    }

    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    let rawVal = line.slice(colonIndex + 1).trim()

    if (!key || /^[#\-]/.test(key)) continue

    flushCurrent()

    if (rawVal === "" || rawVal.startsWith("#")) {
      stack.push({ key, indent })
      continue
    }

    const fullKey = getFullKey(key)

    if (rawVal === "|" || rawVal === ">" || rawVal === "|-" || rawVal === ">-") {
      isMultiLine = true
      multiLineIndent = indent
      currentKey = fullKey
      currentValueLines = []
    } else {
      if (rawVal.startsWith('"')) {
        const endQuote = rawVal.indexOf('"', 1)
        if (endQuote !== -1) {
          rawVal = rawVal.slice(1, endQuote)
        }
      } else if (rawVal.startsWith("'")) {
        const endQuote = rawVal.indexOf("'", 1)
        if (endQuote !== -1) {
          rawVal = rawVal.slice(1, endQuote)
        }
      } else {
        const commentIdx = rawVal.indexOf("#")
        if (commentIdx !== -1) {
          rawVal = rawVal.slice(0, commentIdx).trim()
        }
      }
      entries.push({ name: fullKey, value: rawVal })
    }
  }

  flushCurrent()
  return entries
}

/**
 * 判断查询是否为候选名的子序列（不区分大小写）。
 */
const isSubsequence = (query: string, value: string): boolean => {
  let queryIndex = 0
  for (const char of value) {
    if (char === query[queryIndex]) queryIndex += 1
    if (queryIndex === query.length) return true
  }
  return queryIndex === query.length
}

/**
 * 按键名与预设内容模糊过滤变量候选列表。
 */
export const filterMarkdownVariables = (
  variables: readonly MarkdownVariableEntry[],
  query: string,
): MarkdownVariableEntry[] => {
  const cleanQuery = query.trim().toLowerCase()
  if (cleanQuery.length === 0) return [...variables]

  return variables
    .map((variable) => {
      const name = variable.name.toLowerCase()
      const value = variable.value.toLowerCase()
      let score = 0

      if (name === cleanQuery) score = 100
      else if (name.startsWith(cleanQuery)) score = 90
      else if (name.includes(cleanQuery)) score = 70
      else if (isSubsequence(cleanQuery, name)) score = 50
      else if (value.includes(cleanQuery)) score = 30

      return { variable, score }
    })
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .map((item) => item.variable)
}

/**
 * 剥离文本顶部的 Frontmatter 声明，仅返回正文。
 */
export const stripMarkdownFrontmatter = (content: string): string =>
  content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").replace(/^\r?\n+/, "")

/**
 * 获取变量条目的命名空间标签（有前缀取点号前第一段如 temp，无前缀取 var）。
 */
export const getVariableTag = (name: string): string => {
  const dotIndex = name.indexOf(".")
  return dotIndex !== -1 ? name.slice(0, dotIndex) : "var"
}

/**
 * 格式化变量的预览文本：
 * 多行值采用 """ 内容 """ 包裹并转为单行，单行值直接展示。
 */
export const formatVariablePreview = (value: string): string => {
  const isMultiLine = value.includes("\n")
  const flattened = value.replace(/\r?\n/g, " ").trim()
  if (!flattened) return ""
  return isMultiLine ? `"""${flattened}"""` : flattened
}

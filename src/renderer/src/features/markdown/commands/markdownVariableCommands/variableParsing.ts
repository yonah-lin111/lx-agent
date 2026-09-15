import {
  MARKDOWN_PRESET_END_RE,
  MARKDOWN_PRESET_START_RE,
} from "@/features/markdown/commands/markdownBlockCommands"
import type { MarkdownVariableEntry } from "./types"
import { MARKDOWN_VAR_TEMPLATE_END_RE, MARKDOWN_VAR_TEMPLATE_START_RE } from "./variableSyntax"

/**
 * 从多段 YAML 文本中解析变量条目。
 * 支持：
 * - 单行双引号/单引号：key: "val"
 * - 多行三引号：
 *     key:
 *       """
 *       line 1
 *       """
 * - 标准多行块：key: | 或 key: >
 * - 多层级点号缩进栈展开与 vars: 平级映射
 */
export const parseYamlVariableContent = (rawYaml: string): MarkdownVariableEntry[] => {
  const lines = rawYaml.split(/\r?\n/)
  const entries: MarkdownVariableEntry[] = []
  const stack: Array<{ key: string; indent: number }> = []

  let currentKey: string | null = null
  let currentValueLines: string[] = []
  let isMultiLine = false
  let isTripleQuotes = false
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
      isTripleQuotes = false
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

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    const indentMatch = line.match(/^(\s*)/)
    const indent = indentMatch ? indentMatch[1].length : 0

    if (isTripleQuotes) {
      if (line.trim() === '"""') {
        flushCurrent()
        continue
      }
      const stripped = indent > multiLineIndent ? line.slice(multiLineIndent) : line.trimStart()
      currentValueLines.push(stripped)
      continue
    }

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
    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("+++") ||
      trimmed.startsWith("---")
    )
      continue

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    let rawVal = line.slice(colonIndex + 1).trim()

    if (!key || /^[#\-]/.test(key) || key.startsWith("+++")) continue

    flushCurrent()

    const fullKey = getFullKey(key)

    if (rawVal === "" || rawVal.startsWith("#")) {
      let nextLineIdx = idx + 1
      while (nextLineIdx < lines.length && lines[nextLineIdx].trim() === "") nextLineIdx++
      if (nextLineIdx < lines.length && lines[nextLineIdx].trim().startsWith('"""')) {
        const nextIndent = (lines[nextLineIdx].match(/^(\s*)/) || ["", ""])[1].length
        isMultiLine = true
        isTripleQuotes = true
        multiLineIndent = nextIndent
        currentKey = fullKey
        currentValueLines = []
        idx = nextLineIdx
        continue
      }

      stack.push({ key, indent })
      continue
    }

    if (rawVal.startsWith('"""')) {
      isMultiLine = true
      isTripleQuotes = true
      multiLineIndent = indent
      currentKey = fullKey
      currentValueLines = []
      const rest = rawVal.slice(3).trim()
      if (rest.endsWith('"""') && rest.length >= 3) {
        entries.push({ name: fullKey, value: rest.slice(0, -3).trim() })
        isMultiLine = false
        isTripleQuotes = false
        currentKey = null
      } else if (rest.length > 0) {
        currentValueLines.push(rest)
      }
      continue
    }

    if (rawVal === "|" || rawVal === ">" || rawVal === "|-" || rawVal === ">-") {
      isMultiLine = true
      multiLineIndent = indent
      currentKey = fullKey
      currentValueLines = []
      continue
    }

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

  flushCurrent()
  return entries
}

/**
 * 解析 Markdown 文本中的全部变量。
 * 优先从 $$$ varTemplate 模板块中解析；未找到时向下兼容顶部的 --- 声明。
 */
export const parseMarkdownVariables = (docText: string): MarkdownVariableEntry[] => {
  const lines = docText.split(/\r?\n/)
  const varBlocks: string[] = []
  let inBlock = false
  let currentBlockLines: string[] = []

  for (const line of lines) {
    if (!inBlock) {
      if (MARKDOWN_VAR_TEMPLATE_START_RE.test(line)) {
        inBlock = true
        currentBlockLines = []
      }
    } else {
      if (MARKDOWN_VAR_TEMPLATE_END_RE.test(line)) {
        inBlock = false
        varBlocks.push(currentBlockLines.join("\n"))
        currentBlockLines = []
      } else {
        currentBlockLines.push(line)
      }
    }
  }

  if (varBlocks.length > 0) {
    const allEntries: MarkdownVariableEntry[] = []
    for (const block of varBlocks) {
      allEntries.push(...parseYamlVariableContent(block))
    }
    return allEntries
  }

  // 兜底兼容旧版 --- Frontmatter
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(docText)
  if (match) {
    return parseYamlVariableContent(match[1])
  }

  return []
}

/**
 * 获取变量在补全命令面板右侧显示的标签前缀（如 temp.status -> temp，api_host -> var）。
 */
export const getVariableTag = (name: string): string => {
  if (name.includes(".")) {
    return name.split(".")[0]
  }
  return "var"
}

/**
 * 清理 $$$ 模板块内部未修改的条目（橡皮擦功能）：
 * 移除值为空（""、空 """）或仍保留默认占位符 "var" 的条目。
 */
export const cleanVarBlockItems = (blockContent: string): string => {
  const lines = blockContent.split(/\r?\n/)
  const preservedLines: string[] = []
  let idx = 0
  let inPresetSubblock = false

  while (idx < lines.length) {
    const line = lines[idx]

    if (MARKDOWN_PRESET_START_RE.test(line)) {
      inPresetSubblock = true
      preservedLines.push(line)
      idx++
      continue
    }

    if (inPresetSubblock) {
      if (MARKDOWN_PRESET_END_RE.test(line)) {
        inPresetSubblock = false
      }
      preservedLines.push(line)
      idx++
      continue
    }

    // 1. 明确的单行占位符 / 空值：key: "var" | key: 'var' | key: "" | key: ''
    const singleMatch = line.match(/^(\s*)([A-Za-z0-9_.-]+)\s*:\s*(?:"var"|'var'|""|'')\s*$/)
    if (singleMatch) {
      idx++
      continue
    }

    // 2. 键后无行内值的形式：key:
    const emptyValueMatch = line.match(/^(\s*)([A-Za-z0-9_.-]+)\s*:\s*$/)
    if (emptyValueMatch) {
      const indent = emptyValueMatch[1].length

      // 检查后续是否紧跟三引号多行块
      if (idx + 1 < lines.length && lines[idx + 1].trim() === '"""') {
        let j = idx + 2
        const subLines: string[] = []
        while (j < lines.length && lines[j].trim() !== '"""') {
          subLines.push(lines[j].trim())
          j++
        }
        if (j < lines.length && lines[j].trim() === '"""') {
          const isUnfilled =
            subLines.length === 0 ||
            (subLines.length === 1 && (subLines[0] === "var" || subLines[0] === ""))
          if (isUnfilled) {
            idx = j + 1
            continue
          }
          preservedLines.push(line)
          for (let k = idx + 1; k <= j; k++) {
            preservedLines.push(lines[k])
          }
          idx = j + 1
          continue
        }
      }

      // 检查后续是否有缩进子行（父命名空间）
      let hasIndentedChild = false
      for (let k = idx + 1; k < lines.length; k++) {
        if (!lines[k].trim()) continue
        const nextIndent = (lines[k].match(/^(\s*)/) || ["", ""])[1].length
        if (nextIndent > indent) {
          hasIndentedChild = true
        }
        break
      }

      if (!hasIndentedChild) {
        idx++
        continue
      }
    }

    preservedLines.push(line)
    idx++
  }

  // 第二轮检查：剔除由于子项被清理而变空的父级命名空间（如 temp: 后面已经没有任何缩进项了）
  const result: string[] = []
  for (let i = 0; i < preservedLines.length; i++) {
    const current = preservedLines[i]
    const headerMatch = current.match(/^(\s*)([A-Za-z0-9_.-]+)\s*:\s*$/)
    if (headerMatch) {
      if (i + 1 < preservedLines.length && preservedLines[i + 1].trim() === '"""') {
        result.push(current)
        continue
      }

      let hasChild = false
      for (let j = i + 1; j < preservedLines.length; j++) {
        const next = preservedLines[j]
        if (!next.trim()) continue
        const nextIndent = (next.match(/^(\s*)/) || ["", ""])[1].length
        if (nextIndent > headerMatch[1].length) {
          hasChild = true
        }
        break
      }
      if (!hasChild) continue
    }
    result.push(current)
  }

  return result.join("\n")
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
 * 剥离文本中的变量定义块（$$$ ... $$$ 及旧版 --- Frontmatter），仅返回正文。
 */
export const stripMarkdownVariableBlocks = (content: string): string => {
  let stripped = content
  // 移除全部 $$$ varTemplate 块
  stripped = stripped.replace(
    /^\s*\$\$\$\s*(?:varTemplate(?:\s+--start)?(?:\s+「title:[^」\n]*」)?)?\s*[\s\S]*?^\s*\$\$\$(?:\s+varTemplate\s+--end|\s+--end)?\s*$/gm,
    "",
  )
  // 移除旧版 --- Frontmatter
  stripped = stripped.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
  return stripped.replace(/^\r?\n+/, "")
}

// 保持旧接口名称兼容
export const stripMarkdownFrontmatter = stripMarkdownVariableBlocks

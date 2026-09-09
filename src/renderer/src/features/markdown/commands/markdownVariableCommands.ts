import type { Text } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import {
  getMarkdownTemplateBlockEndLine,
  getMarkdownTemplateBlockStartLine,
  isInsideMarkdownCodeFence,
  MARKDOWN_PRESET_END_RE,
  MARKDOWN_PRESET_START_RE,
} from "@/features/markdown/commands/markdownBlockCommands"

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

// 冒号命令触发信息。
export interface MarkdownColonTrigger {
  indent: string
  key: string
  from: number
  to: number
}

// 变量模板块（$$$ varTemplate --start 「title:...」 ... $$$ varTemplate --end）。
export const MARKDOWN_VAR_TEMPLATE_START_RE =
  /^\s*\$\$\$\s*(?:varTemplate(?:\s+--start)?(?:\s+「title:[^」\n]*」)?)?\s*$/
export const MARKDOWN_VAR_TEMPLATE_END_RE = /^\s*\$\$\$(?:\s+varTemplate\s+--end|\s+--end)?\s*$/

// 变量触发正则：以边界或行首开头的 $ 或 ¥ 符号，后接合法标识符字符。
const MARKDOWN_VARIABLE_TRIGGER_RE = /(^|[\s.,;:!?，。；：！？、…()[\]{}])([$¥])([A-Za-z0-9_.-]*)$/u

/**
 * 判断光标位置是否处于文档中的 $$$ 变量模板块区域内。
 */
export const isInsideMarkdownVariableBlock = (docText: string, cursor: number): boolean => {
  const lines = docText.split("\n")
  let currentOffset = 0
  let inBlock = false

  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
    const lineEnd = currentOffset + rawLine.length
    if (!inBlock) {
      if (MARKDOWN_VAR_TEMPLATE_START_RE.test(line)) {
        inBlock = true
      }
    } else {
      if (MARKDOWN_VAR_TEMPLATE_END_RE.test(line)) {
        if (cursor <= lineEnd) return true
        inBlock = false
      } else if (cursor >= currentOffset && cursor <= lineEnd + 1) {
        return true
      }
    }
    currentOffset = lineEnd + 1
  }
  return false
}

/**
 * 判断光标位置是否处于 $$$ 变量块中的 """ 多行字符串内部。
 */
export const isInsideMarkdownVarMultilineString = (docText: string, cursor: number): boolean => {
  if (!isInsideMarkdownVariableBlock(docText, cursor)) {
    return false
  }

  const lines = docText.split("\n")
  let currentOffset = 0
  let inVarBlock = false
  let inTriple = false

  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
    const lineEnd = currentOffset + rawLine.length

    if (!inVarBlock) {
      if (MARKDOWN_VAR_TEMPLATE_START_RE.test(line)) {
        inVarBlock = true
      }
    } else {
      if (MARKDOWN_VAR_TEMPLATE_END_RE.test(line)) {
        inVarBlock = false
        inTriple = false
      } else {
        if (inTriple) {
          const closeIdx = line.indexOf('"""')
          if (closeIdx !== -1) {
            const closeEnd = currentOffset + closeIdx + 3
            if (cursor <= closeEnd && cursor >= currentOffset) {
              return true
            }
            inTriple = false
          } else {
            if (cursor >= currentOffset && cursor <= lineEnd + 1) {
              return true
            }
          }
        } else {
          const openIdx = line.indexOf('"""')
          if (openIdx !== -1) {
            const closeIdx = line.indexOf('"""', openIdx + 3)
            if (closeIdx !== -1) {
              const openEnd = currentOffset + openIdx + 3
              const closeStart = currentOffset + closeIdx
              if (cursor >= openEnd && cursor <= closeStart) {
                return true
              }
            } else {
              const openEnd = currentOffset + openIdx + 3
              if (cursor >= openEnd && cursor <= lineEnd + 1) {
                return true
              }
              inTriple = true
            }
          }
        }
      }
    }

    currentOffset = lineEnd + 1
  }

  return false
}

/**
 * 兼容旧方法：判断光标位置是否处于顶部 frontmatter 或 $$$ 变量块内。
 */
export const isInsideMarkdownFrontmatter = (docText: string, cursor: number): boolean => {
  if (isInsideMarkdownVariableBlock(docText, cursor)) return true
  if (!docText.startsWith("---")) return false
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(docText)
  if (!match) return false
  return cursor < match[0].length
}

/**
 * 解析光标前文本末尾的 $ 或 ¥ 变量触发片段；
 * 位于代码围栏或旧版 frontmatter 内时不触发。$$$ 模板块内部允许输入 ¥ / $ 触发联想。
 */
export const getMarkdownVariableTrigger = (
  prefix: string,
  docText = prefix,
): MarkdownVariableTrigger | null => {
  if (isInsideMarkdownCodeFence(prefix) || isInsideMarkdownFrontmatter(docText, prefix.length)) {
    // 如果在旧版 frontmatter 内则不触发；但在 $$$ 变量块内部允许输入 ¥ / $ 触发联想
    if (!isInsideMarkdownVariableBlock(docText, prefix.length)) {
      return null
    }
  }

  // 避免在 $$$ 开始行或结束行本身误触
  const lastNewline = prefix.lastIndexOf("\n")
  const currentLinePrefix = lastNewline === -1 ? prefix : prefix.slice(lastNewline + 1)
  if (currentLinePrefix.trimStart().startsWith("$$$")) {
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
 * 检查当前光标所在行末尾是否刚输入了冒号（: 或 ：），用于在 $$$ 模板块内唤起单行/多行菜单。
 */
export const getMarkdownColonTrigger = (
  lineText: string,
  cursorInLine: number,
  lineFrom: number,
): MarkdownColonTrigger | null => {
  const prefix = lineText.slice(0, cursorInLine)
  const match = /^(\s*)([A-Za-z0-9_.-]+)\s*([:：])$/.exec(prefix)
  if (!match) return null

  return {
    indent: match[1],
    key: match[2],
    from: lineFrom,
    to: lineFrom + cursorInLine,
  }
}

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

export interface VarBlockTabTarget {
  type: "key" | "value"
  from: number
  to: number
  lineNum: number
}

/**
 * 变量模板块 Tab / Shift-Tab 智能选区跳转：
 * - 位于冒号左侧（key）：跳转并选中右侧内容（"" 或 """ """ 内部）
 * - 位于右侧内容区：跳转并选中下一个条目的 key
 * - 到达末尾循环跳回首个 key；Shift-Tab 反向循环
 */
export const handleMarkdownVarBlockTab = (view: EditorView, direction: 1 | -1 = 1): boolean => {
  const doc = view.state.doc
  const cursor = view.state.selection.main.head
  const docText = doc.toString()

  if (!isInsideMarkdownVariableBlock(docText, cursor)) {
    return false
  }

  const curLine = doc.lineAt(cursor)
  if (curLine.text.trim() === "") {
    return false
  }

  let startLineNum = -1
  for (let l = curLine.number; l >= 1; l--) {
    const text = doc.line(l).text
    if (MARKDOWN_VAR_TEMPLATE_START_RE.test(text)) {
      startLineNum = l
      break
    }
    if (l < curLine.number && MARKDOWN_VAR_TEMPLATE_END_RE.test(text)) {
      break
    }
  }
  if (startLineNum === -1) return false

  let endLineNum = -1
  for (let l = curLine.number; l <= doc.lines; l++) {
    const text = doc.line(l).text
    if (MARKDOWN_VAR_TEMPLATE_END_RE.test(text)) {
      endLineNum = l
      break
    }
  }
  if (endLineNum === -1 || curLine.number >= endLineNum) return false

  const targets: VarBlockTabTarget[] = []
  let l = startLineNum + 1

  while (l < endLineNum) {
    const line = doc.line(l)
    const text = line.text
    const trimmed = text.trim()

    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      l++
      continue
    }

    const kvMatch = /^(\s*)([A-Za-z0-9_.-]+)\s*(:)(.*)$/.exec(text)
    if (kvMatch) {
      const indent = kvMatch[1]
      const key = kvMatch[2]
      const rest = kvMatch[4]
      const keyStart = line.from + indent.length
      const keyEnd = keyStart + key.length
      targets.push({ type: "key", from: keyStart, to: keyEnd, lineNum: l })

      const colonIndex = text.indexOf(":", indent.length + key.length)
      const trimmedRest = rest.trim()

      if (trimmedRest.startsWith('"""')) {
        if (trimmedRest.length >= 6 && trimmedRest.endsWith('"""')) {
          const first = line.from + text.indexOf('"""', colonIndex + 1)
          const last = line.from + text.lastIndexOf('"""')
          targets.push({ type: "value", from: first + 3, to: last, lineNum: l })
          l++
          continue
        }
        let closeLine = -1
        for (let nextL = l + 1; nextL < endLineNum; nextL++) {
          if (doc.line(nextL).text.includes('"""')) {
            closeLine = nextL
            break
          }
        }
        if (closeLine !== -1) {
          const valFrom = line.from + text.indexOf('"""', colonIndex + 1) + 3
          const valTo = doc.line(closeLine).from + doc.line(closeLine).text.indexOf('"""')
          targets.push({ type: "value", from: valFrom, to: valTo, lineNum: l })
          l = closeLine + 1
          continue
        }
      } else if (trimmedRest === "" || trimmedRest === "|" || trimmedRest === ">") {
        if (
          l + 1 < endLineNum &&
          doc
            .line(l + 1)
            .text.trim()
            .startsWith('"""')
        ) {
          const openLine = l + 1
          let closeLine = -1
          for (let nextL = openLine + 1; nextL < endLineNum; nextL++) {
            if (doc.line(nextL).text.trim().startsWith('"""')) {
              closeLine = nextL
              break
            }
          }
          if (closeLine !== -1) {
            if (closeLine > openLine + 1) {
              const firstContentLine = doc.line(openLine + 1)
              const lastContentLine = doc.line(closeLine - 1)
              const firstIndent = firstContentLine.text.search(/\S/)
              const valFrom = firstContentLine.from + (firstIndent !== -1 ? firstIndent : 0)
              const valTo = lastContentLine.to
              targets.push({ type: "value", from: valFrom, to: valTo, lineNum: l })
            } else {
              const emptyPos = doc.line(openLine).to + 1
              targets.push({ type: "value", from: emptyPos, to: emptyPos, lineNum: l })
            }
            l = closeLine + 1
            continue
          }
        }
      } else {
        const quoteMatch = rest.match(/(["'])([\s\S]*?)\1/)
        if (quoteMatch && quoteMatch.index !== undefined) {
          const qStart =
            line.from + colonIndex + 1 + text.slice(colonIndex + 1).indexOf(quoteMatch[1])
          const valFrom = qStart + 1
          const valTo = valFrom + quoteMatch[2].length
          targets.push({ type: "value", from: valFrom, to: valTo, lineNum: l })
        } else if (trimmedRest) {
          const cmtIdx = trimmedRest.search(/\s+(#|\/\/)/)
          const cleanVal = cmtIdx !== -1 ? trimmedRest.slice(0, cmtIdx).trimEnd() : trimmedRest
          const valStart = line.from + colonIndex + 1 + text.slice(colonIndex + 1).indexOf(cleanVal)
          targets.push({
            type: "value",
            from: valStart,
            to: valStart + cleanVal.length,
            lineNum: l,
          })
        }
      }
    }
    l++
  }

  if (targets.length === 0) return false

  const selFrom = view.state.selection.main.from
  const selTo = view.state.selection.main.to
  let curTargetIdx = -1

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    if (
      (selFrom === t.from && selTo === t.to) ||
      (selFrom >= t.from && selTo <= t.to && t.from !== t.to)
    ) {
      curTargetIdx = i
      break
    }
  }

  if (curTargetIdx === -1) {
    const lineText = curLine.text
    const colonIdx = lineText.indexOf(":")
    if (colonIdx !== -1) {
      const colonPos = curLine.from + colonIdx
      if (cursor <= colonPos) {
        curTargetIdx = targets.findIndex((t) => t.lineNum === curLine.number && t.type === "key")
      } else {
        curTargetIdx = targets.findIndex((t) => t.lineNum === curLine.number && t.type === "value")
      }
    }
  }

  if (curTargetIdx === -1) {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      if (cursor >= t.from && cursor <= t.to) {
        curTargetIdx = i
        break
      }
    }
  }

  if (curTargetIdx === -1) {
    if (direction === 1) {
      const next = targets.findIndex((t) => t.from > cursor)
      curTargetIdx = next === -1 ? targets.length - 1 : (next - 1 + targets.length) % targets.length
    } else {
      const prev = [...targets].reverse().findIndex((t) => t.to < cursor)
      curTargetIdx = prev === -1 ? 0 : targets.length - 1 - prev
    }
  }

  const nextTargetIdx = (curTargetIdx + direction + targets.length) % targets.length
  const nextTarget = targets[nextTargetIdx]

  view.dispatch({
    selection: { anchor: nextTarget.from, head: nextTarget.to },
    scrollIntoView: true,
  })
  return true
}

export interface MarkdownVarBlockActionResult {
  success: boolean
  isAlreadyTop?: boolean
  changes?: { from: number; to: number; insert: string }[]
}

/**
 * 将指定变量模板块的内容合并至文档中最顶部的变量模板块。
 * 若当前块已是文档中的第一个变量模板块，则返回 isAlreadyTop: true。
 */
export const mergeMarkdownVarBlock = (
  doc: Text,
  startLine: number,
  endLine: number,
): MarkdownVarBlockActionResult => {
  const safeStartLine = Math.max(0, Math.min(startLine, doc.lines - 1))
  const safeEndLine = endLine < startLine ? doc.lines - 1 : Math.min(endLine, doc.lines - 1)

  // 寻找文档中出现的首个 $$$ 变量模板块
  let firstBlockStart = -1
  let firstBlockEnd = -1
  for (let l = 0; l < doc.lines; l++) {
    const text = doc.line(l + 1).text
    if (firstBlockStart === -1) {
      if (MARKDOWN_VAR_TEMPLATE_START_RE.test(text)) {
        firstBlockStart = l
      }
    } else {
      if (MARKDOWN_VAR_TEMPLATE_END_RE.test(text)) {
        firstBlockEnd = l
        break
      }
    }
  }

  // 若文档中无变量模板块，或当前块即是首个变量模板块
  if (firstBlockStart === -1 || safeStartLine <= firstBlockStart) {
    return { success: false, isAlreadyTop: true }
  }

  // 提取当前块内部的键值对内容
  const innerLines: string[] = []
  for (let l = safeStartLine + 1; l < safeEndLine; l++) {
    innerLines.push(doc.line(l + 1).text)
  }
  const rawContent = innerLines.join("\n").trim()

  const currentStartDocLine = doc.line(safeStartLine + 1)
  const currentEndDocLine = doc.line(safeEndLine + 1)
  let delFrom = currentStartDocLine.from
  let delTo = currentEndDocLine.to

  if (delTo < doc.length) {
    delTo += 1
    if (delTo < doc.length && doc.sliceString(delTo, delTo + 1) === "\n") {
      delTo += 1
    }
  } else if (delFrom > 0) {
    delFrom -= 1
    if (delFrom > 0 && doc.sliceString(delFrom - 1, delFrom) === "\n") {
      delFrom -= 1
    }
  }

  const topInsertPos = doc.line(firstBlockEnd + 1).from
  const changes: { from: number; to: number; insert: string }[] = []
  if (rawContent) {
    changes.push({ from: topInsertPos, to: topInsertPos, insert: rawContent + "\n" })
  }
  changes.push({ from: delFrom, to: delTo, insert: "" })

  return { success: true, changes }
}

/**
 * 将指定变量模板块移动至顶部变量模板块组下方（间隔一行）。
 * 若顶部无任何变量模板块，则移动至文档最顶部（位置 0）。
 * 若当前块已属于顶部变量模板块组，则返回 isAlreadyTop: true。
 */
export const moveMarkdownVarBlockToTop = (
  doc: Text,
  startLine: number,
  endLine: number,
): MarkdownVarBlockActionResult => {
  const safeStartLine = Math.max(0, Math.min(startLine, doc.lines - 1))
  const safeEndLine = endLine < startLine ? doc.lines - 1 : Math.min(endLine, doc.lines - 1)

  // 扫描顶部连续的变量模板块组（从第 0 行开始，忽略开头的纯空行）
  let lastTopBlockEnd = -1
  let l = 0
  while (l < doc.lines) {
    const text = doc.line(l + 1).text
    if (text.trim() === "") {
      l++
      continue
    }
    if (MARKDOWN_VAR_TEMPLATE_START_RE.test(text)) {
      let blockEnd = -1
      for (let j = l + 1; j < doc.lines; j++) {
        if (MARKDOWN_VAR_TEMPLATE_END_RE.test(doc.line(j + 1).text)) {
          blockEnd = j
          break
        }
      }
      if (blockEnd !== -1) {
        lastTopBlockEnd = blockEnd
        l = blockEnd + 1
        continue
      }
    }
    break
  }

  // 若当前块已经在顶部连续变量块组中
  if (lastTopBlockEnd !== -1 && safeStartLine <= lastTopBlockEnd) {
    return { success: false, isAlreadyTop: true }
  }

  const currentStartDocLine = doc.line(safeStartLine + 1)
  const currentEndDocLine = doc.line(safeEndLine + 1)
  const blockText = doc.sliceString(currentStartDocLine.from, currentEndDocLine.to)

  let delFrom = currentStartDocLine.from
  let delTo = currentEndDocLine.to

  if (delTo < doc.length) {
    delTo += 1
    if (delTo < doc.length && doc.sliceString(delTo, delTo + 1) === "\n") {
      delTo += 1
    }
  } else if (delFrom > 0) {
    delFrom -= 1
    if (delFrom > 0 && doc.sliceString(delFrom - 1, delFrom) === "\n") {
      delFrom -= 1
    }
  }

  if (lastTopBlockEnd === -1) {
    // 顶部没有任何变量块，移动至文档最顶部（第 0 行）
    return {
      success: true,
      changes: [
        { from: 0, to: 0, insert: blockText + (doc.length > 0 ? "\n\n" : "") },
        { from: delFrom, to: delTo, insert: "" },
      ],
    }
  }

  // 顶部存在变量块组，插入到该组最后一块的下方，间隔一行
  const lastTopDocLine = doc.line(lastTopBlockEnd + 1)
  const insertPos = lastTopDocLine.to
  const nextLineNum = lastTopBlockEnd + 2
  const hasEmptyLineAfter = nextLineNum <= doc.lines && doc.line(nextLineNum).text.trim() === ""
  const insertText = "\n\n" + blockText + (hasEmptyLineAfter ? "" : "\n")

  return {
    success: true,
    changes: [
      { from: insertPos, to: insertPos, insert: insertText },
      { from: delFrom, to: delTo, insert: "" },
    ],
  }
}

export interface ApplyMarkdownTemplatePresetResult {
  from: number
  to: number
  insert: string
  cursor?: number
}

/**
 * 在 &&& 模板块内复用 $$$ 变量模板块中预设的各字段内容。
 * 按照模版类型（如 add, bug, refactor 等）匹配 preset 下的对应字段；
 * 未在特定类型下找到时回退到 preset.common 或根 preset，并将单行/多行预设规范填充到当前模板字段中。
 */
export const applyMarkdownTemplatePreset = (
  docText: string,
  cursor: number,
): ApplyMarkdownTemplatePresetResult | null => {
  const startLineNum = getMarkdownTemplateBlockStartLine(docText, cursor)
  const endLineNum = getMarkdownTemplateBlockEndLine(docText, cursor)
  if (startLineNum === null || endLineNum === null || startLineNum >= endLineNum) {
    return null
  }

  const lines = docText.split("\n")
  const startLineIndex = startLineNum - 1
  const endLineIndex = endLineNum - 1

  let offset = 0
  let blockFrom = 0
  let blockTo = 0

  for (let i = 0; i < lines.length; i++) {
    if (i === startLineIndex) {
      blockFrom = offset
    }
    if (i === endLineIndex) {
      blockTo = offset + lines[i].length
      break
    }
    offset += lines[i].length + 1
  }

  const startLineText = lines[startLineIndex]
  const startMatch = startLineText.match(/^\s*&&&\s+([A-Za-z]\w*)/)
  const rawCommand = startMatch ? startMatch[1] : ""
  const templateType = rawCommand.replace(/Template$/i, "").toLowerCase()

  const allVariables = parseMarkdownVariables(docText)
  const varMap = new Map<string, string>()
  for (const v of allVariables) {
    varMap.set(v.name.toLowerCase(), v.value)
  }

  const isBlankOrDefaultPresetValue = (val: string): boolean => {
    const trimmed = val.trim()
    if (!trimmed) return true
    if (trimmed === '""' || trimmed === "''" || trimmed === "var") return true
    if (trimmed === "-" || trimmed === "- var") return true
    return false
  }

  const getPresetValue = (fieldName: string): string | null => {
    const f = fieldName.toLowerCase()
    const candidates = [
      `preset.${templateType}.${f}`,
      `preset.${rawCommand.toLowerCase()}.${f}`,
      `${templateType}.${f}`,
      `${rawCommand.toLowerCase()}.${f}`,
      `preset.common.${f}`,
      `preset.${f}`,
      f,
    ]
    for (const c of candidates) {
      const val = varMap.get(c)
      if (val !== undefined && !isBlankOrDefaultPresetValue(val)) {
        return val
      }
    }
    return null
  }

  const innerLines = lines
    .slice(startLineIndex + 1, endLineIndex)
    .filter((l) => !/^\s*\/applyPreset\b/i.test(l))

  const newInnerLines: string[] = []
  let i = 0

  while (i < innerLines.length) {
    const line = innerLines[i]
    const fieldMatch = line.match(/^(\s*-\s+)([A-Za-z0-9_]+)(\s*:\s*)(.*)$/)

    if (!fieldMatch) {
      newInnerLines.push(line)
      i++
      continue
    }

    const prefix = fieldMatch[1]
    const fieldName = fieldMatch[2]
    const colon = fieldMatch[3]
    const presetVal = getPresetValue(fieldName)

    if (presetVal === null) {
      newInnerLines.push(line)
      i++
      continue
    }

    const isListOrMulti =
      presetVal.includes("\n") ||
      presetVal.trim().startsWith("- ") ||
      presetVal.trim().startsWith("* ")

    if (!isListOrMulti) {
      newInnerLines.push(`${prefix}${fieldName}${colon}${presetVal.trim()}`)
      i++
      while (i < innerLines.length && /^\s*-\s*(?:var)?\s*$/.test(innerLines[i])) {
        i++
      }
    } else {
      newInnerLines.push(`${prefix}${fieldName}${colon}`)
      i++
      while (i < innerLines.length && /^\s*-\s*(?:var)?\s*$/.test(innerLines[i])) {
        i++
      }
      const rawValLines = presetVal.split(/\r?\n/)
      for (const vl of rawValLines) {
        const trimmed = vl.trim()
        if (!trimmed) {
          newInnerLines.push("")
        } else if (trimmed.startsWith("- ")) {
          newInnerLines.push(`  ${trimmed}`)
        } else if (trimmed.startsWith("* ")) {
          newInnerLines.push(`  ${trimmed}`)
        } else {
          newInnerLines.push(`  - ${trimmed}`)
        }
      }
    }
  }

  const newBlockLines = [lines[startLineIndex], ...newInnerLines, lines[endLineIndex]]
  const insert = newBlockLines.join("\n")

  return {
    from: blockFrom,
    to: blockTo,
    insert,
    cursor: blockFrom + lines[startLineIndex].length + 1,
  }
}

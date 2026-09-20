import type { MarkdownColonTrigger } from "./types"

// 变量模板块（$$$ varTemplate --start 「title:...」 ... $$$ varTemplate --end）。
export const MARKDOWN_VAR_TEMPLATE_START_RE =
  /^\s*\$\$\$\s*(?:varTemplate(?:\s+--start)?(?:\s+「title:[^」\n]*」)?)?\s*$/
export const MARKDOWN_VAR_TEMPLATE_END_RE = /^\s*\$\$\$(?:\s+varTemplate\s+--end|\s+--end)?\s*$/

/**
 * 判断光标位置是否处于文档中的 $$$ 变量模板块区域内。
 * 范围取 [开始行行首, 结束行行尾]（含两个边界行）；块上方或下方的光标一律视为块外。
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
        if (cursor >= currentOffset && cursor <= lineEnd) return true
      }
    } else {
      if (MARKDOWN_VAR_TEMPLATE_END_RE.test(line)) {
        if (cursor >= currentOffset && cursor <= lineEnd) return true
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

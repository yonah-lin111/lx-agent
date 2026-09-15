import { stripMarkdownSlashCommands } from "@/features/markdown/commands/markdownSlashCommands"
import {
  stripEmptyTemplateItems,
  stripMarkdownTemplateComments,
} from "@/features/markdown/utils/markdownRenderer"
import {
  isMarkdownLogEndLine,
  isMarkdownLogStartLine,
  isMarkdownSuppleEndLine,
  isMarkdownSuppleStartLine,
  isMarkdownTemplateEndLine,
  isMarkdownTemplateStartLine,
} from "./markers"

/**
 * 提取当前光标位置目标模版块用于复制的正文内容：
 * 规则：
 * 1. 若光标在 logTemplate 内部：
 *    - 不能单独复制，向上查找其所属的父级模版块（若在 suppleTemplate 内则复制该 suppleTemplate；若在 &&& 块内则复制该 &&& 块）。
 *    - 若不属于任何父模版块，返回 null。
 * 2. 若光标在非 logTemplate 的 +++ 模版块（如 suppleTemplate）内部：
 *    - 只复制该 +++ 模版块的内容；
 *    - 如果该 +++ 模版块内包含直接子级 logTemplate，连同其内容一起复制，并移除 +++ logTemplate 起止标记行。
 * 3. 若光标在 &&& 模版块中（且非任何可单独复制的 +++ 模版块内部）：
 *    - 复制该 &&& 模版块的内容；
 *    - 剔除其中的 suppleTemplate 及其嵌套内容；
 *    - 保留直接位于 &&& 块内部的 logTemplate 内容，并移除 +++ logTemplate 起止标记行。
 * 4. 光标不在任何上述模版块内，返回 null。
 */
export const getMarkdownTemplateBlockCopyText = (text: string, position: number): string | null => {
  const lines = text.split("\n")
  const boundedPosition = Math.min(Math.max(position, 0), text.length)

  // 1. 扫描行区间与层级
  // 计算每一行的 offset 范围
  let currentOffset = 0
  const lineRanges = lines.map((line) => {
    const from = currentOffset
    const to = currentOffset + line.length
    currentOffset = to + 1 // + \n
    return { from, to, line }
  })

  // 识别所有 block 的范围
  interface BlockRange {
    type: "template" | "supple" | "log"
    startLine: number
    endLine: number
    startOffset: number
    endOffset: number
    bodyStartOffset: number
    bodyEndOffset: number
    parentIndex: number | null
  }

  const blocks: BlockRange[] = []
  const templateStack: { line: number; offset: number; bodyStart: number }[] = []
  const suppleStack: {
    line: number
    offset: number
    bodyStart: number
    parentTemplateIdx: number | null
  }[] = []
  const logStack: { line: number; offset: number; bodyStart: number; parentIdx: number | null }[] =
    []

  for (let i = 0; i < lineRanges.length; i++) {
    const { from, to, line } = lineRanges[i]
    if (isMarkdownTemplateStartLine(line)) {
      templateStack.push({ line: i, offset: from, bodyStart: to + 1 })
    } else if (isMarkdownTemplateEndLine(line)) {
      const start = templateStack.pop()
      if (start) {
        blocks.push({
          type: "template",
          startLine: start.line,
          endLine: i,
          startOffset: start.offset,
          endOffset: to,
          bodyStartOffset: start.bodyStart,
          bodyEndOffset: from > 0 ? from - 1 : from,
          parentIndex: null,
        })
      }
    } else if (isMarkdownSuppleStartLine(line)) {
      const parentTemplateIdx = templateStack.length > 0 ? templateStack.length - 1 : null
      suppleStack.push({ line: i, offset: from, bodyStart: to + 1, parentTemplateIdx })
    } else if (isMarkdownSuppleEndLine(line)) {
      const start = suppleStack.pop()
      if (start) {
        blocks.push({
          type: "supple",
          startLine: start.line,
          endLine: i,
          startOffset: start.offset,
          endOffset: to,
          bodyStartOffset: start.bodyStart,
          bodyEndOffset: from > 0 ? from - 1 : from,
          parentIndex: null, // 稍后统一计算或关联
        })
      }
    } else if (isMarkdownLogStartLine(line)) {
      logStack.push({ line: i, offset: from, bodyStart: to + 1, parentIdx: null })
    } else if (isMarkdownLogEndLine(line)) {
      const start = logStack.pop()
      if (start) {
        blocks.push({
          type: "log",
          startLine: start.line,
          endLine: i,
          startOffset: start.offset,
          endOffset: to,
          bodyStartOffset: start.bodyStart,
          bodyEndOffset: from > 0 ? from - 1 : from,
          parentIndex: null,
        })
      }
    }
  }

  // 辅助函数：处理父级（无论是 template 还是 supple）复制内容
  // 规则：
  // 1. 移除子 supple 块；
  // 2. 保留子 log 块内容（移除 +++ 标记行）；
  // 3. 移除未填写的空 item、注释行及斜杠命令（与右上角复制按钮逻辑保持一致）。
  const formatBlockContent = (bodyLines: string[]): string => {
    const kept: string[] = []
    let inChildSupple = false

    for (const l of bodyLines) {
      if (isMarkdownSuppleStartLine(l)) {
        inChildSupple = true
        continue
      }
      if (inChildSupple) {
        if (isMarkdownSuppleEndLine(l)) {
          inChildSupple = false
        }
        continue
      }
      // 剔除 log 块的 +++ 起止标记行，保留其内容
      if (isMarkdownLogStartLine(l) || isMarkdownLogEndLine(l)) {
        continue
      }
      kept.push(l)
    }

    return stripEmptyTemplateItems(
      stripMarkdownTemplateComments(stripMarkdownSlashCommands(kept.join("\n"))),
    )
  }

  // 检查光标落入哪个最内层的块
  // 查找包含 boundedPosition 的所有 block
  const enclosingBlocks = blocks.filter(
    (b) => boundedPosition >= b.startOffset && boundedPosition <= b.endOffset,
  )

  if (enclosingBlocks.length === 0) {
    return null
  }

  // 按范围大小升序，最内层在前
  enclosingBlocks.sort((a, b) => a.endOffset - a.startOffset - (b.endOffset - b.startOffset))

  const innermost = enclosingBlocks[0]

  if (innermost.type === "log") {
    // logTemplate 不能单独复制，寻找其直接父模版块
    // 父模版块可能是 supple，也可能是 template
    const parent = enclosingBlocks.find((b) => b !== innermost)
    if (!parent) return null

    // 提取 parent 的 bodyLines
    const parentBodyLines = lines.slice(parent.startLine + 1, parent.endLine)
    return formatBlockContent(parentBodyLines)
  }

  if (innermost.type === "supple") {
    // 处于 supple 内部：只复制该 supple 块的内容
    // 如果内部包含 logTemplate，剔除 +++ 标记，保留 log 内容
    const suppleBodyLines = lines.slice(innermost.startLine + 1, innermost.endLine)
    return formatBlockContent(suppleBodyLines)
  }

  if (innermost.type === "template") {
    // 处于 &&& 模板块内部且不在子 supple / log 中
    const templateBodyLines = lines.slice(innermost.startLine + 1, innermost.endLine)
    return formatBlockContent(templateBodyLines)
  }

  return null
}

/**
 * 提取文本中 position 所在模板块的正文（不含 &&& 标记行）；不在模板块内返回 null。
 * 光标位于开始行、正文或结束行自身均视为处于该块内。
 */
export const getMarkdownTemplateBlockContent = (text: string, position: number): string | null => {
  const lines = text.split("\n")
  const boundedPosition = Math.min(Math.max(position, 0), text.length)
  let activeStartOffset: number | null = null
  let activeBodyStart: number | null = null
  let currentOffset = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineStart = currentOffset
    const lineEnd = lineStart + line.length + 1

    if (isMarkdownTemplateStartLine(line)) {
      activeStartOffset = lineStart
      activeBodyStart = lineEnd
    } else if (isMarkdownTemplateEndLine(line)) {
      if (activeStartOffset !== null && activeBodyStart !== null) {
        if (boundedPosition >= activeStartOffset && boundedPosition <= lineEnd) {
          return text.slice(activeBodyStart, lineStart)
        }
      }
      activeStartOffset = null
      activeBodyStart = null
    }

    currentOffset = lineEnd
  }

  if (
    activeStartOffset !== null &&
    activeBodyStart !== null &&
    boundedPosition >= activeStartOffset
  ) {
    return text.slice(activeBodyStart)
  }

  return null
}

/**
 * 返回 position 所在模板块开始行的行号（1-based）；光标位于开始行自身时返回该行；不在模板块内返回 null。
 */
export const getMarkdownTemplateBlockStartLine = (
  text: string,
  position: number,
): number | null => {
  const lines = text.split("\n")
  const boundedPosition = Math.min(Math.max(position, 0), text.length)
  let offset = 0
  let startLine: number | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const lineStart = offset
    const lineEnd = offset + lines[index].length + 1
    if (isMarkdownTemplateStartLine(lines[index])) startLine = index + 1
    if (boundedPosition >= lineStart && boundedPosition < lineEnd) return startLine
    if (isMarkdownTemplateEndLine(lines[index])) startLine = null
    offset = lineEnd
  }

  return startLine
}

/**
 * 返回 position 所在 supple 补充块结束行的行号（1-based）；不在 supple 块内或块未闭合返回 null。
 * 光标位于开始行、正文或结束行自身均返回所属块的结束行。
 */
export const getMarkdownSuppleBlockEndLine = (text: string, position: number): number | null => {
  const lines = text.split("\n")
  const boundedPosition = Math.min(Math.max(position, 0), text.length)
  let offset = 0
  let startOffset: number | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const lineStart = offset
    const lineContentEnd = lineStart + lines[index].length
    const lineEnd = lineContentEnd + 1

    if (isMarkdownSuppleStartLine(lines[index])) {
      startOffset = lineStart
    } else if (isMarkdownSuppleEndLine(lines[index])) {
      if (startOffset !== null && boundedPosition >= startOffset && boundedPosition <= lineEnd) {
        return index + 1
      }
      startOffset = null
    }

    offset = lineEnd
  }

  return null
}

/**
 * 返回 position 所在模板块结束行的行号（1-based）；不在模板块内或块未闭合返回 null。
 * 光标位于开始行、正文或结束行自身均返回所属块的结束行。
 */
export const getMarkdownTemplateBlockEndLine = (text: string, position: number): number | null => {
  const lines = text.split("\n")
  const boundedPosition = Math.min(Math.max(position, 0), text.length)
  let offset = 0
  let startOffset: number | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const lineStart = offset
    const lineContentEnd = lineStart + lines[index].length
    const lineEnd = lineContentEnd + 1

    if (isMarkdownTemplateStartLine(lines[index])) {
      startOffset = lineStart
    } else if (isMarkdownTemplateEndLine(lines[index])) {
      if (startOffset !== null && boundedPosition >= startOffset && boundedPosition <= lineEnd) {
        return index + 1
      }
      startOffset = null
    }

    offset = lineEnd
  }

  return null
}

import type { Text } from "@codemirror/state"
import type { MarkdownVarBlockActionResult } from "./types"
import { MARKDOWN_VAR_TEMPLATE_END_RE, MARKDOWN_VAR_TEMPLATE_START_RE } from "./variableSyntax"

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

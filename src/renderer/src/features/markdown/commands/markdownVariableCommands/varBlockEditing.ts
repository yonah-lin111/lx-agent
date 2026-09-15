import type { EditorView } from "@codemirror/view"
import type { VarBlockTabTarget } from "./types"
import {
  isInsideMarkdownVariableBlock,
  MARKDOWN_VAR_TEMPLATE_END_RE,
  MARKDOWN_VAR_TEMPLATE_START_RE,
} from "./variableSyntax"

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

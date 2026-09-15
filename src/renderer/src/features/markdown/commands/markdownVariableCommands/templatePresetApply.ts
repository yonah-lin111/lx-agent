import {
  getMarkdownTemplateBlockEndLine,
  getMarkdownTemplateBlockStartLine,
} from "@/features/markdown/commands/markdownBlockCommands"
import type { ApplyMarkdownTemplatePresetResult } from "./types"
import { parseMarkdownVariables } from "./variableParsing"

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

  const cursorLineNum = docText.slice(0, cursor).split("\n").length
  const cursorLineIndex = cursorLineNum - 1

  const innerLines = lines.slice(startLineIndex + 1, endLineIndex).map((l, idx) => {
    const originalLineIndex = startLineIndex + 1 + idx
    if (originalLineIndex === cursorLineIndex) {
      if (/^\s*\/[a-zA-Z0-9_-]*\s*$/i.test(l) || /^\s*\/applyPreset\b/i.test(l)) {
        return ""
      }
    }
    if (/^\s*\/applyPreset\b/i.test(l)) {
      return ""
    }
    return l
  })

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

  let targetCursor = blockFrom
  const targetLineIdxInNewBlock = Math.min(
    Math.max(0, cursorLineIndex - startLineIndex),
    newBlockLines.length - 1,
  )
  if (targetLineIdxInNewBlock === 0) {
    targetCursor = blockFrom + newBlockLines[0].length + 1
  } else {
    for (let k = 0; k < targetLineIdxInNewBlock; k++) {
      targetCursor += newBlockLines[k].length + 1
    }
  }

  return {
    from: blockFrom,
    to: blockTo,
    insert,
    cursor: targetCursor,
  }
}

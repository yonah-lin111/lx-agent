import type { AgentDiff, AgentDiffLine, DiffLinePart } from "@shared/contracts/agent"
import * as Diff from "diff"

// diff 预览的变更行数上限（超出截断，保留头部变更并标记 truncated）。
export const MAX_DIFF_CHANGED_LINES = 200
// 变更前后展示的上下文行数。
const CONTEXT_LINES = 4

// Unicode 替换符（utf-8 解码无效字节产生），用于二进制检测。
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd)

// 判断内容是否含二进制特征（null 字节或 Unicode 替换符）。
export const isBinaryContent = (content: string): boolean =>
  content.includes("\0") || content.includes(REPLACEMENT_CHAR)

// 变更簇：一段删除行与随后一段新增行的组合（含首行行号）。
interface ChangeCluster {
  removed: string[]
  added: string[]
  oldStart: number
  newStart: number
}

// diff 分段：变更簇或上下文段。
type DiffSegment =
  | ChangeCluster
  | { kind: "context"; lines: string[]; oldStart: number; newStart: number }

// 将 diff 分段原文拆为行（去掉结尾空行）。
const splitRawLines = (value: string): string[] => {
  const raw = value.split("\n")
  if (raw[raw.length - 1] === "") raw.pop()
  return raw
}

// 对单行替换计算词级高亮片段（changed 段渲染为逆色高亮；前导空白不高亮）。
const computeLineParts = (
  oldText: string,
  newText: string,
): { removed: DiffLinePart[]; added: DiffLinePart[] } => {
  const wordDiff = Diff.diffWords(oldText, newText)
  const removed: DiffLinePart[] = []
  const added: DiffLinePart[] = []
  let isFirstRemoved = true
  let isFirstAdded = true

  for (const part of wordDiff) {
    if (part.removed) {
      let value = part.value
      if (isFirstRemoved) {
        const leadingWs = value.match(/^(\s*)/)?.[1] ?? ""
        value = value.slice(leadingWs.length)
        if (leadingWs) removed.push({ text: leadingWs, changed: false })
        isFirstRemoved = false
      }
      if (value) removed.push({ text: value, changed: true })
    } else if (part.added) {
      let value = part.value
      if (isFirstAdded) {
        const leadingWs = value.match(/^(\s*)/)?.[1] ?? ""
        value = value.slice(leadingWs.length)
        if (leadingWs) added.push({ text: leadingWs, changed: false })
        isFirstAdded = false
      }
      if (value) added.push({ text: value, changed: true })
    } else if (part.value) {
      removed.push({ text: part.value, changed: false })
      added.push({ text: part.value, changed: false })
    }
  }

  return { removed, added }
}

// 将 diff 分段转为变更簇与上下文段序列（维护行号推进）。
const buildSegments = (parts: Diff.Change[]): DiffSegment[] => {
  const segments: DiffSegment[] = []
  let oldLineNum = 1
  let newLineNum = 1
  let contextLines: string[] = []
  let contextStartOld = 1
  let contextStartNew = 1
  let currentCluster: ChangeCluster | null = null

  const flushContext = (): void => {
    if (contextLines.length > 0) {
      segments.push({
        kind: "context",
        lines: contextLines,
        oldStart: contextStartOld,
        newStart: contextStartNew,
      })
      contextLines = []
    }
  }

  for (const part of parts) {
    const raw = splitRawLines(part.value)

    if (part.added || part.removed) {
      flushContext()
      if (!currentCluster) {
        currentCluster = {
          removed: [],
          added: [],
          oldStart: oldLineNum,
          newStart: newLineNum,
        }
      }
      if (part.added) {
        currentCluster.added.push(...raw)
        newLineNum += raw.length
      } else {
        currentCluster.removed.push(...raw)
        oldLineNum += raw.length
      }
    } else {
      if (currentCluster) {
        segments.push(currentCluster)
        currentCluster = null
      }
      if (contextLines.length === 0) {
        contextStartOld = oldLineNum
        contextStartNew = newLineNum
      }
      contextLines.push(...raw)
      oldLineNum += raw.length
      newLineNum += raw.length
    }
  }

  if (currentCluster) segments.push(currentCluster)
  flushContext()

  return segments
}

// 渲染一个变更簇（单行替换做词级高亮，否则逐行展示）。
const emitCluster = (lines: AgentDiffLine[], cluster: ChangeCluster): void => {
  if (cluster.removed.length === 1 && cluster.added.length === 1) {
    const { removed: removedParts, added: addedParts } = computeLineParts(
      cluster.removed[0],
      cluster.added[0],
    )
    lines.push({
      type: "del",
      oldLine: cluster.oldStart,
      text: cluster.removed[0],
      parts: removedParts,
    })
    lines.push({
      type: "add",
      newLine: cluster.newStart,
      text: cluster.added[0],
      parts: addedParts,
    })
    return
  }

  for (let i = 0; i < cluster.removed.length; i++) {
    lines.push({ type: "del", oldLine: cluster.oldStart + i, text: cluster.removed[i] })
  }
  for (let i = 0; i < cluster.added.length; i++) {
    lines.push({ type: "add", newLine: cluster.newStart + i, text: cluster.added[i] })
  }
}

// 渲染上下文分段：仅变更附近的窗口，长段以省略行占位。
const emitContextSegment = (
  lines: AgentDiffLine[],
  segment: { lines: string[]; oldStart: number; newStart: number },
  hasLeadingChange: boolean,
  hasTrailingChange: boolean,
): void => {
  if (!hasLeadingChange && !hasTrailingChange) return
  const raw = segment.lines

  if (hasLeadingChange && hasTrailingChange) {
    if (raw.length <= CONTEXT_LINES * 2) {
      for (let i = 0; i < raw.length; i++) {
        lines.push({
          type: "context",
          oldLine: segment.oldStart + i,
          newLine: segment.newStart + i,
          text: raw[i],
        })
      }
    } else {
      for (let i = 0; i < CONTEXT_LINES; i++) {
        lines.push({
          type: "context",
          oldLine: segment.oldStart + i,
          newLine: segment.newStart + i,
          text: raw[i],
        })
      }
      lines.push({ type: "context", text: "…" })
      const skip = raw.length - CONTEXT_LINES * 2
      for (let i = CONTEXT_LINES + skip; i < raw.length; i++) {
        lines.push({
          type: "context",
          oldLine: segment.oldStart + i,
          newLine: segment.newStart + i,
          text: raw[i],
        })
      }
    }
  } else if (hasLeadingChange) {
    const shown = raw.slice(0, CONTEXT_LINES)
    for (let i = 0; i < shown.length; i++) {
      lines.push({
        type: "context",
        oldLine: segment.oldStart + i,
        newLine: segment.newStart + i,
        text: shown[i],
      })
    }
    if (raw.length > shown.length) lines.push({ type: "context", text: "…" })
  } else {
    const skip = Math.max(0, raw.length - CONTEXT_LINES)
    if (skip > 0) lines.push({ type: "context", text: "…" })
    for (let i = skip; i < raw.length; i++) {
      lines.push({
        type: "context",
        oldLine: segment.oldStart + i,
        newLine: segment.newStart + i,
        text: raw[i],
      })
    }
  }
}

/**
 * 生成结构化 diff：行级变更 + 单行替换的词级高亮，变更行超限截断并统计全量。
 */
export const generateStructuredDiff = (oldContent: string, newContent: string): AgentDiff => {
  const segments = buildSegments(Diff.diffLines(oldContent, newContent))
  const lines: AgentDiffLine[] = []

  // 全量变更统计（不受截断影响）。
  let added = 0
  let removed = 0
  for (const segment of segments) {
    if ("kind" in segment) continue
    added += segment.added.length
    removed += segment.removed.length
  }

  let truncated = false
  let emittedChanged = 0

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]

    if ("kind" in segment) {
      emitContextSegment(
        lines,
        segment,
        i > 0 && !("kind" in segments[i - 1]),
        i + 1 < segments.length && !("kind" in segments[i + 1]),
      )
      continue
    }

    const changed = segment.removed.length + segment.added.length
    if (emittedChanged + changed > MAX_DIFF_CHANGED_LINES) {
      truncated = true
      const remaining = MAX_DIFF_CHANGED_LINES - emittedChanged
      // 保留本簇未超限的头部变更行。
      const shownRemoved = Math.min(segment.removed.length, remaining)
      for (let j = 0; j < shownRemoved; j++) {
        lines.push({ type: "del", oldLine: segment.oldStart + j, text: segment.removed[j] })
      }
      const shownAdded = Math.min(segment.added.length, remaining - shownRemoved)
      for (let j = 0; j < shownAdded; j++) {
        lines.push({ type: "add", newLine: segment.newStart + j, text: segment.added[j] })
      }
      break
    }

    emitCluster(lines, segment)
    emittedChanged += changed
  }

  return { lines, truncated, stats: { added, removed } }
}

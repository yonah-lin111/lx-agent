import type { AgentDiff } from "@shared/contracts/agent"
import type { ExecutionStep } from "@/features/agent/types"

// 单个文件的修改统计（同文件多次修改累加）。
export interface FileChangeItem {
  filePath: string
  added: number
  removed: number
  // 打开文件时的定位行（首个变更行；无行号信息时为 1）。
  line: number
}

// 一组文件修改的聚合统计（按消息 / turn）。
export interface FileChangeSummary {
  files: FileChangeItem[]
  totalAdded: number
  totalRemoved: number
}

// 文件回退上下文（sessionId + 该轮用户消息时间戳）。
export interface FileChangeRevertTarget {
  sessionId: string
  userMessageTimestamp: number
}

// 执行流单个轮次的文件修改挂载项。
export interface FlowFileChangesEntry {
  summary: FileChangeSummary
  // 该轮用户消息时间戳（回退快照定位；缺失时不提供回退）。
  userMessageTimestamp?: number
}

// 聚合输入条目（diff 及其路径缺省回退值）。
interface FileChangeEntry {
  diff: AgentDiff
  fallbackPath?: string
}

// 判断是否文件修改工具（edit / write / apply_patch）。
export const isFileChangeTool = (toolName: string): boolean =>
  toolName === "edit" || toolName === "write" || toolName === "apply_patch"

// 解析 diff 内首个变更行的文件行号（优先新增行，其次删除行，缺省 1）。
const resolveFirstChangedLine = (diff: AgentDiff): number => {
  const addedLine = diff.lines.find((line) => line.type === "add" && line.newLine !== undefined)
  if (addedLine?.newLine !== undefined) return addedLine.newLine
  const removedLine = diff.lines.find((line) => line.type === "del" && line.oldLine !== undefined)
  if (removedLine?.oldLine !== undefined) return removedLine.oldLine
  return 1
}

// 聚合文件修改统计（同文件累加增删行、保留首次出现顺序与定位行；无有效条目返回 null）。
export const buildFileChangeSummary = (entries: FileChangeEntry[]): FileChangeSummary | null => {
  const byPath = new Map<string, FileChangeItem>()
  for (const { diff, fallbackPath } of entries) {
    const filePath = diff.fileName?.trim() || fallbackPath?.trim() || ""
    if (!filePath) continue
    const existing = byPath.get(filePath)
    if (existing) {
      existing.added += diff.stats.added
      existing.removed += diff.stats.removed
      continue
    }
    byPath.set(filePath, {
      filePath,
      added: diff.stats.added,
      removed: diff.stats.removed,
      line: resolveFirstChangedLine(diff),
    })
  }
  if (byPath.size === 0) return null
  const files = [...byPath.values()]
  return {
    files,
    totalAdded: files.reduce((sum, file) => sum + file.added, 0),
    totalRemoved: files.reduce((sum, file) => sum + file.removed, 0),
  }
}

// 按 turn 聚合该轮全部写工具 diff，返回"轮次 → 该轮文件修改汇总"映射（轮次末尾统一展示）。
export const buildFlowFileChangesByTurn = (
  steps: ExecutionStep[],
): Map<number, FlowFileChangesEntry> => {
  const entriesByTurn = new Map<number, FileChangeEntry[]>()
  const userTimestampByTurn = new Map<number, number>()

  for (const step of steps) {
    if (step.kind === "user") {
      if (step.timestamp !== undefined) userTimestampByTurn.set(step.turnIndex, step.timestamp)
      continue
    }
    if (step.kind !== "tool" || !step.toolContent) continue
    if (!isFileChangeTool(step.toolContent.toolName)) continue

    const toolContent = step.toolContent
    const diffs = toolContent.diffs?.length
      ? toolContent.diffs
      : toolContent.diff
        ? [toolContent.diff]
        : []
    if (diffs.length === 0) continue

    const args = toolContent.args
    const fallbackPath =
      typeof args.filePath === "string"
        ? args.filePath
        : typeof args.path === "string"
          ? args.path
          : undefined

    const turnEntries = entriesByTurn.get(step.turnIndex) ?? []
    for (const diff of diffs) {
      turnEntries.push({ diff, fallbackPath })
    }
    entriesByTurn.set(step.turnIndex, turnEntries)
  }

  const entryByTurn = new Map<number, FlowFileChangesEntry>()
  for (const [turnIndex, entries] of entriesByTurn) {
    const summary = buildFileChangeSummary(entries)
    if (!summary) continue
    const userMessageTimestamp = userTimestampByTurn.get(turnIndex)
    entryByTurn.set(turnIndex, {
      summary,
      ...(userMessageTimestamp !== undefined ? { userMessageTimestamp } : {}),
    })
  }
  return entryByTurn
}

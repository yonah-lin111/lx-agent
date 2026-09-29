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

// 按工具步骤聚合该 turn 的文件修改，返回"该 turn 最后一个 assistant 步骤 id → 汇总"映射。
export const buildFlowFileChangesByStepId = (
  steps: ExecutionStep[],
): Map<string, FileChangeSummary> => {
  const entriesByTurn = new Map<number, FileChangeEntry[]>()
  // 顺序遍历后写覆盖：得到每个 turn 最后一个 assistant 步骤。
  const lastAssistantStepIdByTurn = new Map<number, string>()

  for (const step of steps) {
    if (step.kind === "assistant") {
      lastAssistantStepIdByTurn.set(step.turnIndex, step.id)
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

  const summaryByStepId = new Map<string, FileChangeSummary>()
  for (const [turnIndex, entries] of entriesByTurn) {
    const assistantStepId = lastAssistantStepIdByTurn.get(turnIndex)
    if (!assistantStepId) continue
    const summary = buildFileChangeSummary(entries)
    if (summary) summaryByStepId.set(assistantStepId, summary)
  }
  return summaryByStepId
}

// 文件修改汇总结构比较（供 memo 判定聚合结果是否变化）。
export const isSameFileChangeSummary = (
  prev: FileChangeSummary | null | undefined,
  next: FileChangeSummary | null | undefined,
): boolean => {
  if (prev === next) return true
  if (!prev && !next) return true
  if (!prev || !next) return false
  if (prev.files.length !== next.files.length) return false
  if (prev.totalAdded !== next.totalAdded || prev.totalRemoved !== next.totalRemoved) return false
  for (let index = 0; index < prev.files.length; index++) {
    const prevFile = prev.files[index]
    const nextFile = next.files[index]
    if (
      prevFile.filePath !== nextFile.filePath ||
      prevFile.added !== nextFile.added ||
      prevFile.removed !== nextFile.removed ||
      prevFile.line !== nextFile.line
    ) {
      return false
    }
  }
  return true
}

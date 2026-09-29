import type { AgentFileRevertMark } from "@shared/contracts/agent"
import { agentSessionService } from "@/services/agentSessionService"
import type { SnapshotFileChange } from "@/services/gitSnapshotService"

// 解析快照变更列表 JSON（损坏返回空数组）。
export const parseSnapshotChanges = (raw: string): SnapshotFileChange[] => {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as SnapshotFileChange[]) : []
  } catch {
    return []
  }
}

/**
 * 收集会话内的回退标记；onlyPending = true 时只取尚未告知 agent 的条目。
 */
const collectRevertMarks = (sessionId: string, onlyPending: boolean): AgentFileRevertMark[] => {
  const marks: AgentFileRevertMark[] = []
  for (const row of agentSessionService.listSnapshotRows(sessionId)) {
    for (const change of parseSnapshotChanges(row.files_changed)) {
      if (typeof change.revertedAt !== "number") continue
      if (onlyPending && change.revertAnnouncedAt !== undefined) continue
      marks.push({
        userMessageTimestamp: row.user_message_timestamp,
        file: change.file,
        revertedAt: change.revertedAt,
      })
    }
  }
  return marks
}

// 会话内全部已回退文件标记（按轮次升序；restore 载荷与 flowlist 渲染用）。
export const listSessionFileReverts = (sessionId: string): AgentFileRevertMark[] =>
  collectRevertMarks(sessionId, false)

// 标记指定轮次文件已回退（读改写；刷新回退时间并清空已告知标记，重新注入）。
export const markFilesReverted = (
  sessionId: string,
  userMessageTimestamp: number,
  files: string[],
  revertedAt: number,
): void => {
  const snapshot = agentSessionService.getSnapshotByUserTimestamp(sessionId, userMessageTimestamp)
  if (!snapshot) return
  const targets = new Set(files)
  const changes = parseSnapshotChanges(snapshot.files_changed).map((change) =>
    targets.has(change.file) ? { ...change, revertedAt, revertAnnouncedAt: undefined } : change,
  )
  agentSessionService.updateSnapshotFilesChanged(
    sessionId,
    userMessageTimestamp,
    JSON.stringify(changes),
  )
}

// 标记该会话所有未告知的回退已告知（该轮 flush 成功落库后调用，保证提示只注入一次）。
export const markPendingRevertsAnnounced = (sessionId: string, announcedAt: number): void => {
  for (const row of agentSessionService.listSnapshotRows(sessionId)) {
    let changed = false
    const changes = parseSnapshotChanges(row.files_changed).map((change) => {
      if (typeof change.revertedAt === "number" && change.revertAnnouncedAt === undefined) {
        changed = true
        return { ...change, revertAnnouncedAt: announcedAt }
      }
      return change
    })
    if (changed) {
      agentSessionService.updateSnapshotFilesChanged(
        sessionId,
        row.user_message_timestamp,
        JSON.stringify(changes),
      )
    }
  }
}

/**
 * 构建未告知回退的注入块（无待注入项返回 null）；
 * 文本为英语（模型消费侧规范），批量聚合所有未告知条目。
 */
export const buildPendingFileRevertBlock = (sessionId: string): string | null => {
  const pending = collectRevertMarks(sessionId, true)
  if (pending.length === 0) return null
  const lines = pending.map(
    (mark) =>
      `- ${mark.file} (reverted to the state before turn ${new Date(mark.userMessageTimestamp).toISOString()})`,
  )
  return [
    "<file_revert>",
    "The user reverted these files to the state before the referenced turn. Their current content may differ from what you last saw:",
    ...lines,
    "</file_revert>",
  ].join("\n")
}

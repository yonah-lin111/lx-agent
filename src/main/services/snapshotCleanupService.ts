import { agentSessionService } from "@/services/agentSessionService"
import { gitSnapshotService } from "@/services/gitSnapshotService"

// 24 小时清理一次
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * 收集所有存活快照引用的 blob（数据库为唯一存活根来源）。
 * 任一行解析失败都放弃本轮回收：宁可漏删垃圾，不可误删前置镜像。
 */
const collectReferencedBlobs = (): Set<string> | null => {
  try {
    const referenced = new Set<string>()
    for (const raw of agentSessionService.listSnapshotFilesChanged()) {
      const changes = JSON.parse(raw) as unknown
      if (!Array.isArray(changes)) continue
      for (const item of changes as unknown[]) {
        const blob = (item as { blob?: unknown } | null)?.blob
        if (typeof blob === "string" && blob) {
          referenced.add(blob)
        }
      }
    }
    return referenced
  } catch (err) {
    console.error("Failed to collect referenced snapshot blobs; skip cleanup:", err)
    return null
  }
}

/**
 * 执行一次快照垃圾回收：
 * 以存活快照引用为根，清除共享 blob 仓库中超过宽限期仍未引用的松散对象。
 */
export const cleanOrphanSnapshotBlobs = (): void => {
  try {
    const referenced = collectReferencedBlobs()
    if (!referenced) return
    const result = gitSnapshotService.pruneBlobs(referenced)
    if (result.removed > 0) {
      console.log(
        `Snapshot cleanup removed ${result.removed} orphan blob(s), freed ${result.freedBytes} bytes.`,
      )
    }
  } catch (err) {
    console.error("Failed to run snapshot cleanup:", err)
  }
}

/**
 * 启动快照垃圾回收定时器（启动后延迟 5 秒首跑，随后每 24 小时一次）。
 */
export const startSnapshotCleanupScheduler = (): (() => void) => {
  // 延迟 5 秒启动首次清理，避免竞争应用启动关键路径
  const initialTimer = setTimeout(() => {
    cleanOrphanSnapshotBlobs()
  }, 5000)

  const intervalTimer = setInterval(() => {
    cleanOrphanSnapshotBlobs()
  }, CLEANUP_INTERVAL_MS)

  return () => {
    clearTimeout(initialTimer)
    clearInterval(intervalTimer)
  }
}

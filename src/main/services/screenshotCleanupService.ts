import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { getScreenshotsDir } from "@/paths"
import { getUiSettings } from "@/services/settingsService"

// 默认保留 14 天
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
// 24 小时检查一次
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * 执行一次截图缓存清理：
 * 检查 UiSettings.screenshotCleanupEnabled 配置，
 * 若启用则清理 ~/.lx/screenshots 目录下创建/修改时间超过 14 天的文件。
 */
export const cleanExpiredScreenshots = (): void => {
  try {
    const uiSettings = getUiSettings()
    if (uiSettings.screenshotCleanupEnabled === false) return

    const screenshotsDir = getScreenshotsDir()
    if (!existsSync(screenshotsDir)) return

    const now = Date.now()
    const files = readdirSync(screenshotsDir)

    for (const file of files) {
      const filePath = join(screenshotsDir, file)
      try {
        const stats = statSync(filePath)
        if (!stats.isFile()) continue

        // 根据文件的 mtime 判定（utimes 修改的是 atime/mtime）
        const fileAge = now - stats.mtimeMs
        if (fileAge > MAX_AGE_MS) {
          unlinkSync(filePath)
        }
      } catch {
        // 单个文件清理异常静默跳过
      }
    }
  } catch (err) {
    console.error("Failed to run screenshot cleanup:", err)
  }
}

/**
 * 启动截图缓存定时清理定时器（启动时清理一次，随后每 24 小时检查一次）。
 */
export const startScreenshotCleanupScheduler = (): (() => void) => {
  // 延迟 5 秒启动首次清理，避免竞争应用启动关键路径
  const initialTimer = setTimeout(() => {
    cleanExpiredScreenshots()
  }, 5000)

  const intervalTimer = setInterval(() => {
    cleanExpiredScreenshots()
  }, CLEANUP_INTERVAL_MS)

  return () => {
    clearTimeout(initialTimer)
    clearInterval(intervalTimer)
  }
}

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getScreenshotsDir } from "@/paths"
import { CLIPBOARD_CHANNELS } from "@shared/ipc/clipboardChannels"
import { ipcMain } from "electron"

const mimeToExt: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
}

/**
 * 注册剪贴板截图写入相关的 IPC 处理程序。
 */
export const registerClipboardHandlers = (): void => {
  ipcMain.handle(
    CLIPBOARD_CHANNELS.saveImage,
    async (_event, buffer: ArrayBuffer | Uint8Array, mimeType = "image/png"): Promise<string | null> => {
      try {
        if (!buffer || buffer.byteLength === 0) return null
        const screenshotsDir = getScreenshotsDir()
        if (!existsSync(screenshotsDir)) {
          mkdirSync(screenshotsDir, { recursive: true })
        }

        const ext = mimeToExt[mimeType.toLowerCase()] || ".png"
        const filename = `screenshot-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`
        const filePath = join(screenshotsDir, filename)

        const nodeBuffer = Buffer.from(buffer)
        writeFileSync(filePath, nodeBuffer)
        return filePath
      } catch (error) {
        console.error("Failed to save clipboard image:", error)
        return null
      }
    },
  )
}

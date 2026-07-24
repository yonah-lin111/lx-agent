import { join } from "node:path"
import { is, optimizer } from "@electron-toolkit/utils"
import { app, BrowserWindow } from "electron"
import { initDatabase } from "@/db"

/**
 * 创建桌面应用主窗口。
 */
const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 1240,
    minHeight: 780,
    backgroundColor: "#000000",
    webPreferences: { preload: join(__dirname, "../preload/index.mjs") },
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    return
  }

  void window.loadFile(join(__dirname, "../renderer/index.html"))
}

app.whenReady().then(() => {
  initDatabase()

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
})

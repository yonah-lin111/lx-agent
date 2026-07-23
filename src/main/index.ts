import { join } from "node:path"
import { app, BrowserWindow } from "electron"

/**
 * 创建桌面应用主窗口。
 */
const createWindow = () => {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { preload: join(__dirname, "../preload/index.js") },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    return
  }

  void window.loadFile(join(__dirname, "../renderer/index.html"))
}

app.whenReady().then(createWindow)

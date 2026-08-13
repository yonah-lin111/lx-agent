import { existsSync } from "node:fs"
import { join } from "node:path"
import { is, optimizer } from "@electron-toolkit/utils"
import { LOCAL_IMAGE_PROTOCOL } from "@shared/localImage"
import { app, BrowserWindow, nativeImage, protocol } from "electron"
import { mcpManager } from "@/agent/mcp/mcpManager"
import { initDatabase } from "@/db"
import { registerAgentHandlers } from "@/ipc/agentHandlers"
import { registerGitHandlers } from "@/ipc/gitHandlers"
import { registerMarkdownHandlers } from "@/ipc/markdownHandlers"
import { registerProjectHandlers } from "@/ipc/projectHandlers"
import { registerPromptHistoryHandlers } from "@/ipc/promptHistoryHandlers"
import { registerSettingsHandlers } from "@/ipc/settingsHandlers"
import { registerLocalImageProtocol } from "@/protocols/localImageProtocol"

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_IMAGE_PROTOCOL,
    privileges: { secure: true, standard: true },
  },
])

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
    webPreferences: { preload: join(__dirname, "../preload/index.cjs") },
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    return
  }

  void window.loadFile(join(__dirname, "../renderer/index.html"))
}

// 应用应用 Logo（macOS Dock）；文件缺失或加载失败时静默跳过，不影响启动。
const applyAppDockIcon = (): void => {
  if (process.platform !== "darwin" || !app.dock) return

  const iconPath = join(app.getAppPath(), "resources", "icons", "lx-logo.png")
  if (!existsSync(iconPath)) return
  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) return
  app.dock.setIcon(icon)
}

app.whenReady().then(() => {
  initDatabase()
  registerLocalImageProtocol()
  registerProjectHandlers()
  registerSettingsHandlers()
  registerMarkdownHandlers()
  registerGitHandlers()
  registerPromptHistoryHandlers()
  registerAgentHandlers(() => BrowserWindow.getAllWindows()[0]?.webContents)

  // MCP server 连接（幂等；失败降级不阻塞），退出时断开避免残留子进程。
  void mcpManager.ensureConnected()
  app.on("will-quit", () => {
    void mcpManager.disconnectAll()
  })

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  applyAppDockIcon()
})

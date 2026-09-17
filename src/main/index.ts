import { existsSync } from "node:fs"
import { join } from "node:path"
import { is, optimizer } from "@electron-toolkit/utils"
import { GAME_PROTOCOL } from "@shared/contracts/game"
import { FRONT_DESIGN_PROTOCOL } from "@shared/frontDesign"
import { LOCAL_IMAGE_PROTOCOL } from "@shared/localImage"
import { app, BrowserWindow, nativeImage, protocol } from "electron"
import { agentRunner } from "@/agent/agentRunner"
import { lspManager } from "@/agent/lsp/lspManager"
import { mcpManager } from "@/agent/mcp/mcpManager"
import { initDatabase } from "@/db"
import { registerActivityHandlers } from "@/ipc/activityHandlers"
import { registerAgentHandlers } from "@/ipc/agentHandlers"
import { registerClipboardHandlers } from "@/ipc/clipboardHandlers"
import { registerCustomCommandHandlers } from "@/ipc/customCommandHandlers"
import { registerGameHandlers } from "@/ipc/gameHandlers"
import { registerGitHandlers } from "@/ipc/gitHandlers"
import { registerMarkdownHandlers } from "@/ipc/markdownHandlers"
import { registerOpenClawHandlers } from "@/ipc/openclawHandlers"
import { registerProjectHandlers } from "@/ipc/projectHandlers"
import { registerPromptHistoryHandlers } from "@/ipc/promptHistoryHandlers"
import { registerScheduleHandlers } from "@/ipc/scheduleHandlers"
import { registerSettingsHandlers } from "@/ipc/settingsHandlers"
import { registerSkillHandlers } from "@/ipc/skillHandlers"
import { registerTerminalHandlers } from "@/ipc/terminalHandlers"
import { registerUsageHandlers } from "@/ipc/usageHandlers"
import { registerFrontDesignProtocol } from "@/protocols/frontDesignProtocol"
import { registerGameProtocol } from "@/protocols/gameProtocol"
import { registerLocalImageProtocol } from "@/protocols/localImageProtocol"
import { openExternalUrl } from "@/services/externalLinkService"
import { notificationService } from "@/services/notificationService"
import { openClawClientManager } from "@/services/openclaw/openclawClientManager"
import { startScreenshotCleanupScheduler } from "@/services/screenshotCleanupService"
import { terminalService } from "@/services/terminalService"

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_IMAGE_PROTOCOL,
    privileges: { secure: true, standard: true },
  },
  {
    scheme: FRONT_DESIGN_PROTOCOL,
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    scheme: GAME_PROTOCOL,
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
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
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      webviewTag: true,
    },
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
  registerFrontDesignProtocol()
  registerGameProtocol()
  registerActivityHandlers()
  registerScheduleHandlers()
  registerProjectHandlers()
  registerClipboardHandlers()
  registerSettingsHandlers()
  registerSkillHandlers()
  registerMarkdownHandlers()
  registerGitHandlers()
  registerCustomCommandHandlers()
  registerPromptHistoryHandlers()
  registerTerminalHandlers()
  registerAgentHandlers(() => BrowserWindow.getAllWindows()[0]?.webContents)
  registerOpenClawHandlers(() => BrowserWindow.getAllWindows()[0]?.webContents)
  registerUsageHandlers(() => BrowserWindow.getAllWindows()[0]?.webContents)
  registerGameHandlers()

  // 系统通知点击出口：聚焦窗口后把跳转目标推给渲染进程。
  notificationService.attachSender(() => BrowserWindow.getAllWindows()[0]?.webContents)
  // Windows 开发态通知需要显式 AppUserModelId（打包后由安装器写入快捷方式）。
  if (process.platform === "win32" && !app.isPackaged) {
    app.setAppUserModelId(process.execPath)
  }

  const stopScreenshotCleanup = startScreenshotCleanupScheduler()

  // MCP server 连接（幂等；失败降级不阻塞），退出时断开避免残留子进程。
  void mcpManager.ensureConnected()
  app.on("will-quit", () => {
    stopScreenshotCleanup()
    // 生命周期 hook：退出路径 best-effort 派发 SessionEnd（quit，不等待异步工作）。
    agentRunner.disposeAll("quit")
    terminalService.disposeAll()
    void mcpManager.disconnectAll()
    // OpenClaw Gateway 连接回收。
    openClawClientManager.disposeAll()
    // LSP server 进程回收（会话切换时已按会话清理；退出兜底全部 kill）。
    void lspManager.dispose()
  })

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 外部链接统一交给系统默认浏览器，禁止在应用内弹出新窗口（覆盖所有 webContents）。
  app.on("web-contents-created", (_, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      void openExternalUrl(url)
      return { action: "deny" }
    })
  })

  createWindow()
  applyAppDockIcon()
})

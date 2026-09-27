import { join } from "node:path"
import { is, optimizer } from "@electron-toolkit/utils"
import { GAME_PROTOCOL } from "@shared/contracts/game"
import { FRONT_DESIGN_PROTOCOL } from "@shared/frontDesign"
import { LOCAL_IMAGE_PROTOCOL } from "@shared/localImage"
import { app, BrowserWindow, protocol } from "electron"
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
import { registerGitHubHandlers } from "@/ipc/githubHandlers"
import { registerMarkdownHandlers } from "@/ipc/markdownHandlers"
import { registerNotificationHandlers } from "@/ipc/notificationHandlers"
import { registerOpenClawHandlers } from "@/ipc/openclawHandlers"
import { registerProjectHandlers } from "@/ipc/projectHandlers"
import { registerPromptHistoryHandlers } from "@/ipc/promptHistoryHandlers"
import { registerScheduleHandlers } from "@/ipc/scheduleHandlers"
import { registerSettingsHandlers } from "@/ipc/settingsHandlers"
import { registerSkillHandlers } from "@/ipc/skillHandlers"
import { registerTerminalHandlers } from "@/ipc/terminalHandlers"
import { registerUpdateHandlers } from "@/ipc/updateHandlers"
import { registerUsageHandlers } from "@/ipc/usageHandlers"
import { isDevRuntime, resolveDevUserDataDir } from "@/lib/runtimeMode"
import { ensureLoginShellPath } from "@/lib/shellEnv"
import { registerFrontDesignProtocol } from "@/protocols/frontDesignProtocol"
import { registerGameProtocol } from "@/protocols/gameProtocol"
import { registerLocalImageProtocol } from "@/protocols/localImageProtocol"
import { openExternalUrl } from "@/services/externalLinkService"
import { notificationService } from "@/services/notificationService"
import { openClawClientManager } from "@/services/openclaw/openclawClientManager"
import { startScreenshotCleanupScheduler } from "@/services/screenshotCleanupService"
import { terminalService } from "@/services/terminalService"
import { updateService } from "@/services/updateService"

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

// 开发态 userData 与打包版隔离（localStorage、缓存等 Chromium 存储分开），并按 worktree 隔离以支持多个 dev 实例，
// 必须在 app ready 前设置。
const isDev = isDevRuntime()
if (isDev) {
  app.setPath("userData", resolveDevUserDataDir(app.getPath("appData"), app.getAppPath()))
}

// 开发态单实例锁：锁随 userData 按 worktree 生效，不同 worktree 可各跑一个 dev 实例；
// 同一 worktree 的第二个实例退出并聚焦已有窗口，避免并发读写同一份 dev 数据。打包态保持可多开。
const hasSingleInstanceLock = !isDev || app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })

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
    registerNotificationHandlers()
    registerGitHandlers()
    registerCustomCommandHandlers()
    registerPromptHistoryHandlers()
    registerTerminalHandlers()
    registerAgentHandlers(() => BrowserWindow.getAllWindows()[0]?.webContents)
    registerOpenClawHandlers(() => BrowserWindow.getAllWindows()[0]?.webContents)
    registerUsageHandlers(() => BrowserWindow.getAllWindows()[0]?.webContents)
    registerGameHandlers()
    registerGitHubHandlers()
    registerUpdateHandlers()

    // 系统通知点击出口：聚焦窗口后把跳转目标推给渲染进程。
    notificationService.attachSender(() => BrowserWindow.getAllWindows()[0]?.webContents)
    // 更新检查结果出口：打包态启动后延迟自动检查一次（开发态仅支持手动检查）。
    updateService.attachSender(() => BrowserWindow.getAllWindows()[0]?.webContents)
    updateService.startAutoCheck()
    // Windows 开发态通知需要显式 AppUserModelId（打包后由安装器写入快捷方式）。
    if (process.platform === "win32" && !app.isPackaged) {
      app.setAppUserModelId(process.execPath)
    }

    const stopScreenshotCleanup = startScreenshotCleanupScheduler()

    // 打包态 GUI 启动不继承终端环境：先解析登录 shell PATH 再连 MCP server（幂等；失败降级不阻塞），
    // 否则 nvm/homebrew 安装的 MCP 命令（npx、codegraph 等）spawn 报 ENOENT。
    void ensureLoginShellPath().then(() => mcpManager.ensureConnected())
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
  })
}

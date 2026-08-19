import type { CreateTerminalOptions } from "@shared/contracts/terminal"
import { TERMINAL_CHANNELS } from "@shared/ipc/terminalChannels"
import { ipcMain } from "electron"
import { terminalService } from "@/services/terminalService"

// 校验终端创建参数（IPC 输入边界）。
const isValidCreateOptions = (value: unknown): value is CreateTerminalOptions => {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<CreateTerminalOptions>
  return typeof candidate.id === "string" && candidate.id.trim().length > 0
}

/**
 * 注册终端领域 IPC 处理器。
 */
export const registerTerminalHandlers = (): void => {
  ipcMain.handle(TERMINAL_CHANNELS.create, (event, options: unknown) => {
    if (!isValidCreateOptions(options)) {
      return { success: false, id: "", error: "参数无效：必须提供合法的终端实例 ID" }
    }

    const sender = event.sender
    return terminalService.createTerminal(
      options,
      (data) => {
        if (!sender.isDestroyed()) {
          sender.send(TERMINAL_CHANNELS.data(options.id), data)
        }
      },
      (exitEvent) => {
        if (!sender.isDestroyed()) {
          sender.send(TERMINAL_CHANNELS.exit(options.id), exitEvent)
        }
      },
    )
  })

  ipcMain.handle(TERMINAL_CHANNELS.write, (_event, id: unknown, data: unknown) => {
    if (typeof id !== "string" || typeof data !== "string") return
    terminalService.writeTerminal(id, data)
  })

  ipcMain.handle(TERMINAL_CHANNELS.resize, (_event, id: unknown, cols: unknown, rows: unknown) => {
    if (
      typeof id !== "string" ||
      typeof cols !== "number" ||
      typeof rows !== "number" ||
      !Number.isFinite(cols) ||
      !Number.isFinite(rows)
    ) {
      return
    }
    terminalService.resizeTerminal(id, Math.floor(cols), Math.floor(rows))
  })

  ipcMain.handle(TERMINAL_CHANNELS.kill, (_event, id: unknown) => {
    if (typeof id !== "string") return
    terminalService.killTerminal(id)
  })

  ipcMain.handle(TERMINAL_CHANNELS.getDesktopPath, () => {
    return terminalService.getDesktopPath()
  })

  ipcMain.handle(TERMINAL_CHANNELS.hasRunningProcess, async (_event, id: unknown) => {
    if (typeof id !== "string") return false
    return terminalService.hasRunningProcess(id)
  })
}

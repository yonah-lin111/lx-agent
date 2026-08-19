import type {
  CreateTerminalOptions,
  TerminalApi,
  TerminalExitEvent,
} from "@shared/contracts/terminal"
import { TERMINAL_CHANNELS } from "@shared/ipc/terminalChannels"
import { ipcRenderer } from "electron"

// 终端领域 Preload API。
export const terminalApi: TerminalApi["terminal"] = {
  create: (options: CreateTerminalOptions) => ipcRenderer.invoke(TERMINAL_CHANNELS.create, options),
  write: (id: string, data: string) => ipcRenderer.invoke(TERMINAL_CHANNELS.write, id, data),
  resize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke(TERMINAL_CHANNELS.resize, id, cols, rows),
  kill: (id: string) => ipcRenderer.invoke(TERMINAL_CHANNELS.kill, id),
  getDesktopPath: () => ipcRenderer.invoke(TERMINAL_CHANNELS.getDesktopPath),
  hasRunningProcess: (id: string) => ipcRenderer.invoke(TERMINAL_CHANNELS.hasRunningProcess, id),
  onData: (id: string, handler: (data: string) => void) => {
    const channel = TERMINAL_CHANNELS.data(id)
    const listener = (_: unknown, data: string): void => handler(data)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },
  onExit: (id: string, handler: (event: TerminalExitEvent) => void) => {
    const channel = TERMINAL_CHANNELS.exit(id)
    const listener = (_: unknown, event: TerminalExitEvent): void => handler(event)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },
}

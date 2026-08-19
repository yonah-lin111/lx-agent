import type {
  CreateTerminalOptions,
  CreateTerminalResult,
  TerminalExitEvent,
} from "@shared/contracts/terminal"

/**
 * 终端领域 Feature API：调用 preload 暴露的终端接口。
 */
export const terminalApi = {
  create: (options: CreateTerminalOptions): Promise<CreateTerminalResult> => {
    return window.api.terminal.create(options)
  },
  write: (id: string, data: string): Promise<void> => {
    return window.api.terminal.write(id, data)
  },
  resize: (id: string, cols: number, rows: number): Promise<void> => {
    return window.api.terminal.resize(id, cols, rows)
  },
  kill: (id: string): Promise<void> => {
    return window.api.terminal.kill(id)
  },
  getDesktopPath: (): Promise<string> => {
    return window.api.terminal.getDesktopPath()
  },
  hasRunningProcess: (id: string): Promise<boolean> => {
    return window.api.terminal.hasRunningProcess(id)
  },
  onData: (id: string, handler: (data: string) => void): (() => void) => {
    return window.api.terminal.onData(id, handler)
  },
  onExit: (id: string, handler: (event: TerminalExitEvent) => void): (() => void) => {
    return window.api.terminal.onExit(id, handler)
  },
}

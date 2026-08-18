import { existsSync, statSync } from "node:fs"
import type {
  CreateTerminalOptions,
  CreateTerminalResult,
  TerminalExitEvent,
} from "@shared/contracts/terminal"
import { app } from "electron"
import * as pty from "node-pty"

/**
 * 原生 PTY 终端服务：管理系统进程生命周期、输入输出与视口同步。
 */
export class TerminalService {
  private ptyProcesses = new Map<string, pty.IPty>()

  /**
   * 解析跨平台默认 Shell 路径。
   */
  private resolveDefaultShell(): string {
    if (process.platform === "win32") {
      const gitBashPath = "C:\\Program Files\\Git\\bin\\bash.exe"
      if (existsSync(gitBashPath)) return gitBashPath
      return process.env.COMSPEC || "powershell.exe"
    }

    if (process.platform === "darwin") {
      return process.env.SHELL || "/bin/zsh" || "/bin/bash"
    }

    return process.env.SHELL || "/bin/bash" || "/bin/sh"
  }

  /**
   * 解析工作目录，若无效则回退至桌面路径。
   */
  private resolveCwd(cwd?: string): string {
    if (cwd && typeof cwd === "string" && existsSync(cwd)) {
      try {
        if (statSync(cwd).isDirectory()) return cwd
      } catch {
        // 回退桌面
      }
    }
    return this.getDesktopPath()
  }

  /**
   * 获取操作系统桌面目录路径。
   */
  getDesktopPath(): string {
    try {
      return app.getPath("desktop")
    } catch {
      return app.getPath("home")
    }
  }

  /**
   * 创建新的 PTY 终端进程。
   */
  createTerminal(
    options: CreateTerminalOptions,
    onData: (data: string) => void,
    onExit: (event: TerminalExitEvent) => void,
  ): CreateTerminalResult {
    try {
      const existing = this.ptyProcesses.get(options.id)
      if (existing) {
        try {
          existing.kill()
        } catch {
          // 忽略已终止进程的关闭异常
        }
        this.ptyProcesses.delete(options.id)
      }

      const shell = this.resolveDefaultShell()
      const resolvedCwd = this.resolveCwd(options.cwd)
      const cols = options.cols && options.cols > 0 ? options.cols : 80
      const rows = options.rows && options.rows > 0 ? options.rows : 24
      const env = {
        ...process.env,
        COLORTERM: "truecolor",
        TERM: "xterm-256color",
        ...options.env,
      } as Record<string, string>

      const ptyProcess = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: resolvedCwd,
        env,
      })

      ptyProcess.onData((data) => {
        onData(data)
      })

      ptyProcess.onExit((event) => {
        this.ptyProcesses.delete(options.id)
        onExit({ exitCode: event.exitCode, signal: event.signal })
      })

      this.ptyProcesses.set(options.id, ptyProcess)
      return { success: true, id: options.id }
    } catch (error) {
      console.error(`[TerminalService] Failed to spawn terminal ${options.id}:`, error)
      return {
        success: false,
        id: options.id,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * 向 PTY 进程写入数据。
   */
  writeTerminal(id: string, data: string): void {
    const ptyProcess = this.ptyProcesses.get(id)
    if (!ptyProcess) return

    try {
      ptyProcess.write(data)
    } catch (error) {
      console.error(`[TerminalService] Failed to write to terminal ${id}:`, error)
    }
  }

  /**
   * 调整 PTY 视口行数与列数。
   */
  resizeTerminal(id: string, cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) return
    const ptyProcess = this.ptyProcesses.get(id)
    if (!ptyProcess) return

    try {
      ptyProcess.resize(cols, rows)
    } catch (error) {
      console.error(`[TerminalService] Failed to resize terminal ${id}:`, error)
    }
  }

  /**
   * 销毁指定 PTY 终端进程。
   */
  killTerminal(id: string): void {
    const ptyProcess = this.ptyProcesses.get(id)
    if (!ptyProcess) return

    this.ptyProcesses.delete(id)
    try {
      ptyProcess.kill()
    } catch {
      // 忽略已终止进程的关闭异常
    }
  }

  /**
   * 回收所有活动 PTY 终端进程。
   */
  disposeAll(): void {
    for (const [id, ptyProcess] of this.ptyProcesses.entries()) {
      try {
        ptyProcess.kill()
      } catch {
        // 忽略已终止进程的关闭异常
      }
      this.ptyProcesses.delete(id)
    }
  }
}

export const terminalService = new TerminalService()

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
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
   * 确保生成并返回临时 Zsh/Bash 色彩增强启动目录环境。
   */
  private prepareZdotdir(): string | undefined {
    if (process.platform === "win32") return undefined

    try {
      const userDataDir = app.getPath("userData")
      const zdotdir = join(userDataDir, "terminal-env")
      if (!existsSync(zdotdir)) {
        mkdirSync(zdotdir, { recursive: true })
      }

      // 生成定制 .zshrc：首先加载用户自身的 ~/.zshrc，随后强制注入鲜明色彩 Prompt 与 ls/git 别名
      const zshrcContent = `
# 1. 优先加载用户原本的配置（保持原有插件、环境变量）
if [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc"
fi

# 2. 注入现代活力色彩 Prompt 提示符（青色路径、绿色箭头、洋红分支）
autoload -Uz colors && colors
setopt PROMPT_SUBST

# 自定义彩色提示符：绿色箭头 + 青色当前目录 + 黄色 git 分支标识
export PROMPT='%F{green}➜ %F{cyan}%~%f %F{yellow}%% %f'

# 3. 注入常用命令全彩别名
if command -v gls >/dev/null 2>&1; then
  alias ls='gls --color=auto'
elif ls --color=auto >/dev/null 2>&1; then
  alias ls='ls --color=auto'
else
  alias ls='ls -G'
fi

alias ll='ls -lh'
alias la='ls -lah'
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'
`
      writeFileSync(join(zdotdir, ".zshrc"), zshrcContent.trim(), "utf-8")
      return zdotdir
    } catch {
      return undefined
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
      const cols = options.cols && options.cols >= 10 ? options.cols : 80
      const rows = options.rows && options.rows >= 2 ? options.rows : 24
      // 丰富完整的色彩环境变量配置
      const env = {
        ...process.env,
        COLORTERM: "truecolor",
        TERM: "xterm-256color",
        CLICOLOR: "1",
        // BSD / macOS ls 颜色配置（目录亮青、符号链接洋红、套接字亮绿、管道棕黄、可执行文件亮红等）
        LSCOLORS: "ExGxFxdxCxDxDxBxBxegeg",
        // GNU / Linux LS_COLORS 现代丰富调色表
        LS_COLORS:
          "di=01;34:ln=01;36:so=01;32:pi=01;33:ex=01;32:bd=01;33;44:cd=01;33;44:su=01;31:sg=01;31:tw=01;34;42:ow=01;34;43:*.tar=01;31:*.tgz=01;31:*.zip=01;31:*.z=01;31:*.gz=01;31:*.bz2=01;31:*.png=01;35:*.jpg=01;35:*.gif=01;35:*.svg=01;35:*.json=01;33:*.ts=01;36:*.tsx=01;36:*.js=01;33:*.jsx=01;33:*.md=01;32",
        // grep / ripgrep 关键字、行号与匹配高亮
        GREP_COLORS: "ms=01;31:mc=01;31:sl=:cx=:fn=01;35:ln=01;32:bn=01;32:se=01;36",
        GREP_COLOR: "1;31",
        // git 全局彩色输出支持
        GIT_CONFIG_PARAMETERS: "'color.ui=always'",
        FORCE_COLOR: "3",
        // 跨平台默认彩色 Prompt 提示符（若当前环境未配置特定主题）
        PROMPT: "%F{green}➜ %F{cyan}%~%f %F{blue}git:(%F{red}%b%F{blue})%f %F{yellow}✗%f ",
        PS1: "\\[\\033[01;32m\\]➜ \\[\\033[01;36m\\]\\w\\[\\033[00m\\] \\$ ",
        ...options.env,
      } as Record<string, string>

      if (process.platform === "darwin") {
        const extraPaths = [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          "/usr/sbin",
          "/sbin",
        ]
        const currentPath = env.PATH || process.env.PATH || ""
        const pathSegments = currentPath.split(":").filter(Boolean)
        for (const extraPath of extraPaths) {
          if (!pathSegments.includes(extraPath) && existsSync(extraPath)) {
            pathSegments.unshift(extraPath)
          }
        }
        env.PATH = pathSegments.join(":")
      }

      const zdotdir = this.prepareZdotdir()
      if (zdotdir) {
        env.ZDOTDIR = zdotdir
      }

      const args = process.platform === "win32" ? [] : ["-l"]
      const spawnFn =
        typeof pty.spawn === "function"
          ? pty.spawn
          : (pty as unknown as { default: typeof pty }).default.spawn

      const ptyProcess = spawnFn(shell, args, {
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
        if (this.ptyProcesses.get(options.id) === ptyProcess) {
          this.ptyProcesses.delete(options.id)
          onExit({ exitCode: event.exitCode, signal: event.signal })
        }
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
    if (cols < 10 || rows < 2) return
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

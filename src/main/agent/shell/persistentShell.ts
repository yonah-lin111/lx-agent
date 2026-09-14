import { app } from "electron"
import * as pty from "node-pty"

/**
 * 结构化持久 Shell 会话状态。
 */
export interface PersistentSession {
  key: string
  sessionId: string
  name: string
  ptyProcess: pty.IPty
  cwd: string
  lastUsedAt: number
  busy: boolean
}

/** 默认空闲回收时长：10 分钟 */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000

// 退出码 marker 指令：Unix 用 `$?`；Windows cmd.exe 用 `%errorlevel%`（无引号避免回显引号破坏解析）。
// PowerShell 不支持该 marker 协议（$? 为布尔、$LASTEXITCODE 不稳定），在会话创建时明确拒绝。
export const buildEndMarkerCommand = (
  marker: string,
  platform: NodeJS.Platform = process.platform,
): string => {
  const prefix = `__LX_AGENT_END_${marker}__:`
  return platform === "win32" ? `echo ${prefix}%errorlevel%\r\n` : `echo "${prefix}$?"\n`
}

/**
 * 持久 Shell 管理器 (PersistentShellManager)
 * 采用分隔符 Marker 协议捕获命令执行输出与退出码。
 * 键格式: `${sessionId}:${sessionName}`。
 */
export class PersistentShellManager {
  private sessions = new Map<string, PersistentSession>()
  private idleCheckTimer: NodeJS.Timeout | null = null

  constructor() {
    this.idleCheckTimer = setInterval(() => this.cleanupIdleSessions(), 60 * 1000)
    // Electron 进程退出时兜底清理
    if (app) {
      app.on("will-quit", () => this.disposeAll())
    }
  }

  private resolveDefaultShell(): string {
    if (process.platform === "win32") {
      return process.env.COMSPEC || "cmd.exe"
    }
    return process.env.SHELL || "/bin/bash" || "/bin/sh"
  }

  private getSessionKey(sessionId: string, sessionName: string): string {
    return `${sessionId}:${sessionName}`
  }

  /**
   * 获取或创建持久 PTY 会话。
   */
  getOrCreateSession(sessionId: string, sessionName: string, cwd: string): PersistentSession {
    const key = this.getSessionKey(sessionId, sessionName)
    const existing = this.sessions.get(key)
    if (existing) {
      existing.lastUsedAt = Date.now()
      return existing
    }

    const shell = this.resolveDefaultShell()
    // PowerShell 的退出码语义与 marker 协议不兼容：明确报错，避免命令静默挂到超时。
    if (process.platform === "win32" && /powershell|pwsh/i.test(shell)) {
      throw new Error(
        "Persistent shell sessions do not support PowerShell; configure cmd.exe (ComSpec).",
      )
    }
    const ptyProcess = pty.spawn(shell, process.platform === "win32" ? [] : ["-i"], {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd,
      env: {
        ...(process.env as Record<string, string>),
        PS1: "",
        PROMPT: "",
      },
    })

    const session: PersistentSession = {
      key,
      sessionId,
      name: sessionName,
      ptyProcess,
      cwd,
      lastUsedAt: Date.now(),
      busy: false,
    }

    ptyProcess.onExit(() => {
      this.sessions.delete(key)
    })

    this.sessions.set(key, session)
    return session
  }

  /**
   * 在持久会话中执行命令并等待输出结束。
   * Marker 协议：在命令后执行 echo "__LX_AGENT_END_<MARKER>__:$?"
   */
  async executeCommand(
    session: PersistentSession,
    command: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{ output: string; exitCode: number }> {
    // 已中止的 signal 直接取消，不写命令、不占用 busy。
    if (signal?.aborted) {
      throw new Error("命令已中止。")
    }
    if (session.busy) {
      throw new Error(`持久会话 ${session.name} 正忙于执行上一条命令，请稍候。`)
    }

    session.busy = true
    session.lastUsedAt = Date.now()

    const marker = `MK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    let rawBuffer = ""
    let resolved = false

    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null

      // 中止回调：一次性监听，cleanup 中显式移除避免同一 signal 复用时累积。
      const onAbort = () => {
        if (resolved) return
        resolved = true
        cleanup()
        reject(new Error("命令已中止。"))
      }

      const cleanup = () => {
        session.busy = false
        session.lastUsedAt = Date.now()
        if (timer) clearTimeout(timer)
        listener.dispose()
        signal?.removeEventListener("abort", onAbort)
      }

      const listener = session.ptyProcess.onData((data) => {
        rawBuffer += data
        const endLinePattern = new RegExp(`(?:\\r?\\n|^)__LX_AGENT_END_${marker}__:(-?\\d+)\\r?\\n`)
        const match = endLinePattern.exec(rawBuffer)
        if (match) {
          const exitCode = parseInt(match[1], 10) || 0
          const outputSection = rawBuffer.slice(0, match.index)

          // 拆分行并过滤输入回显
          const lines = outputSection.replace(/\r/g, "").split("\n")
          const filtered = lines.filter((l) => {
            const clean = l.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "").trim()
            if (!clean) return false
            if (clean === command.trim()) return false
            if (
              clean.startsWith('echo "__LX_AGENT_END_') ||
              clean.includes(`__LX_AGENT_END_${marker}__`)
            )
              return false
            return true
          })

          const cleanOutput = filtered
            .map((l) => l.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "").trim())
            .join("\n")

          resolved = true
          cleanup()
          resolve({
            output: cleanOutput.trim(),
            exitCode,
          })
        }
      })

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (!resolved) {
            resolved = true
            cleanup()
            reject(new Error(`命令执行超时（${Math.round(timeoutMs / 1000)}s）`))
          }
        }, timeoutMs)
      }

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true })
      }

      // 发送命令与 Marker 指令（换行按平台；Windows cmd 用 %errorlevel%）。
      const eol = process.platform === "win32" ? "\r\n" : "\n"
      session.ptyProcess.write(`${command}${eol}${buildEndMarkerCommand(marker)}`)
    })
  }

  /**
   * 销毁指定 sessionId 的全部会话。
   */
  disposeBySessionId(sessionId: string): void {
    for (const [key, session] of this.sessions.entries()) {
      if (session.sessionId === sessionId) {
        try {
          session.ptyProcess.kill()
        } catch {
          // ignore
        }
        this.sessions.delete(key)
      }
    }
  }

  /**
   * 清理空闲会话。
   */
  private cleanupIdleSessions(): void {
    const now = Date.now()
    for (const [key, session] of this.sessions.entries()) {
      if (!session.busy && now - session.lastUsedAt > IDLE_TIMEOUT_MS) {
        try {
          session.ptyProcess.kill()
        } catch {
          // ignore
        }
        this.sessions.delete(key)
      }
    }
  }

  /**
   * 销毁全量会话。
   */
  disposeAll(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer)
      this.idleCheckTimer = null
    }
    for (const session of this.sessions.values()) {
      try {
        session.ptyProcess.kill()
      } catch {
        // ignore
      }
    }
    this.sessions.clear()
  }
}

export const persistentShellManager = new PersistentShellManager()

import { createHash } from "node:crypto"
import { join } from "node:path"

// 开发态判定：以 `electron .` 方式启动（electron-vite dev/preview）时 process.defaultApp 为 true，打包版为 undefined。
export const isDevRuntime = (): boolean => process.defaultApp === true

// worktree 短哈希：同一 worktree 稳定、不同 worktree 互不相同（Git worktree 即独立开发实例）。
const hashWorktreeRoot = (worktreeRoot: string): string =>
  createHash("sha256").update(worktreeRoot).digest("hex").slice(0, 8)

/**
 * 解析开发态 Electron userData 目录：与打包版默认的 lx-agent 隔离，避免共用 localStorage 等 Chromium 存储。
 *
 * 传入 worktreeRoot（dev 下为 app.getAppPath()）时按 worktree 再隔离：
 * 每个 worktree 拥有独立 Chromium 存储与单实例锁，支持多个 `pnpm dev` 实例同时运行；
 * 业务数据根（~/.lx-dev）仍为各实例共享。
 */
export const resolveDevUserDataDir = (appDataDir: string, worktreeRoot?: string): string =>
  worktreeRoot
    ? join(appDataDir, `lx-agent-dev-${hashWorktreeRoot(worktreeRoot)}`)
    : join(appDataDir, "lx-agent-dev")

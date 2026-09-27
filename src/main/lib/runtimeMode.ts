import { join } from "node:path"

// 开发态判定：以 `electron .` 方式启动（electron-vite dev/preview）时 process.defaultApp 为 true，打包版为 undefined。
export const isDevRuntime = (): boolean => process.defaultApp === true

// 解析开发态 Electron userData 目录：与打包版默认的 lx-agent 隔离，避免共用 localStorage 等 Chromium 存储。
export const resolveDevUserDataDir = (appDataDir: string): string =>
  join(appDataDir, "lx-agent-dev")

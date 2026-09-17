// 游戏领域契约：本地 GBA ROM 条目管理、导入结果与应用侧存档写入。

// 自定义协议 scheme：webview 模拟器宿主页、静态资产、ROM 与存档均经此协议加载。
export const GAME_PROTOCOL = "lx-game"

// ROM 扩展名白名单（小写，含点）。
export const GAME_ROM_EXTENSIONS = [".gba"] as const

// 单个 ROM 文件大小上限（64MB）。
export const GAME_ROM_MAX_BYTES = 64 * 1024 * 1024

// 单条游戏条目标题长度上限。
export const GAME_TITLE_MAX_LENGTH = 120

// 一条已导入的游戏条目（标题默认取 ROM 文件名，可改名）。
export interface GameRomEntry {
  id: number
  title: string
  // ROM 内容 sha256（去重与完整性校验的唯一键）。
  romHash: string
  romSize: number
  createdAt: string
  updatedAt: string
  lastPlayedAt: string | null
}

// 单次导入结果状态：imported 新建条目；duplicated 命中已有内容；invalid 校验失败。
export type GameImportStatus = "imported" | "duplicated" | "invalid"

// invalid 原因码（renderer 侧映射 i18n 文案）。
export type GameImportInvalidReason = "unsupportedExtension" | "tooLarge" | "unreadable"

// 单次导入结果（一个文件一条）。
export interface GameImportResult {
  status: GameImportStatus
  fileName: string
  reason?: GameImportInvalidReason
  entry?: GameRomEntry
}

// 模拟器运行时配置（webview 预加载脚本的 file:// URL 由主进程解析）。
export interface GameRuntimeConfig {
  guestPreloadUrl: string
}

// 游戏领域 preload API 契约。
export interface GameApi {
  game: {
    list: () => Promise<GameRomEntry[]>
    importFromDialog: () => Promise<GameImportResult[]>
    rename: (id: number, title: string) => Promise<GameRomEntry>
    remove: (id: number) => Promise<void>
    markPlayed: (id: number) => Promise<GameRomEntry>
    writeSave: (id: number, data: Uint8Array) => Promise<void>
    getRuntimeConfig: () => Promise<GameRuntimeConfig>
  }
}

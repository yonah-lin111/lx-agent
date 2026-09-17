import { accessSync, constants, existsSync, mkdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * 获取 LX Agent 的应用数据根目录。
 * LX_AGENT_DATA_ROOT 可覆盖默认路径（测试隔离用）。
 */
export const getAppDataRoot = (): string => process.env.LX_AGENT_DATA_ROOT ?? join(homedir(), ".lx")

/**
 * 获取模型 Provider 配置文件路径。
 */
export const getConfigPath = (): string => join(getAppDataRoot(), "config.json")

/**
 * 获取提示词历史 JSON 文件路径。
 */
export const getPromptHistoryPath = (): string => join(getAppDataRoot(), "prompt-history.json")

/**
 * 获取 SQLite 数据库存储目录。
 */
export const getDatabaseDir = (): string => join(getAppDataRoot(), "db")

/**
 * 获取截图存储目录。
 */
export const getScreenshotsDir = (): string => join(getAppDataRoot(), "screenshots")

/**
 * 获取 SQLite 数据库文件路径。
 */
export const getDatabasePath = (): string => join(getDatabaseDir(), "lx.db")

/**
 * 获取指定会话的前端设计目录。
 */
export const getSessionDesignDir = (sessionId: string, designId: string): string =>
  join(getAppDataRoot(), "session", sessionId, "design", designId)

/**
 * 获取游戏数据根目录（导入的 ROM 与应用侧存档）。
 */
export const getGameDir = (): string => join(getAppDataRoot(), "game")

/**
 * 获取游戏 ROM 存放目录（文件名固定为 <entryId>.gba）。
 */
export const getGameRomsDir = (): string => join(getGameDir(), "roms")

/**
 * 获取游戏存档根目录（每条例目一个子目录，内含 sram.sav 与 sram.sav.bak）。
 */
export const getGameSavesDir = (): string => join(getGameDir(), "saves")

/**
 * 检测并创建 SQLite 数据库存储目录。
 */
export const ensureDatabaseDir = (databaseDir = getDatabaseDir()): void => {
  if (existsSync(databaseDir)) {
    if (!statSync(databaseDir).isDirectory()) {
      throw new Error(`SQLite database path is not a directory: ${databaseDir}`)
    }
  } else {
    mkdirSync(databaseDir, { recursive: true })
  }

  accessSync(databaseDir, constants.W_OK)
}

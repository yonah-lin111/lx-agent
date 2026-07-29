import { accessSync, constants, existsSync, mkdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * 获取 LX Agent 的应用数据根目录。
 */
export const getAppDataRoot = (): string => join(homedir(), ".lx")

/**
 * 获取模型 Provider 配置文件路径。
 */
export const getConfigPath = (): string => join(getAppDataRoot(), "config.json")

/**
 * 获取 SQLite 数据库存储目录。
 */
export const getDatabaseDir = (): string => join(getAppDataRoot(), "db")

/**
 * 获取 SQLite 数据库文件路径。
 */
export const getDatabasePath = (): string => join(getDatabaseDir(), "lx.db")

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

import { accessSync, constants, existsSync, mkdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { isDevRuntime } from "@/lib/runtimeMode"

/**
 * 解析应用数据根目录：开发态 `.lx-dev` 与打包态 `.lx` 分离，避免历史记录与数据库互相串数据。
 */
export const resolveAppDataRoot = (home: string, isDev: boolean): string =>
  join(home, isDev ? ".lx-dev" : ".lx")

/**
 * 获取 LX Agent 的应用数据根目录（开发态自动隔离）。
 * LX_AGENT_DATA_ROOT 可覆盖默认路径（测试隔离用）。
 */
export const getAppDataRoot = (): string =>
  process.env.LX_AGENT_DATA_ROOT ?? resolveAppDataRoot(homedir(), isDevRuntime())

/**
 * 获取跨客户端标准 Skill 目录（默认 ~/.agents/skills）。
 * LX_AGENT_AGENTS_HOME 可覆盖默认路径（测试隔离用）。
 */
export const getStandardSkillsDir = (): string =>
  join(process.env.LX_AGENT_AGENTS_HOME ?? join(homedir(), ".agents"), "skills")

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
 * 路径段消毒：仅保留字母、数字、下划线与短横线，其余替换为下划线。
 * 结果不含 `.` 与路径分隔符，跨平台合法（Windows 非法字符一并被替换）。
 */
export const sanitizePathSegment = (value: string): string => {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_")
  return cleaned || "_"
}

/**
 * 获取游戏数据根目录（每个游戏一个以标题命名的子目录，内含 ROM 与存档）。
 */
export const getGameDir = (): string => join(getAppDataRoot(), "game")

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

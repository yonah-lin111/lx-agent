import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"

/**
 * 配置目录布局：`~/.lx/config/` 下按领域拆分多个 JSON 文件。
 * 每个文件为「顶层 key 包装」结构（如 `ai.json` = `{"ai": {...}}`），
 * 写入只重写发生变化的顶层 key 所属文件，其余文件保持不动。
 */

// 顶层 key → 所属配置文件名（未列出的 key 归 extra.json）。
export const CONFIG_ROUTES: Readonly<Record<string, string>> = {
  ai: "ai.json",
  bailian: "ai.json",
  // 内置 Provider（如下 OpenCode Go）独立成文件，不与用户自定义配置混存。
  builtinProviders: "builtin-providers.json",
  agent: "agent.json",
  openclaw: "openclaw.json",
  ui: "app.json",
  cli: "app.json",
  voice: "app.json",
  tokenSaver: "app.json",
}

// 未知顶层 key 的兜底文件名。
export const EXTRA_CONFIG_FILE = "extra.json"

// 读取顺序固定，保证重复顶层 key 的覆盖行为可预期。
const CONFIG_FILE_ORDER = [
  "ai.json",
  "builtin-providers.json",
  "agent.json",
  "openclaw.json",
  "app.json",
  EXTRA_CONFIG_FILE,
] as const

export type ConfigTree = Record<string, unknown>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * 配置目录路径：由旧配置文件路径推导，保持测试对 `getConfigPath` 的注入方式不变。
 */
export const getConfigDir = (configPath: string): string => join(dirname(configPath), "config")

// 旧文件迁移失败只告警一次，避免损坏的旧文件在每次读取时反复刷屏。
const legacyMigrationFailed = new Set<string>()

// 损坏文件隔离：改名 `<file>.corrupt` 保留现场，避免下次保存覆盖可人工修复的内容。
const quarantineCorruptFile = (filePath: string, warn: (message: string) => void): void => {
  warn(`[config] 配置文件解析失败，已隔离为 ${basename(filePath)}.corrupt`)
  try {
    rmSync(`${filePath}.corrupt`, { force: true })
    renameSync(filePath, `${filePath}.corrupt`)
  } catch {
    // 隔离失败时保留原文件，按空配置继续。
  }
}

// 读取单个配置文件；缺失返回空对象，损坏则告警、隔离并按空对象继续（故障隔离到单文件）。
const readConfigFile = (filePath: string, warn: (message: string) => void): ConfigTree => {
  if (!existsSync(filePath)) return {}
  let parsed: unknown
  try {
    const text = readFileSync(filePath, "utf8").trim()
    if (!text) return {}
    parsed = JSON.parse(text)
  } catch {
    quarantineCorruptFile(filePath, warn)
    return {}
  }
  if (!isRecord(parsed)) {
    quarantineCorruptFile(filePath, warn)
    return {}
  }
  return parsed
}

/**
 * 合并读取 `config/` 下全部布局文件；同名顶层 key 后者覆盖并告警。
 */
export const loadConfigTree = (
  configPath: string,
  warn: (message: string) => void = console.warn,
): ConfigTree => {
  const configDir = getConfigDir(configPath)
  if (!existsSync(configDir)) return {}

  const merged: ConfigTree = {}
  const seen = new Set<string>()
  for (const file of CONFIG_FILE_ORDER) {
    const data = readConfigFile(join(configDir, file), warn)
    for (const [key, value] of Object.entries(data)) {
      if (seen.has(key)) {
        warn(`[config] 顶层 key "${key}" 在多个配置文件中重复，以 ${file} 为准`)
      }
      seen.add(key)
      merged[key] = value
    }
  }
  return merged
}

// 按路由把整树分组为「配置文件名 → 文件内容」；未知 key 归 extra.json。
const groupTreeByFile = (tree: ConfigTree): Map<string, ConfigTree> => {
  const groups = new Map<string, ConfigTree>()
  for (const [key, value] of Object.entries(tree)) {
    const file = CONFIG_ROUTES[key] ?? EXTRA_CONFIG_FILE
    const group = groups.get(file) ?? {}
    group[key] = value
    groups.set(file, group)
  }
  return groups
}

// 原子写单文件：临时文件 + rename，避免写一半损坏。
const writeConfigFileAtomic = (filePath: string, data: ConfigTree): void => {
  const temporaryPath = `${filePath}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
  renameSync(temporaryPath, filePath)
}

/**
 * 一次性迁移旧 `config.json`：先写 `config.tmp/` 再整体改名为 `config/`（崩溃安全、幂等），
 * 成功后把旧文件改名为 `config.json.bak`。损坏的旧文件保持原样并跳过迁移。
 */
const migrateLegacyConfig = (configPath: string, warn: (message: string) => void): void => {
  const configDir = getConfigDir(configPath)
  if (existsSync(configDir)) return
  if (!existsSync(configPath)) return

  let legacy: ConfigTree
  try {
    const text = readFileSync(configPath, "utf8").trim()
    const parsed: unknown = text ? JSON.parse(text) : {}
    if (!isRecord(parsed)) throw new Error("根节点必须是对象")
    legacy = parsed
  } catch (error) {
    if (!legacyMigrationFailed.has(configPath)) {
      legacyMigrationFailed.add(configPath)
      warn(
        `[config] 旧配置文件迁移失败，保持原样并跳过迁移: ${
          error instanceof Error ? error.message : error
        }`,
      )
    }
    return
  }

  const temporaryDir = `${configDir}.tmp`
  try {
    rmSync(temporaryDir, { recursive: true, force: true })
    mkdirSync(temporaryDir, { recursive: true })
    for (const [file, data] of groupTreeByFile(legacy)) {
      writeConfigFileAtomic(join(temporaryDir, file), data)
    }
    renameSync(temporaryDir, configDir)
  } catch (error) {
    rmSync(temporaryDir, { recursive: true, force: true })
    warn(`[config] 迁移旧配置文件失败，保持原样: ${error instanceof Error ? error.message : error}`)
    return
  }

  legacyMigrationFailed.delete(configPath)
  try {
    rmSync(`${configPath}.bak`, { force: true })
    renameSync(configPath, `${configPath}.bak`)
  } catch (error) {
    warn(`[config] 旧配置文件备份改名失败: ${error instanceof Error ? error.message : error}`)
  }
}

/**
 * 读取合并配置树；首次读取时按需触发旧文件迁移。
 */
export const readMergedConfig = (
  configPath: string,
  warn: (message: string) => void = console.warn,
): ConfigTree => {
  migrateLegacyConfig(configPath, warn)
  return loadConfigTree(configPath, warn)
}

/**
 * 读取合并配置、按变更函数构建新树并原子写盘：只重写发生变化的顶层 key 所属文件。
 */
export const updateMergedConfig = (
  configPath: string,
  mutate: (rawConfig: ConfigTree) => ConfigTree,
  warn: (message: string) => void = console.warn,
): ConfigTree => {
  migrateLegacyConfig(configPath, warn)
  const before = loadConfigTree(configPath, warn)
  const after = mutate({ ...before })

  const changedKeys = new Set<string>()
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changedKeys.add(key)
  }
  if (changedKeys.size === 0) return after

  const configDir = getConfigDir(configPath)
  mkdirSync(configDir, { recursive: true })
  const changedFiles = new Set(
    [...changedKeys].map((key) => CONFIG_ROUTES[key] ?? EXTRA_CONFIG_FILE),
  )
  for (const file of changedFiles) {
    const data: ConfigTree = {}
    for (const [key, value] of Object.entries(after)) {
      if ((CONFIG_ROUTES[key] ?? EXTRA_CONFIG_FILE) === file) data[key] = value
    }
    writeConfigFileAtomic(join(configDir, file), data)
  }
  return after
}

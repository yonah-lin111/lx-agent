import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export type ConfigTree = Record<string, unknown>

// 与生产 configStore 的布局契约保持一致；漂移会让测试显式失败。
const CONFIG_ROUTES: Readonly<Record<string, string>> = {
  ai: "ai.json",
  bailian: "ai.json",
  builtinProviders: "builtin-providers.json",
  agent: "agent.json",
  openclaw: "openclaw.json",
  ui: "app.json",
  cli: "app.json",
  voice: "app.json",
  tokenSaver: "app.json",
}
const EXTRA_CONFIG_FILE = "extra.json"

export const getTestConfigDir = (configPath: string): string => join(dirname(configPath), "config")

/**
 * 测试辅助：按生产路由表把整树写入新布局 `config/` 目录（不清理未涉及的已有文件）。
 */
export const writeConfigTree = (configPath: string, tree: ConfigTree): void => {
  const configDir = getTestConfigDir(configPath)
  mkdirSync(configDir, { recursive: true })

  const groups = new Map<string, ConfigTree>()
  for (const [key, value] of Object.entries(tree)) {
    const file = CONFIG_ROUTES[key] ?? EXTRA_CONFIG_FILE
    const group = groups.get(file) ?? {}
    group[key] = value
    groups.set(file, group)
  }

  for (const [file, data] of groups) {
    writeFileSync(join(configDir, file), `${JSON.stringify(data, null, 2)}\n`, "utf8")
  }
}

/**
 * 测试辅助：独立合并读取新布局 `config/` 目录的全部 JSON 文件（不复用生产读取逻辑）。
 */
export const readConfigTree = (configPath: string): ConfigTree => {
  const configDir = getTestConfigDir(configPath)
  if (!existsSync(configDir)) return {}

  const merged: ConfigTree = {}
  for (const file of readdirSync(configDir)) {
    if (!file.endsWith(".json")) continue
    const parsed = JSON.parse(readFileSync(join(configDir, file), "utf8")) as ConfigTree
    Object.assign(merged, parsed)
  }
  return merged
}

/**
 * 测试辅助：预置旧版单文件 `config.json`（用于迁移测试）。
 */
export const seedLegacyConfig = (configPath: string, tree: ConfigTree): void => {
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(tree, null, 2)}\n`, "utf8")
}

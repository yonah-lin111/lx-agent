import { exec } from "node:child_process"
import { existsSync } from "node:fs"
import type { CliId, CliLifecycleResult, CliVersionInfo } from "@shared/settings"
import { getCliSettings } from "./settingsService"

export interface CliDefinition {
  id: CliId
  name: string
  displayName: string
  command: string
  binaryCandidates: string[]
  npmPackage?: string
  homepage: string
  installCommand: string
  updateCommand: string
  versionArgs?: string[]
}

export const CLI_DEFINITIONS: Record<CliId, CliDefinition> = {
  claude: {
    id: "claude",
    name: "claude",
    displayName: "Claude Code",
    command: "claude",
    binaryCandidates: ["claude"],
    npmPackage: "@anthropic-ai/claude-code",
    homepage: "https://claude.ai",
    installCommand:
      process.platform === "win32"
        ? "npm i -g @anthropic-ai/claude-code@latest"
        : "bash -c 'tmp=$(mktemp) && curl -fsSL https://claude.ai/install.sh -o $tmp && bash $tmp; status=$?; rm -f $tmp; exit $status' || npm i -g @anthropic-ai/claude-code@latest",
    updateCommand: "claude update || npm i -g @anthropic-ai/claude-code@latest",
    versionArgs: ["--version"],
  },
  codex: {
    id: "codex",
    name: "codex",
    displayName: "Codex",
    command: "codex",
    binaryCandidates: ["codex"],
    npmPackage: "@openai/codex",
    homepage: "https://github.com/openai/codex",
    installCommand: "npm i -g @openai/codex@latest",
    updateCommand: "codex update || npm i -g @openai/codex@latest",
    versionArgs: ["--version"],
  },
  gemini: {
    id: "gemini",
    name: "gemini",
    displayName: "Gemini CLI",
    command: "gemini",
    binaryCandidates: ["gemini"],
    npmPackage: "@google/gemini-cli",
    homepage: "https://github.com/google-gemini/gemini-cli",
    installCommand: "npm i -g @google/gemini-cli@latest",
    updateCommand: "npm i -g @google/gemini-cli@latest",
    versionArgs: ["--version"],
  },
  opencode: {
    id: "opencode",
    name: "opencode",
    displayName: "OpenCode",
    command: "opencode",
    binaryCandidates: ["opencode"],
    npmPackage: "opencode-ai",
    homepage: "https://opencode.ai",
    installCommand:
      process.platform === "win32"
        ? "npm i -g opencode-ai@latest"
        : "bash -c 'tmp=$(mktemp) && curl -fsSL https://opencode.ai/install -o $tmp && bash $tmp; status=$?; rm -f $tmp; exit $status' || npm i -g opencode-ai@latest",
    updateCommand: "opencode upgrade || npm i -g opencode-ai@latest",
    versionArgs: ["--version"],
  },
  agy: {
    id: "agy",
    name: "agy",
    displayName: "Antigravity",
    command: "agy",
    binaryCandidates: ["agy", "antigravity"],
    npmPackage: "@google/antigravity",
    homepage: "https://github.com/google/antigravity",
    installCommand: "npm i -g @google/antigravity@latest",
    updateCommand: "npm i -g @google/antigravity@latest",
    versionArgs: ["--version"],
  },
  grok: {
    id: "grok",
    name: "grok",
    displayName: "Grok Build",
    command: "grok",
    binaryCandidates: ["grok"],
    npmPackage: "@xai-official/grok",
    homepage: "https://x.ai",
    installCommand: "npm i -g @xai-official/grok@latest",
    updateCommand: "grok update || npm i -g @xai-official/grok@latest",
    versionArgs: ["--version"],
  },
}


// 模块级版本缓存（5 分钟 TTL）
const CACHE_TTL_MS = 5 * 60 * 1000
let versionCache: { data: CliVersionInfo[]; timestamp: number } | null = null

/**
 * 构造包含常见用户路径的完整 PATH 环境变量。
 */
export const getExtendedPath = (): string => {
  const home = process.env.HOME || process.env.USERPROFILE || ""
  const defaultPaths = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    `${home}/.local/bin`,
    `${home}/.cargo/bin`,
    `${home}/.npm-global/bin`,
    `${home}/bin`,
  ]
  const existing = process.env.PATH || ""
  const delimiter = process.platform === "win32" ? ";" : ":"
  const existingParts = existing.split(delimiter)
  const merged = Array.from(new Set([...existingParts, ...defaultPaths])).filter(Boolean)
  return merged.join(delimiter)
}

/**
 * 执行 Shell 命令并捕获 stdout, stderr 和 exitCode。
 */
export const execShellCommand = (
  command: string,
  timeoutMs = 60_000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  return new Promise((resolve) => {
    const shell = process.platform === "win32" ? undefined : process.env.SHELL || "/bin/bash"
    const env = {
      ...process.env,
      PATH: getExtendedPath(),
    }
    exec(command, { shell, env, timeout: timeoutMs }, (error, stdout, stderr) => {
      const exitCode = error ? (typeof error.code === "number" ? error.code : 1) : 0
      resolve({
        stdout: stdout?.toString() || "",
        stderr: stderr?.toString() || (error ? error.message : ""),
        exitCode,
      })
    })
  })
}

/**
 * 从文本中提取符合 SemVer 的版本字符串。
 */
export const extractVersionFromOutput = (output: string): string | null => {
  if (!output) return null
  const match = /(?:version\s*|v)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/i.exec(output)
  return match ? match[1] : null
}

/**
 * 比较两个版本字符串，判断是否有更新可用。
 */
export const isUpdateAvailable = (current: string | null, latest: string | null): boolean => {
  if (!current || !latest) return false
  const cleanCurrent = current.replace(/^v/i, "").trim()
  const cleanLatest = latest.replace(/^v/i, "").trim()
  if (cleanCurrent === cleanLatest) return false

  const parse = (v: string) => {
    const base = v.split("-")[0]
    return base.split(".").map((n) => parseInt(n, 10) || 0)
  }
  const p1 = parse(cleanCurrent)
  const p2 = parse(cleanLatest)
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0
    const num2 = p2[i] || 0
    if (num2 > num1) return true
    if (num2 < num1) return false
  }
  return false
}

/**
 * 从 npm Registry 查询最新版本。
 */
export const fetchNpmLatestVersion = async (npmPackage?: string): Promise<string | null> => {
  if (!npmPackage) return null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(npmPackage)}/latest`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) return null
    const json = (await response.json()) as { version?: string }
    return json.version || null
  } catch {
    return null
  }
}

/**
 * 探测单个 CLI 工具的安装与版本信息。
 */
export const probeSingleCli = async (
  def: CliDefinition,
  customPath?: string,
): Promise<CliVersionInfo> => {
  let executablePath: string | null = null
  let version: string | null = null
  let error: string | null = null
  let installedButBroken = false

  // 1. 检查是否存在有效路径
  if (customPath && existsSync(customPath)) {
    executablePath = customPath
  } else {
    const whichCmd = process.platform === "win32" ? "where" : "which"
    for (const candidate of def.binaryCandidates) {
      const res = await execShellCommand(`${whichCmd} ${candidate}`, 5000)
      if (res.exitCode === 0 && res.stdout.trim()) {
        executablePath = res.stdout.trim().split("\n")[0].trim()
        break
      }
    }
  }

  // 2. 探测本地版本
  if (executablePath) {
    const versionArgs = def.versionArgs?.join(" ") || "--version"
    const res = await execShellCommand(`"${executablePath}" ${versionArgs}`, 8000)
    if (res.exitCode === 0 && res.stdout) {
      version = extractVersionFromOutput(res.stdout)
      if (!version) {
        // 尝试从 stderr 提取（部分工具输出版本至 stderr）
        version = extractVersionFromOutput(res.stderr)
      }
      if (!version) {
        installedButBroken = true
        error = "无法从命令输出中解析版本号"
      }
    } else {
      installedButBroken = true
      error = res.stderr.trim() || res.stdout.trim() || `命令退出码: ${res.exitCode}`
    }
  }

  // 3. 异步查询远程最新版本
  const latestVersion = await fetchNpmLatestVersion(def.npmPackage)
  const hasUpdate = isUpdateAvailable(version, latestVersion)

  return {
    id: def.id,
    name: def.name,
    displayName: def.displayName,
    command: def.command,
    installed: Boolean(version),
    version,
    latestVersion,
    hasUpdate,
    path: executablePath,
    error,
    installedButBroken,
    npmPackage: def.npmPackage,
    homepage: def.homepage,
  }
}


/**
 * 获取所有支持的 CLI 工具版本信息（支持缓存与并发查询）。
 */
export const getCliVersions = async (options?: { force?: boolean }): Promise<CliVersionInfo[]> => {
  const force = options?.force ?? false
  if (!force && versionCache && Date.now() - versionCache.timestamp < CACHE_TTL_MS) {
    return versionCache.data
  }

  const settings = getCliSettings()
  const cliIds = Object.keys(CLI_DEFINITIONS) as CliId[]

  const results = await Promise.all(
    cliIds.map((id) => {
      const def = CLI_DEFINITIONS[id]
      const customPath = settings.customPaths?.[id]
      return probeSingleCli(def, customPath)
    }),
  )

  versionCache = {
    data: results,
    timestamp: Date.now(),
  }

  return results
}

/**
 * 执行 CLI 工具生命周期操作（安装或升级）。
 */
export const runCliLifecycleAction = async (
  cliId: CliId,
  action: "install" | "update",
): Promise<CliLifecycleResult> => {
  const def = CLI_DEFINITIONS[cliId]
  if (!def) {
    return { success: false, message: `未知的 CLI 工具: ${cliId}` }
  }

  const command = action === "install" ? def.installCommand : def.updateCommand
  const result = await execShellCommand(command, 180_000)

  // 操作完成后使缓存失效
  versionCache = null

  if (result.exitCode === 0) {
    return {
      success: true,
      message: `${def.displayName} ${action === "install" ? "安装" : "升级"}成功`,
      detail: result.stdout.trim(),
    }
  }

  const rawError = result.stderr.trim() || result.stdout.trim() || `退出码: ${result.exitCode}`
  const lastLine = rawError.split("\n").filter(Boolean).slice(-5).join("\n")

  return {
    success: false,
    message: `${def.displayName} ${action === "install" ? "安装" : "升级"}失败`,
    detail: lastLine,
  }
}

export const invalidateCliVersionCache = (): void => {
  versionCache = null
}

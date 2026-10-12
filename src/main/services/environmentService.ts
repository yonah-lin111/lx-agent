import { exec } from "node:child_process"
import type { EnvironmentId, EnvironmentRuntimeInfo } from "@shared/settings"
import { getExtendedPath } from "./cliToolService"

export interface EnvironmentDefinition {
  id: EnvironmentId
  name: string
  displayName: string
  command: string
  candidateCommands: string[]
  versionArgs: string[]
  isRequired: boolean
  descriptionKey: string
  downloadUrl: string
}

export const ENVIRONMENT_DEFINITIONS: Record<EnvironmentId, EnvironmentDefinition> = {
  git: {
    id: "git",
    name: "git",
    displayName: "Git",
    command: "git",
    candidateCommands: ["git"],
    versionArgs: ["--version"],
    isRequired: true,
    descriptionKey: "settings.environmentGitDesc",
    downloadUrl: "https://git-scm.com",
  },
  node: {
    id: "node",
    name: "node",
    displayName: "Node.js",
    command: "node",
    candidateCommands: ["node"],
    versionArgs: ["-v"],
    isRequired: true,
    descriptionKey: "settings.environmentNodeDesc",
    downloadUrl: "https://nodejs.org",
  },
  python: {
    id: "python",
    name: "python",
    displayName: "Python",
    command: "python3",
    candidateCommands: ["python3", "python"],
    versionArgs: ["--version"],
    isRequired: false,
    descriptionKey: "settings.environmentPythonDesc",
    downloadUrl: "https://www.python.org",
  },
  java: {
    id: "java",
    name: "java",
    displayName: "Java",
    command: "java",
    candidateCommands: ["java"],
    versionArgs: ["-version"],
    isRequired: false,
    descriptionKey: "settings.environmentJavaDesc",
    downloadUrl: "https://adoptium.net",
  },
}

// 模块级缓存（5 分钟 TTL）
const CACHE_TTL_MS = 5 * 60 * 1000
let environmentCache: { data: EnvironmentRuntimeInfo[]; timestamp: number } | null = null

type ShellExecutor = typeof exec
let currentExecutor: ShellExecutor = exec

export const setShellExecutorForTest = (executor: ShellExecutor | null): void => {
  currentExecutor = executor ?? exec
}

export const clearEnvironmentCache = (): void => {
  environmentCache = null
}

export const extractEnvironmentVersion = (output: string): string | null => {
  if (!output) return null
  // 匹配常规 semver 以及 Java 的 1.8.0_291 / 23.0.2 / 21+35 等
  const match = /(?:version\s*"?|v)?(\d+(?:\.\d+)+(?:[._-][0-9A-Za-z.-]+)?)/i.exec(output)
  return match ? match[1] : null
}

export const execCommandWithTimeout = (
  command: string,
  timeoutMs = 3000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  return new Promise((resolve) => {
    const shell = process.platform === "win32" ? undefined : process.env.SHELL || "/bin/bash"
    const env = {
      ...process.env,
      PATH: getExtendedPath(),
    }
    try {
      currentExecutor(command, { shell, env, timeout: timeoutMs }, (error, stdout, stderr) => {
        const exitCode = error ? (typeof error.code === "number" ? error.code : 1) : 0
        resolve({
          stdout: stdout?.toString() || "",
          stderr: stderr?.toString() || (error ? error.message : ""),
          exitCode,
        })
      })
    } catch (err) {
      resolve({
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        exitCode: 1,
      })
    }
  })
}

export const probeSingleEnvironment = async (
  def: EnvironmentDefinition,
): Promise<EnvironmentRuntimeInfo> => {
  const whichCmd = process.platform === "win32" ? "where" : "which"

  for (const candidate of def.candidateCommands) {
    let executablePath: string | null = null
    // 1. 尝试查找命令绝对路径
    const whichRes = await execCommandWithTimeout(`${whichCmd} ${candidate}`, 3000)
    if (whichRes.exitCode === 0 && whichRes.stdout.trim()) {
      executablePath = whichRes.stdout.trim().split("\n")[0].trim()
    }

    // 2. 尝试执行版本检测
    const targetExec = executablePath ? `"${executablePath}"` : candidate
    const versionArgs = def.versionArgs.join(" ")
    const res = await execCommandWithTimeout(`${targetExec} ${versionArgs}`, 3000)

    // 既检查 stdout 也检查 stderr（Java 和部分工具会将版本输出到 stderr）
    const combinedOutput = `${res.stdout}\n${res.stderr}`
    const version = extractEnvironmentVersion(combinedOutput)

    if (version) {
      return {
        id: def.id,
        name: def.name,
        displayName: def.displayName,
        command: candidate,
        installed: true,
        version,
        path: executablePath,
        isRequired: def.isRequired,
        descriptionKey: def.descriptionKey,
        downloadUrl: def.downloadUrl,
      }
    }
  }

  return {
    id: def.id,
    name: def.name,
    displayName: def.displayName,
    command: def.command,
    installed: false,
    version: null,
    path: null,
    isRequired: def.isRequired,
    descriptionKey: def.descriptionKey,
    downloadUrl: def.downloadUrl,
  }
}

export const getEnvironmentVersions = async (options?: {
  force?: boolean
}): Promise<EnvironmentRuntimeInfo[]> => {
  const now = Date.now()
  if (!options?.force && environmentCache && now - environmentCache.timestamp < CACHE_TTL_MS) {
    return environmentCache.data
  }

  const defs: EnvironmentDefinition[] = [
    ENVIRONMENT_DEFINITIONS.git,
    ENVIRONMENT_DEFINITIONS.node,
    ENVIRONMENT_DEFINITIONS.python,
    ENVIRONMENT_DEFINITIONS.java,
  ]

  const results = await Promise.all(defs.map((def) => probeSingleEnvironment(def)))
  environmentCache = { data: results, timestamp: now }
  return results
}

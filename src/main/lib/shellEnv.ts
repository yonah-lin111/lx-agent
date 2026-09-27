import { execFile } from "node:child_process"
import { existsSync } from "node:fs"

// 登录 shell PATH 解析超时（ms）：rc 脚本可能执行较慢。
const SHELL_PATH_TIMEOUT_MS = 5_000

// 输出标记：从 shell 输出中提取 PATH 本体，隔离 rc 脚本的杂散输出。
const PATH_START_MARKER = "__LX_AGENT_PATH_START__"
const PATH_END_MARKER = "__LX_AGENT_PATH_END__"

// 当前平台的 PATH 分隔符。
const getPathDelimiter = (): string => (process.platform === "win32" ? ";" : ":")

/**
 * 解析用户登录 shell 的 PATH。
 * macOS/Linux 的 GUI 进程不继承终端环境（nvm/homebrew 等 rc 注入路径缺失），需经登录 shell 读取；
 * Windows GUI 进程已继承注册表用户环境，直接返回 null。
 */
export const resolveLoginShellPath = (): Promise<string | null> =>
  new Promise((resolve) => {
    if (process.platform === "win32") {
      resolve(null)
      return
    }
    const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash")
    if (!existsSync(shell)) {
      resolve(null)
      return
    }
    const script = `printf '${PATH_START_MARKER}%s${PATH_END_MARKER}' "$PATH"`
    execFile(
      shell,
      ["-ilc", script],
      { timeout: SHELL_PATH_TIMEOUT_MS, encoding: "utf8", env: process.env },
      (_error, stdout) => {
        const start = stdout.indexOf(PATH_START_MARKER)
        const end = stdout.indexOf(PATH_END_MARKER, start + PATH_START_MARKER.length)
        if (start < 0 || end < 0) {
          resolve(null)
          return
        }
        const path = stdout.slice(start + PATH_START_MARKER.length, end).trim()
        resolve(path.includes(getPathDelimiter()) ? path : null)
      },
    )
  })

/**
 * 合并 PATH：解析结果优先（用户工具版本胜出），保留现有条目，去重并丢弃空段。
 */
export const mergePathValue = (
  current: string | undefined,
  resolved: string,
  delimiter: string,
): string => {
  const parts = [...resolved.split(delimiter), ...(current ?? "").split(delimiter)]
    .map((part) => part.trim())
    .filter(Boolean)
  return [...new Set(parts)].join(delimiter)
}

let ensurePromise: Promise<void> | null = null

/**
 * 启动时调用一次：把登录 shell PATH 合并进 process.env.PATH（幂等缓存）。
 * 解析失败保持现状，不影响既有兜底逻辑（如 getExtendedPath）。
 */
export const ensureLoginShellPath = (): Promise<void> => {
  ensurePromise ??= resolveLoginShellPath().then((resolved) => {
    if (resolved) {
      process.env.PATH = mergePathValue(process.env.PATH, resolved, getPathDelimiter())
    }
  })
  return ensurePromise
}

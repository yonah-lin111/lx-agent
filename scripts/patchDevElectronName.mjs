#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { basename, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

// package.json 缺少 build.productName 时的兜底显示名。
const FALLBACK_PRODUCT_NAME = "LX Agent"

// git 探测单条命令超时（ms）。
const GIT_TIMEOUT_MS = 2000

// 需要改写的 plist 键（Dock tooltip / ⌘-Tab / 菜单栏各有取值来源，一起对齐）。
const PLIST_NAME_KEYS = ["CFBundleName", "CFBundleDisplayName"]

/**
 * 生成开发态环境标签（与 src/main/lib/devEnvLabel.ts 同规则；运行期与启动前两条链路各自本地计算）。
 */
export const formatDevEnvLabel = (info) => {
  const branch = info.branch.trim()
  if (branch === "" || branch === "HEAD") {
    return info.detachedSha?.trim() || null
  }
  const worktreeName = info.worktreeName.trim()
  if (!info.isLinkedWorktree || worktreeName === "") return branch
  if (branch === worktreeName || branch.endsWith(`/${worktreeName}`)) return branch
  return `${branch}-${worktreeName}`
}

/**
 * 组合 Electron 应用名：有环境标签时追加 ` · <标签>`。
 */
export const computeDevAppName = (productName, envLabel) =>
  envLabel ? `${productName} · ${envLabel}` : productName

/**
 * 由 electron 可执行文件路径推导所属 bundle 的 Info.plist 路径。
 */
export const resolveInfoPlistPath = (electronBinPath) =>
  resolve(electronBinPath, "../../Info.plist")

// 同步执行 git 子命令并裁剪输出。
const runGit = (cwd, args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  }).trim()

/**
 * 探测 cwd 的 git 环境并生成标签；任何失败返回 null（不追加后缀）。
 */
export const resolveDevEnvLabel = (cwd) => {
  try {
    const branch = runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
    const detachedSha =
      branch === "HEAD" ? runGit(cwd, ["rev-parse", "--short", "HEAD"]) : undefined
    const [toplevel = "", gitDir = "", gitCommonDir = ""] = runGit(cwd, [
      "rev-parse",
      "--show-toplevel",
      "--git-dir",
      "--git-common-dir",
    ]).split("\n")
    if (!toplevel) return null
    return formatDevEnvLabel({
      branch,
      detachedSha,
      worktreeName: basename(toplevel),
      isLinkedWorktree: resolve(cwd, gitDir) !== resolve(cwd, gitCommonDir),
    })
  } catch {
    return null
  }
}

// 读取 package.json 的显示名（electron-builder productName 优先）。
const readProductName = (cwd) => {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"))
    return pkg?.build?.productName || pkg?.productName || FALLBACK_PRODUCT_NAME
  } catch {
    return FALLBACK_PRODUCT_NAME
  }
}

// PlistBuddy 读取键值；键不存在或读取失败返回空串。
export const readPlistValue = (plistPath, key) => {
  try {
    return execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plistPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return ""
  }
}

// PlistBuddy 写入键值（Set 失败时 Add）。
const writePlistValue = (plistPath, key, value) => {
  try {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plistPath])
  } catch {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Add :${key} string ${value}`, plistPath])
  }
}

// 断开 pnpm store 硬链接：读入 → unlink → 回写，避免 PlistBuddy 通过硬链接污染全局 store。
const detachHardlink = (filePath) => {
  const original = readFileSync(filePath)
  unlinkSync(filePath)
  writeFileSync(filePath, original)
}

/**
 * macOS 开发态改名：Dock / ⌘-Tab / 菜单栏名称来自运行 bundle 的 Info.plist，
 * 运行时 API（app.setName）无法覆盖，必须在 Electron 启动前改写（predev 钩子）。
 * 幂等；失败只警告不阻塞 dev 启动；非 macOS 直接跳过。
 */
export const patchDevElectronName = () => {
  if (process.platform !== "darwin") return
  const cwd = process.cwd()
  try {
    const electronBin = createRequire(import.meta.url)("electron")
    const plistPath = resolveInfoPlistPath(electronBin)
    if (!existsSync(plistPath)) {
      console.warn(`[dev-electron-name] Info.plist 不存在，跳过：${plistPath}`)
      return
    }

    const appName = computeDevAppName(readProductName(cwd), resolveDevEnvLabel(cwd))
    if (PLIST_NAME_KEYS.every((key) => readPlistValue(plistPath, key) === appName)) return

    detachHardlink(plistPath)
    for (const key of PLIST_NAME_KEYS) writePlistValue(plistPath, key, appName)
    console.log(`[dev-electron-name] ${plistPath} → "${appName}"`)
  } catch (error) {
    console.warn(
      `[dev-electron-name] 改写失败（不影响启动）：${error instanceof Error ? error.message : error}`,
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  patchDevElectronName()
}

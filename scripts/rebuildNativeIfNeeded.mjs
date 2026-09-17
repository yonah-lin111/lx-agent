#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { ensureWorktreeNodeModules } from "./setupWorktreeNodeModules.mjs"

const require = createRequire(import.meta.url)

const nativeModules = [
  {
    name: "better-sqlite3",
    probeScript: "const Database = require('better-sqlite3'); new Database(':memory:').close()",
  },
  {
    name: "node-pty",
    probeScript:
      "const pty = require('node-pty'); if (typeof pty.spawn !== 'function') throw new Error()",
  },
]
const supportedTargets = new Set(["electron", "node"])
const target = process.argv[2]
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const electronProbeEnv = { ...process.env, ELECTRON_RUN_AS_NODE: "1" }

const rebuildEnv = {
  ...process.env,
  ...(process.platform === "darwin" && !process.env.PYTHON ? { PYTHON: "/usr/bin/python3" } : {}),
}

/**
 * 输出错误并退出。
 */
const fail = (message) => {
  console.error(message)
  process.exit(1)
}

/**
 * 组装子进程参数：Windows 下 .cmd/.bat 不能直接 spawn（Node 安全修复后返回 EINVAL），
 * 必须经 shell 执行；本脚本传入的参数都是无空格的字面量，可安全交由 shell 拼接。
 */
export const resolveSpawnSpec = (command, args, platform = process.platform) =>
  platform === "win32" && /\.(cmd|bat)$/i.test(command)
    ? { file: command, args, shell: true }
    : { file: command, args, shell: false }

/**
 * 执行子命令。
 */
const run = (command, args, options = {}) => {
  const spec = resolveSpawnSpec(command, args)
  return spawnSync(spec.file, spec.args, {
    cwd: process.cwd(),
    env: rebuildEnv,
    stdio: "inherit",
    shell: spec.shell,
    ...options,
  })
}

// electron 包在 Node 环境下导出可执行文件路径：直接 spawn 该可执行文件，避免经 pnpm(.cmd)
// 转发，也避免带空格的 `-e` 内联脚本被 shell 拆成多个参数。
const resolveElectronBinary = () => require("electron")

/**
 * 探测原生模块是否适配当前目标运行时。
 */
const canLoadNativeModule = (probeScript) => {
  if (target === "node") {
    return run(process.execPath, ["-e", probeScript], { stdio: "ignore" }).status === 0
  }

  return (
    run(resolveElectronBinary(), ["-e", probeScript], {
      env: electronProbeEnv,
      stdio: "ignore",
    }).status === 0
  )
}

/**
 * 检查所有原生模块是否已适配。
 */
const allNativeModulesMatch = () =>
  nativeModules.every((mod) => canLoadNativeModule(mod.probeScript))

/**
 * 为目标运行时重建原生模块。
 */
const rebuildNativeModules = () => {
  const moduleNames = nativeModules.map((mod) => mod.name)

  if (target === "node") {
    return run(pnpmCommand, ["rebuild", ...moduleNames])
  }

  return run(pnpmCommand, [
    "exec",
    "electron-rebuild",
    "-f",
    "-w",
    moduleNames.join(","),
    "--build-from-source",
  ])
}

/**
 * 入口：工作区 node_modules 不可用时先复用主仓库安装，再按需重建原生模块。
 */
export const main = () => {
  if (!supportedTargets.has(target)) {
    fail("用法: node scripts/rebuildNativeIfNeeded.mjs <electron|node>")
  }

  // 工作区 node_modules 缺失/为空时，先复用主仓库安装，避免探测直接失败。
  const setupResult = ensureWorktreeNodeModules()
  if (!setupResult.ok) fail(setupResult.message)
  if (setupResult.message) console.log(setupResult.message)

  if (allNativeModulesMatch()) {
    console.log(
      `Native modules (${nativeModules.map((mod) => mod.name).join(", ")}) already match ${target} runtime; skip rebuild.`,
    )
    return
  }

  console.log(`Native modules do not match ${target} runtime; rebuilding...`)
  const rebuildResult = rebuildNativeModules()

  if (rebuildResult.status !== 0) {
    process.exit(rebuildResult.status ?? 1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { ensureWorktreeNodeModules } from "./setupWorktreeNodeModules.mjs"

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

/**
 * 输出错误并退出。
 */
const fail = (message) => {
  console.error(message)
  process.exit(1)
}

/**
 * 执行子命令。
 */
const run = (command, args, options = {}) =>
  spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    ...options,
  })

/**
 * 探测原生模块是否适配当前目标运行时。
 */
const canLoadNativeModule = (probeScript) => {
  if (target === "node") {
    return run(process.execPath, ["-e", probeScript], { stdio: "ignore" }).status === 0
  }

  return (
    run(pnpmCommand, ["exec", "electron", "-e", probeScript], {
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

if (!supportedTargets.has(target)) {
  fail("用法: node scripts/rebuildNativeIfNeeded.mjs <electron|node>")
}

// 工作区 node_modules 缺失/为空时，先复用主仓库安装，避免 `pnpm exec electron` 探测失败。
const setupResult = ensureWorktreeNodeModules()
if (!setupResult.ok) fail(setupResult.message)
if (setupResult.message) console.log(setupResult.message)

if (allNativeModulesMatch()) {
  console.log(
    `Native modules (${nativeModules.map((mod) => mod.name).join(", ")}) already match ${target} runtime; skip rebuild.`,
  )
  process.exit(0)
}

console.log(`Native modules do not match ${target} runtime; rebuilding...`)
const rebuildResult = rebuildNativeModules()

if (rebuildResult.status !== 0) {
  process.exit(rebuildResult.status ?? 1)
}

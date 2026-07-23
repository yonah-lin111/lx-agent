#!/usr/bin/env node

import { spawnSync } from "node:child_process"

const nativeModuleName = "better-sqlite3"
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
const canLoadNativeModule = () => {
  const script = `const Database = require('${nativeModuleName}'); new Database(':memory:').close()`

  if (target === "node") {
    return run(process.execPath, ["-e", script], { stdio: "ignore" }).status === 0
  }

  return (
    run(pnpmCommand, ["exec", "electron", "-e", script], {
      env: electronProbeEnv,
      stdio: "ignore",
    }).status === 0
  )
}

/**
 * 为目标运行时重建原生模块。
 */
const rebuildNativeModule = () => {
  if (target === "node") {
    return run(pnpmCommand, ["rebuild", nativeModuleName])
  }

  return run(pnpmCommand, [
    "exec",
    "electron-rebuild",
    "-f",
    "-w",
    nativeModuleName,
    "--build-from-source",
  ])
}

if (!supportedTargets.has(target)) {
  fail("用法: node scripts/rebuildNativeIfNeeded.mjs <electron|node>")
}

if (canLoadNativeModule()) {
  console.log(`${nativeModuleName} already matches ${target} runtime; skip rebuild.`)
  process.exit(0)
}

console.log(`${nativeModuleName} does not match ${target} runtime; rebuilding...`)
const rebuildResult = rebuildNativeModule()

if (rebuildResult.status !== 0) {
  process.exit(rebuildResult.status ?? 1)
}

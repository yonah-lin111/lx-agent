#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

// 一键递增级别到 semver 主/次/修订位的映射。
const BUMP_LEVELS = { major: 0, minor: 1, patch: 2 }

/**
 * 计算目标版本号：支持 patch / minor / major 与显式 x.y.z（可带预发布后缀）。
 * 当前版本非法、输入非法或与当前版本相同时返回 null。
 */
export const resolveNextVersion = (current, input) => {
  const currentVersion = String(current ?? "").trim()
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(currentVersion)
  if (!match) return null

  const numbers = [Number(match[1]), Number(match[2]), Number(match[3])]
  const level =
    BUMP_LEVELS[
      String(input ?? "")
        .trim()
        .toLowerCase()
    ]
  if (level !== undefined) {
    const next = [...numbers]
    next[level] += 1
    for (let index = level + 1; index < next.length; index += 1) next[index] = 0
    return next.join(".")
  }

  const explicit = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(String(input ?? "").trim())
  if (!explicit) return null

  const candidate = explicit[1]
  return candidate === currentVersion ? null : candidate
}

// 执行 git 子命令并返回去除首尾空白后的输出。
const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim()

const fail = (message) => {
  console.error(`[release] ${message}`)
  process.exit(1)
}

const main = () => {
  const input = process.argv[2]
  if (!input) fail("用法：pnpm release <patch|minor|major|x.y.z>（示例：pnpm release minor）")

  const packagePath = join(process.cwd(), "package.json")
  const current = JSON.parse(readFileSync(packagePath, "utf8")).version
  const nextVersion = resolveNextVersion(current, input)
  if (!nextVersion) fail(`无法从当前版本 ${current} 解析目标版本：${input}`)

  const tag = `v${nextVersion}`
  if (git(["status", "--porcelain"])) fail("工作区存在未提交改动，请先提交后再发版")
  if (git(["tag", "--list", tag])) fail(`tag ${tag} 已存在`)

  // 只改版本号一行，避免整文件重排格式。
  const raw = readFileSync(packagePath, "utf8")
  writeFileSync(packagePath, raw.replace(/^(\s{2}"version":\s*")[^"]+(")/m, `$1${nextVersion}$2`))
  git(["add", "package.json"])
  git(["commit", "-m", `chore(release): ${tag}`])
  git(["tag", "-a", tag, "-m", `LX Agent ${tag}`])
  git(["push", "origin", "HEAD", "--follow-tags"])

  console.log(`[release] ${tag} 已推送，GitHub Actions 将自动构建并发布 Release。`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}

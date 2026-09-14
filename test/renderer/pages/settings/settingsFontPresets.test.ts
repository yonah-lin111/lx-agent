import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// 设置页（LeftSideBar + PageContent 渲染树）字号只允许 xs/sm/lg 三档预设。
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const settingsDirs = ["src/renderer/src/pages/settings", "src/renderer/src/features/settings"].map(
  (relativePath) => path.join(repoRoot, relativePath),
)

const collectFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (/\.(tsx|ts|css)$/.test(entry.name)) out.push(full)
  }
  return out
}

// 禁止的非预设字号：任意值 px/rem/em、Tailwind 默认档与数字/px 形式的 font-size。
const FORBIDDEN_PATTERNS: RegExp[] = [
  /text-\[[0-9.]+(px|rem|em)\]/,
  /text-(base|xl|2xl|3xl|4xl|5xl)\b/,
  /fontSize:\s*["']?[0-9.]+/,
  /font-size:\s*[0-9.]+(px|rem|em)/,
]

const collectViolations = (files: string[]): string[] => {
  const violations: string[] = []
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n")
    lines.forEach((line, index) => {
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(line)) {
          violations.push(`${path.relative(repoRoot, file)}:${index + 1} ${line.trim()}`)
          break
        }
      }
    })
  }
  return violations
}

describe("设置页字号预设", () => {
  it("setting 路由渲染树只使用 xs/sm/lg 三档字号", () => {
    const files = settingsDirs.flatMap((dir) => collectFiles(dir))
    expect(collectViolations(files)).toEqual([])
  })
})

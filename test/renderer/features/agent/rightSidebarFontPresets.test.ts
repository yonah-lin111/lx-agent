import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// 右栏（RightSidebar 渲染树：入口 + features/agent 全部组件）字号只允许 xs/sm/lg 三档预设。
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const rightSidebarEntry = path.join(repoRoot, "src/renderer/src/components/layout/RightSidebar.tsx")
const agentFeatureDir = path.join(repoRoot, "src/renderer/src/features/agent")

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

describe("右栏字号预设", () => {
  it("RightSidebar 与 features/agent 只使用 xs/sm/lg 三档字号", () => {
    const files = [rightSidebarEntry, ...collectFiles(agentFeatureDir)]
    expect(collectViolations(files)).toEqual([])
  })
})

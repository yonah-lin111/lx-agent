import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// 左栏（LeftSideBar 渲染树：入口 + 各页面注入的侧栏内容组件 + project-navigation）字号只允许 xs/sm/lg 三档预设。
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const sidebarEntry = path.join(repoRoot, "src/renderer/src/components/layout/LeftSideBar.tsx")
const sidebarContentFiles = [
  "src/renderer/src/pages/home/components/HomeLeftSideBar.tsx",
  "src/renderer/src/pages/ui/components/UiLeftSideBar.tsx",
  "src/renderer/src/pages/front-design/components/FrontDesignLeftSideBar.tsx",
  "src/renderer/src/pages/settings/components/SettingsLeftSideBar.tsx",
  "src/renderer/src/pages/openclaw/components/OpenClawLeftSideBar.tsx",
  "src/renderer/src/pages/project/components/ProjectLeftSideBar.tsx",
].map((relativePath) => path.join(repoRoot, relativePath))
const projectNavigationDir = path.join(repoRoot, "src/renderer/src/features/project-navigation")

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

describe("左栏字号预设", () => {
  it("LeftSideBar 渲染树只使用 xs/sm/lg 三档字号", () => {
    const files = [sidebarEntry, ...sidebarContentFiles, ...collectFiles(projectNavigationDir)]
    expect(collectViolations(files)).toEqual([])
  })
})

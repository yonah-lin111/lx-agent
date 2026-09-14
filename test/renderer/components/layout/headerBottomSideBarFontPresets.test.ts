import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// 头/底栏（HeaderSideBar 与 BottomSideBar 渲染树）字号只允许 xs/sm/lg 三档预设。
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const barRenderTreeFiles = [
  "src/renderer/src/components/layout/HeaderSideBar.tsx",
  "src/renderer/src/components/layout/BottomSideBar.tsx",
  "src/renderer/src/features/project/components/ProjectRecentItemsTags.tsx",
  "src/renderer/src/features/agent/components/panels/AgentJobsMonitorView.tsx",
  "src/renderer/src/features/terminal/components/GhosttyTerminalView.tsx",
  "src/renderer/src/features/terminal/components/TerminalTabs.tsx",
  "src/renderer/src/features/terminal/components/TerminalSplitView.tsx",
].map((relativePath) => path.join(repoRoot, relativePath))

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

describe("头/底栏字号预设", () => {
  it("HeaderSideBar/BottomSideBar 渲染树只使用 xs/sm/lg 三档字号", () => {
    expect(collectViolations(barRenderTreeFiles)).toEqual([])
  })
})

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// /ui 路由（LeftSideBar + PageContent 渲染树：UI Preview 侧栏、页面与全部组件 Demo）字号只允许 xs/sm/lg 三档预设。
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))

const collectFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full)
  }
  return out
}

const uiRouteTreeDirs = [
  "src/renderer/src/components/ui",
  "src/renderer/src/pages/ui",
  "src/renderer/src/features/agent/components",
  "src/renderer/src/features/git/components",
  "src/renderer/src/features/ui-preview",
].map((relativePath) => path.join(repoRoot, relativePath))

const uiRouteTreeFiles = [
  "src/renderer/src/components/layout/LeftSideBar.tsx",
  "src/renderer/src/components/layout/PageContent.tsx",
  "src/renderer/src/features/markdown/components/MarkdownBlockCommandMenu.tsx",
  "src/renderer/src/features/markdown/components/MarkdownPasteCommandMenu.tsx",
  "src/renderer/src/features/markdown/extensions/editorHighlight.ts",
  "src/renderer/src/features/markdown/extensions/markdownActionWidgets.tsx",
  "src/renderer/src/features/markdown/extensions/markdownAgentMentions.ts",
  "src/renderer/src/features/markdown/extensions/markdownFileMentions.ts",
  "src/renderer/src/features/markdown/extensions/markerDecorations.ts",
  "src/renderer/src/features/markdown/extensions/markerPlugin.ts",
  "src/renderer/src/features/markdown/extensions/markerSubblockHandlers.ts",
  "src/renderer/src/features/markdown/extensions/markerTemplateHandlers.ts",
  "src/renderer/src/features/markdown/extensions/markerWidgets.ts",
].map((relativePath) => path.join(repoRoot, relativePath))

// 禁止的非预设字号：任意值 px/rem/em、Tailwind 默认档、绝对值的 fontSize/font-size；
// 允许 var(--text-*) 引用预设与 Markdown 标题的 em 相对比例。
const FORBIDDEN_PATTERNS: RegExp[] = [
  /text-\[[0-9.]+(px|rem|em)\]/,
  /text-(base|xl|2xl|3xl|4xl|5xl)\b/,
  /fontSize:\s*["']?[0-9.]+(px|rem)/,
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

describe("ui 路由字号预设", () => {
  it("LeftSideBar/PageContent 渲染树只使用 xs/sm/lg 三档字号", () => {
    const files = [...uiRouteTreeFiles, ...uiRouteTreeDirs.flatMap((dir) => collectFiles(dir))]
    expect(collectViolations(files)).toEqual([])
  })
})

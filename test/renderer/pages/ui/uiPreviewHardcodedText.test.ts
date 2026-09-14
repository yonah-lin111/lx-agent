import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// UI Preview 页面与全部组件 Demo 的可见文案必须走 i18n，不允许源码内硬编码中文。
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const uiPreviewDir = path.join(repoRoot, "src/renderer/src/pages/ui")

const collectFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full)
  }
  return out
}

// 去掉块注释、JSX 注释与行注释后，仅保留代码正文。
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/.*$/gm, "")

const collectViolations = (files: string[]): string[] => {
  const violations: string[] = []
  for (const file of files) {
    const lines = stripComments(readFileSync(file, "utf8")).split("\n")
    lines.forEach((line, index) => {
      if (/[\u4e00-\u9fa5]/.test(line)) {
        violations.push(`${path.relative(repoRoot, file)}:${index + 1} ${line.trim()}`)
      }
    })
  }
  return violations
}

describe("UI Preview 文案国际化", () => {
  it("页面、侧栏与全部 Demo 源码内不存在硬编码中文", () => {
    expect(collectViolations(collectFiles(uiPreviewDir))).toEqual([])
  })
})

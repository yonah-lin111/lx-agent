import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const minecraftCss = readFileSync(
  fileURLToPath(
    new URL("../../../../src/renderer/src/styles/themes/minecraft/index.css", import.meta.url),
  ),
  "utf8",
)

describe("我的世界主题导航层级词表", () => {
  it("三级层级只认数字 data-item-level，临时提示词改用 data-item-variant", () => {
    for (const level of ["1", "2", "3"]) {
      expect(minecraftCss).toContain(`[data-item-level="${level}"]`)
    }
    expect(minecraftCss).toContain('[data-item-variant="temp-prompt"]')

    for (const legacy of [
      '[data-item-level="project"]',
      '[data-item-level="folder"]',
      '[data-item-level="prompt"]',
      '[data-item-level="temp-prompt"]',
      '[data-item-level="tab"]',
    ]) {
      expect(minecraftCss).not.toContain(legacy)
    }
  })

  it("不再使用按图标兜底的分组件选择器", () => {
    expect(minecraftCss).not.toMatch(/:has\(\s*svg\.(text-sky-400|text-amber-400|lucide-file)/)
  })

  it("ghost 变体不被主题强制浮雕、边框与文字色", () => {
    expect(minecraftCss).toContain('.lx-tag:not([data-variant="ghost"])')
    expect(minecraftCss).toMatch(
      /button:not\(\[role="option"\]\):not\(\.agent-tool-diff-toggle\):not\(\[data-variant="ghost"\]\)/,
    )
    expect(minecraftCss).toMatch(
      /\[role="button"\]:not\(\[role="option"\]\):not\(\.agent-tool-diff-toggle\):not\(\[data-variant="ghost"\]\)/,
    )
    expect(minecraftCss).toContain('.font-semibold:not([data-variant="ghost"])')
    expect(minecraftCss).toMatch(/\.git-status-item:not\(\[data-variant="ghost"\]\)/)
    expect(minecraftCss).toMatch(
      /\.git-status-item\[data-unimported="true"\]:not\(\[data-variant="ghost"\]\)/,
    )
  })

  it("solid LxTag 对齐按钮级浮雕，高亮态保持凸起不凹陷", () => {
    const readBlock = (selector: string): string => {
      const start = minecraftCss.indexOf(selector)
      expect(start).toBeGreaterThanOrEqual(0)
      return minecraftCss.slice(start, minecraftCss.indexOf("}", start))
    }

    const baseBlock = readBlock('.lx-tag:not([data-variant="ghost"])')
    expect(baseBlock).toContain("border: 2px solid #000000")
    expect(baseBlock).toContain("inset -2px -2px 0px 0px")
    expect(baseBlock).toContain("2px 2px 0px 0px #000000")

    for (const selector of [
      '.lx-tag[data-highlighted="true"]:not([data-variant="ghost"])',
      '.project-recent-tag[data-color="default"][data-highlighted="true"] {',
      '.project-recent-tag[data-color="amber"][data-highlighted="true"] {',
      '.project-recent-tag[data-color="emerald"][data-highlighted="true"] {',
      '.project-recent-tag[data-color="sky"][data-highlighted="true"] {',
    ]) {
      const block = readBlock(selector)
      expect(block).toContain("2px 2px 0px 0px #000000")
      expect(block).not.toMatch(/inset 2px 2px 0px 0px rgba\(0, 0, 0, 0\.9/)
    }
  })
})

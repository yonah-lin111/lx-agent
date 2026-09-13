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
})

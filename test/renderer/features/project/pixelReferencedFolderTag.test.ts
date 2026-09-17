import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const pixelCss = readFileSync(
  fileURLToPath(
    new URL("../../../../src/renderer/src/styles/themes/pixel/index.css", import.meta.url),
  ),
  "utf8",
)

describe("我的世界主题引用文件夹标签底色", () => {
  it("引用文件夹标签使用不透明实体底色，不再透出背景", () => {
    const start = pixelCss.indexOf('[data-theme="pixel"] .project-referenced-tag {')
    expect(start).toBeGreaterThanOrEqual(0)

    const block = pixelCss.slice(start, pixelCss.indexOf("}", start))
    expect(block).toContain("background-color: #2e2619 !important")
    expect(block).not.toContain("background-color: rgba(")
  })

  it("引用文件夹标签保留像素槽边框与浮雕，迁移后外观不降级", () => {
    const start = pixelCss.indexOf('[data-theme="pixel"] .project-referenced-tag {')
    expect(start).toBeGreaterThanOrEqual(0)

    const block = pixelCss.slice(start, pixelCss.indexOf("}", start))
    expect(block).toContain("border: 2px solid #000000 !important")
    expect(block).toContain("box-shadow:")
  })
})

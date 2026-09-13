import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const minecraftCss = readFileSync(
  fileURLToPath(
    new URL("../../../../src/renderer/src/styles/themes/minecraft/index.css", import.meta.url),
  ),
  "utf8",
)

describe("我的世界主题引用文件夹标签底色", () => {
  it("引用文件夹标签使用不透明实体底色，不再透出背景", () => {
    const start = minecraftCss.indexOf('[data-theme="minecraft"] .project-referenced-tag {')
    expect(start).toBeGreaterThanOrEqual(0)

    const block = minecraftCss.slice(start, minecraftCss.indexOf("}", start))
    expect(block).toContain("background-color: #2e2619 !important")
    expect(block).not.toContain("rgba(")
  })
})

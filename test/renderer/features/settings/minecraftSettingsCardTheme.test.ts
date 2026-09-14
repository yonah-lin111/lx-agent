import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const minecraftCss = readFileSync(
  fileURLToPath(
    new URL("../../../../src/renderer/src/styles/themes/minecraft/index.css", import.meta.url),
  ),
  "utf8",
)

const getRuleBlock = (selector: string): string => {
  const start = minecraftCss.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)
  return minecraftCss.slice(start, minecraftCss.indexOf("}", start))
}

describe("我的世界主题设置页卡片底纹", () => {
  it.each([
    '[data-theme="minecraft"] .settings-item-card {',
    '[data-theme="minecraft"] .settings-model-card {',
    '[data-theme="minecraft"] .settings-skill-list-card,',
  ])("%s 移除马赛克底纹并保留实体底色与像素浮雕", (selector) => {
    const block = getRuleBlock(selector)
    expect(block).not.toContain("background-image")
    expect(block).toContain("background-color:")
    expect(block).toContain("border: 2px solid #000000 !important")
    expect(block).toContain("box-shadow:")
  })

  it("设置页卡片悬停态同样无马赛克底纹", () => {
    const block = getRuleBlock('[data-theme="minecraft"] .settings-item-card:hover {')
    expect(block).not.toContain("background-image")
    expect(block).toContain("background-color: #242434 !important")
  })
})

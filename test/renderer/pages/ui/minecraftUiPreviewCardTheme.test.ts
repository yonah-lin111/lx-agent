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

describe("我的世界主题 UI 预览卡片底纹", () => {
  it("demo 分区卡片移除马赛克底纹，保留实体底色与像素浮雕", () => {
    const block = getRuleBlock('[data-theme="minecraft"] .ui-preview-section-card {')
    expect(block).not.toContain("background-image")
    expect(block).toContain("background-color: #1e1e2a !important")
    expect(block).toContain("border: 2px solid #000000 !important")
    expect(block).toContain("box-shadow:")
  })

  it("demo 内部容器卡片移除马赛克底纹，保留实体底色与浮雕", () => {
    const block = getRuleBlock(
      '[data-theme="minecraft"] .ui-preview-section-card .bg-\\[\\#1a1a1a\\],',
    )
    expect(block).not.toContain("background-image")
    expect(block).toContain("background-color: #14141e !important")
    expect(block).toContain("border: 2px solid #000000 !important")
    expect(block).toContain("box-shadow:")
  })
})

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

describe("我的世界主题复选框与单选项", () => {
  it("未选中态为像素方格：圆角归零、2px 黑边、凹底与右下硬阴影", () => {
    const block = getRuleBlock('[data-theme="minecraft"] .lx-checkbox-box,')
    expect(block).toContain("border-radius: 0px !important")
    expect(block).toContain("border: 2px solid #000000 !important")
    expect(block).toContain("background-color: #14141d !important")
    expect(block).toContain("2px 2px 0px 0px #000000 !important")
  })

  it("选中态使用经验条荧光绿底、黑边与外发光", () => {
    const block = getRuleBlock(
      '[data-theme="minecraft"] .lx-checkbox input:checked + .lx-checkbox-box,',
    )
    expect(block).toContain("background-color: #55ff55 !important")
    expect(block).toContain("border-color: #000000 !important")
    expect(block).toContain("0px 0px 8px rgba(85, 255, 85, 0.4) !important")
  })

  it("悬停提亮内高光，键盘聚焦叠加绿色微光", () => {
    const hover = getRuleBlock('[data-theme="minecraft"] .lx-checkbox:hover .lx-checkbox-box,')
    expect(hover).toContain("rgba(255, 255, 255, 0.3)")

    const focus = getRuleBlock(
      '[data-theme="minecraft"] .lx-checkbox input:focus-visible + .lx-checkbox-box,',
    )
    expect(focus).toContain("0px 0px 6px rgba(85, 255, 85, 0.35) !important")
  })

  it("单选项行容器圆角归零", () => {
    const block = getRuleBlock('[data-theme="minecraft"] .lx-radio {')
    expect(block).toContain("border-radius: 0px !important")
  })
})

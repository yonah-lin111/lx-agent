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

describe("我的世界主题日程组件", () => {
  it("选中日期使用经验条荧光绿微光覆盖全局黑色按钮边框", () => {
    const block = getRuleBlock('[data-theme="minecraft"] .lx-datepicker-day[aria-pressed="true"],')
    expect(block).toContain("background-color: #14141c !important")
    expect(block).toContain("border: 2px solid #000000 !important")
    expect(block).toContain("rgba(85, 255, 85, 0.2)")
  })

  it("每日条目角标为像素方形经验条", () => {
    const block = getRuleBlock('[data-theme="minecraft"] .lx-datepicker-badge')
    expect(block).toContain("border-radius: 0px !important")
    expect(block).toContain("background-color: #55ff55 !important")
    expect(block).toContain("color: #000000 !important")
  })

  it("优先级徽标保持直角与像素边框", () => {
    const block = getRuleBlock('[data-theme="minecraft"] .lx-schedule-priority')
    expect(block).toContain("border-radius: 0px !important")
    expect(block).toContain("border-width: 2px !important")
  })

  it("日程图表沿用用量图表的像素化规则", () => {
    expect(minecraftCss).toContain(
      '[data-theme="minecraft"] .lx-schedule-stats .recharts-bar-rectangle path',
    )
    const pieBlock = getRuleBlock(
      '[data-theme="minecraft"] .lx-schedule-stats .recharts-pie-sector path',
    )
    expect(pieBlock).toContain("shape-rendering: crispEdges !important")
  })

  it("主题级定义了日程优先级与图表颜色变量", () => {
    expect(minecraftCss).toContain("--color-schedule-priority-p0: #cc5f5f")
    expect(minecraftCss).toContain("--color-schedule-chart-completed: #4fc94f")
  })
})

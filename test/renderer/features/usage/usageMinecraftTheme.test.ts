import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relativePath}`, import.meta.url)), "utf8")

const minecraftCss = readSource("src/renderer/src/styles/themes/minecraft/index.css")

const ruleBlock = (css: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ""
}

const extractChartPalette = (css: string): string[] =>
  [...css.matchAll(/--color-usage-chart-[a-z0-9-]+:\s*(#[0-9a-fA-F]{3,6})/g)].map(
    (match) => match[1],
  )

describe("usage Minecraft 主题适配", () => {
  it("图表色板已压暗，不再使用霓虹色", () => {
    const palette = extractChartPalette(minecraftCss)
    expect(palette.length).toBe(15)

    for (const neon of [
      "#55ffff",
      "#55ff55",
      "#ff5555",
      "#55aaff",
      "#ffea88",
      "#c084fc",
      "#ffaa00",
    ]) {
      expect(palette).not.toContain(neon)
    }
  })

  it("柱形与网格线使用 crispEdges，饼图/环形图加黑描边", () => {
    expect(minecraftCss).toMatch(
      /\.recharts-bar-rectangle path,[\s\S]{0,160}shape-rendering:\s*crispEdges/,
    )

    const pieSelector = '[data-theme="minecraft"] .usage-chart-card .recharts-pie-sector path'
    const pieBlock = ruleBlock(minecraftCss, pieSelector)
    expect(pieBlock).toContain("shape-rendering: crispEdges")
    expect(pieBlock).toContain("stroke: #000000")
    expect(pieBlock).toContain("stroke-width: 2px")
  })

  it("表格对比度收敛：表头/正文降亮、hover 压暗、边框去纯黑、投影去亮边", () => {
    const thBlock = ruleBlock(minecraftCss, '[data-theme="minecraft"] .usage-table th')
    expect(thBlock).toContain("color: #8b8ba0")
    expect(thBlock).toContain("border-bottom: 2px solid #14141c")

    const tdBlock = ruleBlock(minecraftCss, '[data-theme="minecraft"] .usage-table td')
    expect(tdBlock).toContain("color: #bcbcd0")
    expect(tdBlock).toContain("border-bottom: 1px solid #14141c")

    const hoverBlock = ruleBlock(
      minecraftCss,
      '[data-theme="minecraft"] .usage-table tbody tr:hover',
    )
    expect(hoverBlock).toContain("background-color: #2a2a3a")

    const cardBlocks = [
      ...minecraftCss.matchAll(/\[data-theme="minecraft"\] \.usage-table-card\s*\{([^}]*)\}/g),
    ].map((match) => match[1] ?? "")
    const cardShadowBlock = cardBlocks.at(-1) ?? ""
    expect(cardShadowBlock).not.toContain("rgba(255, 255, 255, 0.1)")
  })
})

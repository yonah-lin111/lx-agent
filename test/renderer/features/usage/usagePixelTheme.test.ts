import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relativePath}`, import.meta.url)), "utf8")

const pixelCss = readSource("src/renderer/src/styles/themes/pixel/index.css")

const ruleBlock = (css: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ""
}

const extractChartPalette = (css: string): string[] =>
  [...css.matchAll(/--color-usage-chart-[a-z0-9-]+:\s*(#[0-9a-fA-F]{3,6})/g)].map(
    (match) => match[1],
  )

describe("usage 像素 主题适配", () => {
  it("图表色板已压暗，不再使用霓虹色", () => {
    const palette = extractChartPalette(pixelCss)
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
    expect(pixelCss).toMatch(
      /\.recharts-bar-rectangle path,[\s\S]{0,160}shape-rendering:\s*crispEdges/,
    )

    const pieSelector = '[data-theme="pixel"] .lx-chart-card .recharts-pie-sector path'
    const pieBlock = ruleBlock(pixelCss, pieSelector)
    expect(pieBlock).toContain("shape-rendering: crispEdges")
    expect(pieBlock).toContain("stroke: #000000")
    expect(pieBlock).toContain("stroke-width: 2px")
  })

  it("概览与用量卡片移除马赛克底纹，保留实体底色与像素浮雕", () => {
    const selector =
      '[data-theme="pixel"] .activity-heatmap-card,\n' +
      '[data-theme="pixel"] .usage-stat-card,\n' +
      '[data-theme="pixel"] .lx-chart-card,\n' +
      '[data-theme="pixel"] .usage-table-card {'
    const start = pixelCss.indexOf(selector)
    expect(start).toBeGreaterThanOrEqual(0)

    const block = pixelCss.slice(start, pixelCss.indexOf("}", start))
    expect(block).not.toContain("background-image")
    expect(block).toContain("background-color: #1e1e2a !important")
    expect(block).toContain("border: 2px solid #000000 !important")
    expect(block).toContain("box-shadow:")
  })

  it("表格对比度收敛：表头/正文降亮、hover 压暗、边框去纯黑、投影去亮边", () => {
    const thBlock = ruleBlock(pixelCss, '[data-theme="pixel"] .usage-table th')
    expect(thBlock).toContain("color: #8b8ba0")
    expect(thBlock).toContain("border-bottom: 2px solid #14141c")

    const tdBlock = ruleBlock(pixelCss, '[data-theme="pixel"] .usage-table td')
    expect(tdBlock).toContain("color: #bcbcd0")
    expect(tdBlock).toContain("border-bottom: 1px solid #14141c")

    const hoverBlock = ruleBlock(pixelCss, '[data-theme="pixel"] .usage-table tbody tr:hover')
    expect(hoverBlock).toContain("background-color: #2a2a3a")

    const cardBlocks = [
      ...pixelCss.matchAll(/\[data-theme="pixel"\] \.usage-table-card\s*\{([^}]*)\}/g),
    ].map((match) => match[1] ?? "")
    const cardShadowBlock = cardBlocks.at(-1) ?? ""
    expect(cardShadowBlock).not.toContain("rgba(255, 255, 255, 0.1)")
  })
})

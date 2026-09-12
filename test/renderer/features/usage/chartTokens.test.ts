import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relativePath}`, import.meta.url)), "utf8")

const extractChartTokens = (css: string): string[] =>
  [...new Set(css.match(/--color-usage-chart-[a-z0-9-]+/g) ?? [])].sort()

describe("usage 图表主题变量", () => {
  const defaultCss = readSource("src/renderer/src/styles/themes/default.css")
  const minecraftCss = readSource("src/renderer/src/styles/themes/minecraft/index.css")
  const globalCss = readSource("src/renderer/src/styles.css")

  it("default 与 minecraft 定义同一组图表变量", () => {
    const defaultTokens = extractChartTokens(defaultCss)
    const minecraftTokens = extractChartTokens(minecraftCss)

    // 6 个语义色 + 8 个 Provider 循环色。
    expect(defaultTokens.length).toBe(14)
    expect(minecraftTokens).toEqual(defaultTokens)
  })

  it("仅屏蔽鼠标点击产生的图表焦点框，保留键盘 focus-visible 轮廓", () => {
    expect(globalCss).toMatch(
      /\.recharts-wrapper :focus:not\(:focus-visible\)\s*\{\s*outline:\s*none;/,
    )
  })
})

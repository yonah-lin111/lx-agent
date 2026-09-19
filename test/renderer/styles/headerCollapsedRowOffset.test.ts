import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)), "utf8")

const OFFSET_TOKEN = "--theme-header-collapsed-row-offset-y"

const extractOffset = (css: string): string | null =>
  css.match(new RegExp(`${OFFSET_TOKEN}:\\s*([^;]+);`))?.[1]?.trim() ?? null

// 收起态几何：40px 栏高、24px 行高、4px 纵向内边距；偏移 = (栏高 - 2*边框 - 2*内边距 - 行高) / 2。
const expectedOffset = (borderWidthPx: number): string =>
  `${(40 - borderWidthPx * 2 - 4 * 2 - 24) / 2}px`

describe("顶部栏收起态行偏移主题变量", () => {
  it("default 与 pixel 均定义行偏移，像素主题用 2px 补偿 2px 厚重边框", () => {
    expect(extractOffset(readSource("src/renderer/src/styles/themes/default.css"))).toBe(
      expectedOffset(1),
    )
    expect(extractOffset(readSource("src/renderer/src/styles/themes/pixel/index.css"))).toBe(
      expectedOffset(2),
    )
  })
})

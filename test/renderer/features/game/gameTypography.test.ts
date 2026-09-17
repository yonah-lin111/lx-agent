import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const GAME_DIR = fileURLToPath(
  new URL("../../../../src/renderer/src/features/game", import.meta.url),
)

// 与 styles.css 的 @theme 对齐：游戏页 DOM 文本只有三档字号。
// canvas 内绘制的 HUD 字号属于游戏画面（会随画布等比缩放），不在此约束内。
const ALLOWED_FONT_SIZES = new Set(["text-xs", "text-sm", "text-lg"])
const FONT_SIZE_UTILITY = /\btext-(?:xs|sm|lg|base|xl|[2-9]xl)\b/g
const ARBITRARY_FONT_SIZE = /\btext-\[[^\]]*\d[\d.]*(?:px|rem|em)\]/g

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return listSourceFiles(full)
    return /\.(?:ts|tsx)$/.test(name) ? [full] : []
  })

describe("游戏页面字号", () => {
  it("只使用 text-xs / text-sm / text-lg 三档预设字号", () => {
    const violations: string[] = []

    for (const file of listSourceFiles(GAME_DIR)) {
      const source = readFileSync(file, "utf8")
      const tokens = [
        ...source.matchAll(FONT_SIZE_UTILITY),
        ...source.matchAll(ARBITRARY_FONT_SIZE),
      ]

      for (const { 0: token } of tokens) {
        if (ALLOWED_FONT_SIZES.has(token)) continue
        violations.push(`${relative(GAME_DIR, file)}: ${token}`)
      }
    }

    expect(violations).toEqual([])
  })
})

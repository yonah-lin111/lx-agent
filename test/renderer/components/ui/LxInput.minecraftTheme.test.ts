import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const minecraftCss = readFileSync(
  fileURLToPath(
    new URL("../../../../src/renderer/src/styles/themes/minecraft/index.css", import.meta.url),
  ),
  "utf8",
)

const extractRuleBlock = (css: string, selectorPattern: string): string => {
  const match = css.match(new RegExp(`${selectorPattern}[^{]*\\{([^}]*)\\}`))
  return match?.[1] ?? ""
}

describe("LxInput Minecraft 主题内层输入框", () => {
  it("覆写规则带 :not() 链以反超全局 input 规则，移除内层边框与不透明背景", () => {
    const overrideBlock = extractRuleBlock(
      minecraftCss,
      '\\[data-theme="minecraft"\\] \\.lx-input input:not\\(\\[type="checkbox"\\]\\):not\\(\\[type="radio"\\]\\)',
    )

    expect(overrideBlock).toContain("border: none !important")
    expect(overrideBlock).toContain("background-color: transparent !important")
    expect(overrideBlock).toContain("box-shadow: none !important")
  })

  it("全局裸 input 凹槽规则仍然存在", () => {
    const globalBlock = extractRuleBlock(
      minecraftCss,
      '\\[data-theme="minecraft"\\] input:not\\(\\[type="checkbox"\\]\\):not\\(\\[type="radio"\\]\\)',
    )

    expect(globalBlock).toContain("border: 2px solid #000000 !important")
    expect(globalBlock).toContain("background-color: #14141d !important")
  })
})

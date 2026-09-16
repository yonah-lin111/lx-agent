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

describe("LxModal Minecraft 主题面板", () => {
  it("面板保留实体底色与容器 3D 浮雕，仅移除马赛克底纹", () => {
    const panelBlock = extractRuleBlock(
      minecraftCss,
      '\\[data-theme="minecraft"\\] \\.lx-modal-panel',
    )

    expect(panelBlock).toContain("background-color: #222232 !important")
    expect(panelBlock).toContain("background-image: none !important")
    expect(panelBlock).not.toContain("url(")
    expect(panelBlock).not.toContain("box-shadow")
  })

  it("标题行并入平面，移除独立容器边框/底纹/浮雕", () => {
    const headerBlock = extractRuleBlock(
      minecraftCss,
      '\\[data-theme="minecraft"\\] \\.lx-modal-panel header',
    )

    expect(headerBlock).toContain("border: none !important")
    expect(headerBlock).toContain("background-color: transparent !important")
    expect(headerBlock).toContain("box-shadow: none !important")
  })

  it("遮罩层规则保持透明无纹理", () => {
    const backdropBlock = extractRuleBlock(
      minecraftCss,
      '\\[data-theme="minecraft"\\] \\.lx-modal-backdrop',
    )

    expect(backdropBlock).toContain("background-color: transparent !important")
    expect(backdropBlock).toContain("background-image: none !important")
  })
})

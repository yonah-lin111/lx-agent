import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const minecraftCss = readFileSync(
  fileURLToPath(
    new URL("../../../../src/renderer/src/styles/themes/minecraft/index.css", import.meta.url),
  ),
  "utf8",
)

// 截取指定选择器起的首个规则块内容，用于断言主题规则值。
const extractBlockFrom = (css: string, selector: string): string => {
  const start = css.indexOf(selector)
  if (start < 0) return ""
  return css.slice(start, css.indexOf("}", start))
}

describe("LxMenuItem Minecraft 主题", () => {
  it("item 保持不透明纯色 3D 块并显式禁用马赛克纹理", () => {
    const block = extractBlockFrom(minecraftCss, '[data-theme="minecraft"] .lx-menu-item,')

    expect(block).toContain("background-color: #1e1e2a !important")
    expect(block).toContain("background-image: none !important")
    expect(block).toContain("border: 2px solid #000000 !important")
  })

  it("选中态按 data-active 分派绿色指示条，不再嗅探 Tailwind 类名", () => {
    const block = extractBlockFrom(
      minecraftCss,
      '[data-theme="minecraft"] .lx-menu-item[data-active="true"]',
    )

    expect(block).toContain("background-color: #14141c !important")
    expect(block).toContain("border-left: 4px solid #55ff55 !important")
    expect(minecraftCss).not.toContain(
      '[data-theme="minecraft"] [role="menu"] [role="menuitem"].bg-white\\/8',
    )
    expect(minecraftCss).not.toContain(
      '[data-theme="minecraft"] [role="menu"] [role="menuitem"].bg-white\\/5',
    )
  })

  it("悬停态排除选中项，避免覆盖绿色指示条", () => {
    expect(minecraftCss).toContain(
      '[data-theme="minecraft"] .lx-menu-item:hover:not([data-active="true"])',
    )
  })

  it("主题菜单特例样式已随统一 item 移除", () => {
    expect(minecraftCss).not.toContain(".theme-menu-option")
  })
})

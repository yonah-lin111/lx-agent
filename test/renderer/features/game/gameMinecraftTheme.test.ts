import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const minecraftCss = readFileSync(
  fileURLToPath(
    new URL("../../../../src/renderer/src/styles/themes/minecraft/index.css", import.meta.url),
  ),
  "utf8",
)

// 读取选择器对应的规则块（截至第一个右花括号）。
const getRuleBlock = (selector: string): string => {
  const start = minecraftCss.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)
  return minecraftCss.slice(start, minecraftCss.indexOf("}", start))
}

describe("我的世界主题游戏视图", () => {
  it("区块头退化为纯布局行，不再叠加马赛克容器", () => {
    const block = getRuleBlock('[data-theme="minecraft"] .game-dashboard > section')

    expect(block).toContain("border: none !important")
    expect(block).toContain("box-shadow: none !important")
    expect(block).toContain("background-image: none !important")
  })

  it("标题与图标对齐索引页的像素描边语言", () => {
    expect(getRuleBlock('[data-theme="minecraft"] .game-section-title')).toContain(
      "text-shadow: 1px 1px 0px #000000",
    )
    expect(getRuleBlock('[data-theme="minecraft"] .game-section-icon')).toContain(
      "drop-shadow(1px 1px 0px #000000)",
    )
    expect(getRuleBlock('[data-theme="minecraft"] .game-section-icon--game')).toContain(
      "color: #ffaa00 !important",
    )
  })

  it("卡片与工具栏图标使用经验条绿与像素投影", () => {
    const block = getRuleBlock('[data-theme="minecraft"] .game-card-icon,')

    expect(block).toContain("color: #55ff55 !important")
    expect(block).toContain("drop-shadow(1px 1px 0px #000000)")
  })

  it("游戏卡片使用与彩蛋游戏卡片一致的像素浮雕", () => {
    const block = getRuleBlock('[data-theme="minecraft"] .game-card {')

    expect(block).toContain("border: 2px solid #000000 !important")
    expect(block).toContain("background-color: #1e1e2a !important")
    expect(block).toContain("inset -1px -1px 0px 0px rgba(0, 0, 0, 0.6)")
    expect(block).toContain("2px 2px 0px 0px #000000")

    const hoverBlock = getRuleBlock('[data-theme="minecraft"] .game-card:hover')
    expect(hoverBlock).toContain("background-color: #242434 !important")
  })

  it("空态占位与模拟器视口保留像素凹槽", () => {
    const emptyBlock = getRuleBlock('[data-theme="minecraft"] .game-empty-state')
    expect(emptyBlock).toContain("border: 2px dashed #484860 !important")
    expect(emptyBlock).toContain("background-image: none !important")

    const viewportBlock = getRuleBlock('[data-theme="minecraft"] .game-stage-viewport')
    expect(viewportBlock).toContain("border: 2px solid #000000 !important")
    expect(viewportBlock).toContain("background-color: #000000 !important")
  })
})

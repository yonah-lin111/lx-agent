import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const readSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8")

const pixelAgentCss = readSource("../../../../src/renderer/src/styles/themes/pixel/agent.css")
const cardSource = readSource(
  "../../../../src/renderer/src/features/agent/components/blocks/GrillQuestionCard.tsx",
)
const flowItemSource = readSource(
  "../../../../src/renderer/src/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem.tsx",
)

const cssBlockOf = (selector: string): string => {
  const start = pixelAgentCss.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)
  return pixelAgentCss.slice(start, pixelAgentCss.indexOf("}", start))
}

describe("像素主题：grill-me 逐题盘问卡片", () => {
  it("卡片使用黑曜石浮雕槽：2px 黑边、直角、冷青底色与多层阴影", () => {
    const block = cssBlockOf('[data-theme="pixel"] .grill-question-card {')
    expect(block).toContain("border: 2px solid #000000 !important")
    expect(block).toContain("background-color: #101b21 !important")
    expect(block).toContain("border-radius: 0px !important")
    expect(block).toContain("box-shadow:")
  })

  it("头部/图标/徽标/标签沿用像素字体与 cyan 强调色", () => {
    expect(cssBlockOf('[data-theme="pixel"] .grill-question-header {')).toContain(
      "border-bottom: 2px solid #000000 !important",
    )
    expect(cssBlockOf('[data-theme="pixel"] .grill-question-icon-wrapper svg {')).toContain(
      "color: #55ffff !important",
    )

    const badge = cssBlockOf('[data-theme="pixel"] .grill-question-badge {')
    expect(badge).toContain("font-family: var(--theme-font-family) !important")
    expect(badge).toContain("border-radius: 0px !important")

    const label = cssBlockOf('[data-theme="pixel"] .grill-question-label {')
    expect(label).toContain("color: #55ffff !important")
    expect(label).toContain("text-shadow: 1px 1px 0px #000000")
  })

  it("推荐与举例子槽保留独立边框层级，举例标签降饱和", () => {
    const recommendation = cssBlockOf('[data-theme="pixel"] .grill-question-recommendation {')
    expect(recommendation).toContain("border: 2px solid #000000 !important")
    expect(recommendation).toContain("border-radius: 0px !important")

    const example = cssBlockOf('[data-theme="pixel"] .grill-question-example {')
    expect(example).toContain("border: 1px solid #000000 !important")
    expect(example).toContain("border-radius: 0px !important")

    expect(
      cssBlockOf('[data-theme="pixel"] .grill-question-example .grill-question-label {'),
    ).toContain("color: #9ad9e2 !important")
  })

  it("像素主题选择器与组件类名一一对齐，避免样式漂移", () => {
    for (const className of [
      "grill-question-card",
      "grill-question-header",
      "grill-question-icon-wrapper",
      "grill-question-badge",
      "grill-question-copy-btn",
      "grill-question-label",
      "grill-question-recommendation",
      "grill-question-example",
      "grill-question-waiting",
    ]) {
      expect(pixelAgentCss).toContain(`.${className}`)
      expect(cardSource).toContain(className)
    }

    expect(pixelAgentCss).toContain(".agent-execution-flow-grill-question-content")
    expect(flowItemSource).toContain("agent-execution-flow-grill-question-content")
  })
})

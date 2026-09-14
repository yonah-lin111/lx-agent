// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AgentExecutionFlowHeader } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowHeader"
import type { FilterKind } from "@/features/agent/components/AgentExecutionFlowList/types"

const FILTER_COUNTS: Record<FilterKind, number> = {
  all: 3,
  calls: 0,
  system: 0,
  tool: 2,
  thinking: 1,
  subagent: 0,
  user: 0,
  assistant: 0,
  compaction: 0,
  undo: 0,
  modelSwitch: 0,
  proposedPlan: 0,
  reviewFindings: 0,
  frontDesign: 0,
  hook: 0,
  error: 0,
}

const STATS = {
  turnsCount: 1,
  totalSteps: 3,
  toolCallsCount: 2,
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  totalTokens: 15,
}

const buttonClasses = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll("button")).map((el) => el.className)

describe("AgentExecutionFlowHeader 筛选 Tab", () => {
  afterEach(cleanup)

  it("未激活 Tab 悬停使用各分类色背景，all 保持中性", () => {
    const { container } = render(
      <AgentExecutionFlowHeader
        stepsCount={3}
        activeFilter="tool"
        filterCounts={FILTER_COUNTS}
        stats={STATS}
        onFilterChange={() => {}}
      />,
    )

    const classes = buttonClasses(container)
    expect(
      classes.some(
        (c) => c.includes("hover:bg-purple-500/10") && c.includes("hover:text-purple-300"),
      ),
    ).toBe(true)
    expect(classes.some((c) => c.includes("hover:bg-white/5"))).toBe(true)
    expect(classes.some((c) => c.includes("hover:bg-amber-500/10"))).toBe(false)
  })

  it("激活 Tab 使用分类高亮色且不再挂 hover 背景", () => {
    const { container } = render(
      <AgentExecutionFlowHeader
        stepsCount={3}
        activeFilter="tool"
        filterCounts={FILTER_COUNTS}
        stats={STATS}
        onFilterChange={() => {}}
      />,
    )

    const activeClasses = buttonClasses(container).find((c) => c.includes("bg-amber-500/20"))
    expect(activeClasses).toBeDefined()
    expect(activeClasses).toContain("text-amber-300")
    expect(activeClasses).not.toContain("hover:bg-amber-500/10")
  })

  it("筛选 Tab 芯片统一 default 档尺寸：h-7 + text-sm", () => {
    const { container } = render(
      <AgentExecutionFlowHeader
        stepsCount={3}
        activeFilter="all"
        filterCounts={FILTER_COUNTS}
        stats={STATS}
        onFilterChange={() => {}}
      />,
    )

    const tabClasses = buttonClasses(container).filter((className) =>
      className.includes("font-mono"),
    )
    expect(tabClasses.length).toBeGreaterThan(0)
    for (const className of tabClasses) {
      expect(className).toContain("h-7")
      expect(className).toContain("text-sm")
    }
  })

  it("左右滚动按钮使用 ArrowLeft/ArrowRight 图标", () => {
    const { container } = render(
      <AgentExecutionFlowHeader
        stepsCount={3}
        activeFilter="all"
        filterCounts={FILTER_COUNTS}
        stats={STATS}
        onFilterChange={() => {}}
      />,
    )

    expect(container.querySelector(".lucide-arrow-left")).not.toBeNull()
    expect(container.querySelector(".lucide-arrow-right")).not.toBeNull()
  })
})

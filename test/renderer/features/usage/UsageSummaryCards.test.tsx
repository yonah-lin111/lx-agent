// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { UsageSummaryCards } from "@/features/usage/components/UsageSummaryCards"
import type { UsageSummary } from "@/features/usage/types"

const summary: UsageSummary = {
  requestCount: 3,
  successCount: 2,
  errorCount: 1,
  abortedCount: 0,
  inputTokens: 1000,
  outputTokens: 200,
  cacheReadTokens: 100,
  cacheWriteTokens: 50,
  totalTokens: 1200,
  pricedRequestCount: 2,
  totalCostUsd: 0.0123,
  successRate: 66.7,
  avgDurationMs: 900,
}

// 取标题所在汇总卡（图表图例同名文本不带 usage-stat-card 容器）。
const findStatCard = (titleRe: RegExp): Element | null => {
  for (const node of screen.queryAllByText(titleRe)) {
    const card = node.closest(".usage-stat-card")
    if (card) return card
  }
  return null
}

const getCacheHitCard = (): HTMLElement | null =>
  screen.getByText(/Cache Hit Rate|缓存命中率/).closest(".usage-stat-card")

describe("UsageSummaryCards", () => {
  afterEach(cleanup)

  it("按统一统计口径渲染六张卡：真实消耗为 totalTokens，新增输入扣除缓存且不再展示总输入明细", () => {
    render(<UsageSummaryCards summary={summary} />)

    // 真实消耗 = totalTokens（1200 -> 1.2k）。
    const realTotalCard = findStatCard(/真实消耗 Tokens|Tokens Processed/)
    expect(realTotalCard?.textContent).toContain("1.2k")

    // 新增输入 = 1000 - 100 - 50 = 850，仅保留主值，不再展示含缓存的总输入明细。
    const freshInputCard = findStatCard(/Fresh Input|新增输入/)
    expect(freshInputCard?.textContent).toContain("850")
    expect(freshInputCard?.textContent).not.toContain("1.0k")

    expect(findStatCard(/^Output Tokens$|^输出 Tokens$/)).toBeDefined()
    expect(findStatCard(/^Cache Write$|^缓存写入$/)).toBeDefined()
    expect(findStatCard(/^Cache Read$|^缓存读取$/)).toBeDefined()
    expect(findStatCard(/Cache Hit Rate|缓存命中率/)).toBeDefined()
  })

  it("缓存命中率卡片展示百分比与对应进度条宽度", () => {
    render(<UsageSummaryCards summary={summary} />)

    const card = getCacheHitCard()
    expect(card?.textContent).toContain("10.0%")

    const fill = card?.querySelector(".usage-cache-hit-meter-fill")
    expect(fill?.getAttribute("style")).toContain("width: 10%")
  })

  it("不再渲染成本卡片", () => {
    render(<UsageSummaryCards summary={summary} />)

    expect(findStatCard(/^Total Cost$|^总成本$/)).toBeNull()
  })

  it("无输入 tokens 时命中率显示 -- 且进度条为空", () => {
    render(<UsageSummaryCards summary={{ ...summary, inputTokens: 0, cacheReadTokens: 0 }} />)

    const card = getCacheHitCard()
    expect(card?.textContent).toContain("--")

    const fill = card?.querySelector(".usage-cache-hit-meter-fill")
    expect(fill?.getAttribute("style")).toContain("width: 0%")
  })

  it("summary 为空时全部卡片回退零值", () => {
    render(<UsageSummaryCards summary={null} />)

    const realTotalCard = findStatCard(/真实消耗 Tokens|Tokens Processed/)
    expect(realTotalCard?.textContent).toContain("0")

    const freshInputCard = findStatCard(/Fresh Input|新增输入/)
    expect(freshInputCard?.textContent).toContain("0")
    expect(getCacheHitCard()?.textContent).toContain("--")
  })
})

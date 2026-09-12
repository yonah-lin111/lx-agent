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

const getCacheHitCard = (): HTMLElement | null =>
  screen.getByText(/Cache Hit Rate|缓存命中率/).closest(".usage-stat-card")

describe("UsageSummaryCards", () => {
  afterEach(cleanup)

  it("缓存命中率卡片展示百分比与对应进度条宽度", () => {
    render(<UsageSummaryCards summary={summary} />)

    const card = getCacheHitCard()
    expect(card?.textContent).toContain("10.0%")

    const fill = card?.querySelector(".usage-cache-hit-meter-fill")
    expect(fill?.getAttribute("style")).toContain("width: 10%")
  })

  it("无输入 tokens 时命中率显示 -- 且进度条为空", () => {
    render(<UsageSummaryCards summary={{ ...summary, inputTokens: 0, cacheReadTokens: 0 }} />)

    const card = getCacheHitCard()
    expect(card?.textContent).toContain("--")

    const fill = card?.querySelector(".usage-cache-hit-meter-fill")
    expect(fill?.getAttribute("style")).toContain("width: 0%")
  })
})

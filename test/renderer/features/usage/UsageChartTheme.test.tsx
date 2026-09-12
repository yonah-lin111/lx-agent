// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import type { ReactElement } from "react"
import { type AnimationController, AnimationControllerProvider } from "recharts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { UsageModelDistributionChart } from "@/features/usage/components/UsageModelDistributionChart"
import { UsageProviderDistributionChart } from "@/features/usage/components/UsageProviderDistributionChart"
import { UsageRequestsChart } from "@/features/usage/components/UsageRequestsChart"
import { UsageTokenCompositionChart } from "@/features/usage/components/UsageTokenCompositionChart"
import { UsageTrendChart } from "@/features/usage/components/UsageTrendChart"
import type {
  UsageDailyPoint,
  UsageModelStats,
  UsageProviderStats,
  UsageSummary,
} from "@/features/usage/types"
import { applyThemeToDom } from "@/stores/themeStore"

// 让 ResponsiveContainer 立刻拿到尺寸，recharts 才会真正渲染 SVG。
class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe = (target: Element): void => {
    this.callback(
      [{ target, contentRect: { width: 640, height: 320 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }

  unobserve = (): void => undefined

  disconnect = (): void => undefined
}

// 入场动画立即完成：避免断言落在 rAF 尚未推进的空 SVG 中间态。
const instantAnimationController: AnimationController = (_timeoutController, handle, listener) => {
  handle.tick(0)
  handle.tick(1_000_000)
  handle.tick(2_000_000)
  listener(handle.getInterpolated())
  handle.complete()
  return () => undefined
}

const renderChart = (ui: ReactElement): ReturnType<typeof render> =>
  render(
    <AnimationControllerProvider value={instantAnimationController}>
      {ui}
    </AnimationControllerProvider>,
  )

const providerStats: UsageProviderStats[] = [
  {
    provider: "anthropic",
    requestCount: 3,
    totalTokens: 1200,
    totalCostUsd: 0.0123,
    successRate: 66.7,
    avgDurationMs: 900,
  },
  {
    provider: "openai",
    requestCount: 1,
    totalTokens: 400,
    totalCostUsd: 0.0021,
    successRate: 100,
    avgDurationMs: 500,
  },
]

const modelStats: UsageModelStats[] = [
  {
    model: "claude-sonnet-4",
    requestCount: 3,
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 100,
    cacheWriteTokens: 50,
    totalTokens: 1200,
    totalCostUsd: 0.0123,
    avgCostPerRequestUsd: 0.0041,
  },
]

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

const daily: UsageDailyPoint[] = [
  {
    date: "2026-09-11",
    requestCount: 3,
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 100,
    cacheWriteTokens: 50,
    totalCostUsd: 0.0123,
  },
]

const fillValues = (container: HTMLElement, selector: string): (string | null)[] =>
  [...container.querySelectorAll(selector)].map((element) => element.getAttribute("fill"))

const strokeValues = (container: HTMLElement, selector: string): (string | null)[] =>
  [...container.querySelectorAll(selector)].map((element) => element.getAttribute("stroke"))

describe("usage 图表内部主题变量", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    document.documentElement.removeAttribute("data-theme")
  })

  it("Provider 环形图使用主题 Provider 色板", () => {
    const { container } = renderChart(
      <UsageProviderDistributionChart providerStats={providerStats} />,
    )

    expect(fillValues(container, ".recharts-sector")).toEqual([
      "var(--color-usage-chart-provider-1)",
      "var(--color-usage-chart-provider-2)",
    ])
  })

  it("Token 构成图复用语义色变量", () => {
    const { container } = renderChart(<UsageTokenCompositionChart summary={summary} />)

    expect(fillValues(container, ".recharts-sector")).toEqual([
      "var(--color-usage-chart-fresh-input)",
      "var(--color-usage-chart-output)",
      "var(--color-usage-chart-cache-read)",
      "var(--color-usage-chart-cache-write)",
    ])
  })

  it("每日请求柱状图使用 requests 变量", () => {
    const { container } = renderChart(<UsageRequestsChart daily={daily} granularity="day" />)

    expect(fillValues(container, ".recharts-bar-rectangle path")).toEqual([
      "var(--color-usage-chart-requests)",
    ])
  })

  it("Minecraft 主题柱形改直角，默认主题保留圆角", () => {
    applyThemeToDom("default")
    const rounded = renderChart(<UsageRequestsChart daily={daily} granularity="day" />)
    const roundedPath = rounded.container.querySelector(".recharts-bar-rectangle path")
    expect(roundedPath?.getAttribute("d")).toContain("A")
    rounded.unmount()

    applyThemeToDom("minecraft")
    const sharp = renderChart(<UsageRequestsChart daily={daily} granularity="day" />)
    const sharpPath = sharp.container.querySelector(".recharts-bar-rectangle path")
    expect(sharpPath?.getAttribute("d")).not.toContain("A")
  })

  it("模型分布图有计价时使用 cost 变量，无计价回落 tokens 变量", () => {
    const priced = renderChart(<UsageModelDistributionChart modelStats={modelStats} />)
    expect(fillValues(priced.container, ".recharts-bar-rectangle path")).toEqual([
      "var(--color-usage-chart-cost)",
    ])
    priced.unmount()

    const unpriced = renderChart(
      <UsageModelDistributionChart
        modelStats={[{ ...modelStats[0], totalCostUsd: null, avgCostPerRequestUsd: null }]}
      />,
    )
    expect(fillValues(unpriced.container, ".recharts-bar-rectangle path")).toEqual([
      "var(--color-usage-chart-fresh-input)",
    ])
  })

  it("趋势图面积/折线描边与渐变均引用主题变量", () => {
    const { container } = renderChart(<UsageTrendChart daily={daily} granularity="day" />)

    expect(strokeValues(container, ".recharts-area-curve")).toEqual([
      "var(--color-usage-chart-fresh-input)",
      "var(--color-usage-chart-cache-read)",
      "var(--color-usage-chart-cache-write)",
      "var(--color-usage-chart-output)",
    ])
    expect(strokeValues(container, ".recharts-line-curve")).toEqual([
      "var(--color-usage-chart-cost)",
    ])

    const stopColors = [...container.querySelectorAll("stop")].map((element) =>
      element.getAttribute("stop-color"),
    )
    expect(stopColors.length).toBeGreaterThan(0)
    expect(stopColors.every((color) => color?.startsWith("var(--color-usage-chart-"))).toBe(true)
  })
})

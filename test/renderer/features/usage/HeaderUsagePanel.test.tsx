// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HeaderUsagePanel } from "@/features/usage/components/HeaderUsagePanel"
import type { UsageSummary } from "@/features/usage/types"

const summary: UsageSummary = {
  requestCount: 1234,
  successCount: 1200,
  errorCount: 34,
  abortedCount: 0,
  inputTokens: 2_000_000,
  outputTokens: 500_000,
  cacheReadTokens: 1_500_000,
  cacheWriteTokens: 100_000,
  totalTokens: 2_500_000,
  pricedRequestCount: 1234,
  totalCostUsd: 1.2345,
  successRate: 97.2,
  avgDurationMs: 900,
}

describe("HeaderUsagePanel", () => {
  let getSummary: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getSummary = vi.fn().mockResolvedValue(summary)
    // @ts-expect-error Mock window.api
    window.api = { usage: { getSummary } }
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("展开时渲染标题与六项今日指标", async () => {
    const { container } = render(<HeaderUsagePanel isExpanded />)

    expect(screen.getByText("Today's Usage")).toBeDefined()
    expect(await screen.findByText("1.2k")).toBeDefined()
    expect(getSummary).toHaveBeenCalledTimes(1)

    // 六张卡片铺满容器宽度并挂像素主题浮雕样式钩子。
    expect(container.querySelectorAll(".header-usage-stat")).toHaveLength(6)

    expect(screen.getByText("Requests")).toBeDefined()
    expect(screen.getByText("Tokens Processed")).toBeDefined()
    expect(screen.getByText("2.5M")).toBeDefined()
    expect(screen.getByText("Fresh Input")).toBeDefined()
    expect(screen.getByText("400.0k")).toBeDefined()
    expect(screen.getByText("Output Tokens")).toBeDefined()
    expect(screen.getByText("500.0k")).toBeDefined()
    expect(screen.getByText("Cache Hit Rate")).toBeDefined()
    expect(screen.getByText("75.0%")).toBeDefined()
    expect(screen.getByText("Total Cost")).toBeDefined()
    expect(screen.getByText("$1.2345")).toBeDefined()
  })

  it("收起时不请求且仅渲染占位值", async () => {
    render(<HeaderUsagePanel isExpanded={false} />)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getSummary).not.toHaveBeenCalled()
    expect(screen.queryByText("Total Cost")).toBeDefined()
    // 六项指标全部为占位符，不展示未加载数据。
    expect(screen.getAllByText("--")).toHaveLength(6)
  })

  it("未配置计价时成本显示 --", async () => {
    getSummary.mockResolvedValue({ ...summary, totalCostUsd: null })
    render(<HeaderUsagePanel isExpanded />)

    expect(await screen.findByText("--")).toBeDefined()
    expect(screen.getByText("Total Cost")).toBeDefined()
  })

  it("加载失败时显示错误文案", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    getSummary.mockRejectedValue(new Error("network down"))
    render(<HeaderUsagePanel isExpanded />)

    expect(await screen.findByText("Failed to load usage")).toBeDefined()
    expect(screen.queryByText("Requests")).toBeNull()
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HeaderUsagePanel } from "@/features/usage/components/HeaderUsagePanel"
import type { UsageDailyPoint, UsageSummary } from "@/features/usage/types"
import { toLocalHourKey } from "@/features/usage/utils"

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

const currentHourPoint: UsageDailyPoint = {
  date: toLocalHourKey(Date.now()),
  requestCount: 1,
  inputTokens: 1000,
  outputTokens: 200,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalCostUsd: null,
}

describe("HeaderUsagePanel", () => {
  let getSummary: ReturnType<typeof vi.fn>
  let getDaily: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getSummary = vi.fn().mockResolvedValue(summary)
    getDaily = vi.fn().mockResolvedValue([currentHourPoint])
    // @ts-expect-error Mock window.api
    window.api = { usage: { getSummary, getDaily } }
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("展开时渲染主指标、小时分布柱、从属指标条与命中率进度", async () => {
    const { container } = render(<HeaderUsagePanel isExpanded />)

    expect(screen.getByText("Today's Usage")).toBeDefined()
    expect(await screen.findByText("2.5M")).toBeDefined()
    expect(getSummary).toHaveBeenCalledTimes(1)
    expect(getDaily).toHaveBeenCalledTimes(1)

    // 主指标：真实消耗大数字与总成本次级数字。
    expect(screen.getByText("Tokens Processed")).toBeDefined()
    expect(screen.getByText("Total Cost")).toBeDefined()
    expect(screen.getByText("$1.2345")).toBeDefined()

    // 今日逐小时柱：从零点补齐到当前整点。
    expect(container.querySelectorAll(".header-usage-bar")).toHaveLength(new Date().getHours() + 1)

    // 从属指标条：请求数 / 新增输入 / 输出。
    expect(screen.getByText("Requests")).toBeDefined()
    expect(screen.getByText("1.2k")).toBeDefined()
    expect(screen.getByText("Fresh Input")).toBeDefined()
    expect(screen.getByText("400.0k")).toBeDefined()
    expect(screen.getByText("Output Tokens")).toBeDefined()
    expect(screen.getByText("500.0k")).toBeDefined()

    // 缓存命中率：百分比与进度条宽度。
    expect(screen.getByText("Cache Hit Rate")).toBeDefined()
    expect(screen.getByText("75.0%")).toBeDefined()
    const fill = container.querySelector(".header-usage-meter-fill")
    expect(fill?.getAttribute("style")).toContain("width: 75%")
  })

  it("收起时不请求且仅渲染占位值", async () => {
    render(<HeaderUsagePanel isExpanded={false} />)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getSummary).not.toHaveBeenCalled()
    expect(getDaily).not.toHaveBeenCalled()
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
    expect(screen.queryByText("Tokens Processed")).toBeNull()
  })
})

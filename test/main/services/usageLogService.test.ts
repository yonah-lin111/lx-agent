import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runMigrations } from "@/db"
import { createUsageLogService } from "@/services/usageLogService"

let database: Database.Database

// 本地日期键（与 SQLite localtime 聚合口径一致）。
const toLocalDay = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

beforeEach(() => {
  database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  runMigrations(database)
})

afterEach(() => {
  database.close()
})

describe("usageLogService", () => {
  it("写入日志并按传入价格快照成本（改价不影响历史行）", () => {
    const service = createUsageLogService(() => database)

    const first = service.record(
      {
        sessionId: "s1",
        projectId: "p1",
        purpose: "chat",
        provider: "anthropic",
        model: "claude-sonnet",
        tokens: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100 },
        durationMs: 1234,
        status: "success",
        createdAt: new Date("2026-09-11T08:00:00Z").getTime(),
      },
      { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    )

    const second = service.record(
      {
        purpose: "title",
        provider: "anthropic",
        model: "claude-sonnet",
        tokens: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0 },
        status: "success",
      },
      { input: 1000, output: 1000, cacheRead: 0, cacheWrite: 0 },
    )

    expect(first.rates.totalCostUsd).toBeCloseTo(
      700 * 3e-6 + 500 * 15e-6 + 200 * 0.3e-6 + 100 * 3.75e-6,
      10,
    )
    expect(second.rates.totalCostUsd).toBeCloseTo(100 * 1000e-6 + 20 * 1000e-6, 10)

    const page = service.listLogs({})
    expect(page.total).toBe(2)
    // 快照成本独立：第一行不因第二次价格参数变化而改变。
    expect(page.rows.some((row) => row.rates.totalCostUsd === first.rates.totalCostUsd)).toBe(true)
  })

  it("未配置价格时成本列为 null，token 仍照常统计", () => {
    const service = createUsageLogService(() => database)
    const record = service.record({
      purpose: "chat",
      provider: "custom",
      model: "local-model",
      tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
      status: "success",
    })

    expect(record.rates.totalCostUsd).toBeNull()
    const summary = service.getSummary({})
    expect(summary.requestCount).toBe(1)
    expect(summary.totalTokens).toBe(15)
    expect(summary.pricedRequestCount).toBe(0)
    expect(summary.totalCostUsd).toBeNull()
  })

  it("空表汇总返回零值与 null 成本", () => {
    const service = createUsageLogService(() => database)
    const summary = service.getSummary({})

    expect(summary).toMatchObject({
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      abortedCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      pricedRequestCount: 0,
      totalCostUsd: null,
      successRate: 0,
      avgDurationMs: null,
    })
  })

  it("按时间、Provider、模型与项目筛选并分页", () => {
    const service = createUsageLogService(() => database)
    const pricing = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }
    const early = new Date("2026-09-01T08:00:00Z").getTime()
    const late = new Date("2026-09-11T08:00:00Z").getTime()

    service.record(
      {
        projectId: "p1",
        purpose: "chat",
        provider: "anthropic",
        model: "m1",
        tokens: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 },
        status: "success",
        createdAt: early,
      },
      pricing,
    )
    service.record(
      {
        projectId: "p2",
        purpose: "subagent",
        provider: "openai",
        model: "m2",
        tokens: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 },
        status: "error",
        createdAt: late,
      },
      pricing,
    )
    service.record(
      {
        projectId: "p2",
        purpose: "chat",
        provider: "openai",
        model: "m1",
        tokens: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 },
        status: "success",
        createdAt: late,
      },
      pricing,
    )

    expect(service.listLogs({ provider: "openai" }).total).toBe(2)
    expect(service.listLogs({ model: "m1" }).total).toBe(2)
    expect(service.listLogs({ projectId: "p2" }).total).toBe(2)
    expect(service.listLogs({ startTime: late - 1000 }).total).toBe(2)

    const firstPage = service.listLogs({}, 1, 2)
    expect(firstPage.rows).toHaveLength(2)
    expect(firstPage.page).toBe(1)
    expect(firstPage.pageSize).toBe(2)
    const secondPage = service.listLogs({}, 2, 2)
    expect(secondPage.rows).toHaveLength(1)
    // 倒序：最新的 two rows 在首页。
    expect(secondPage.rows[0].createdAt).toBe(early)
  })

  it("按本地日期聚合每日数据", () => {
    const service = createUsageLogService(() => database)
    const day = new Date(2026, 8, 11, 12, 0, 0)
    const nextDay = new Date(2026, 8, 12, 3, 0, 0)

    for (const [createdAt, input] of [
      [day.getTime(), 10],
      [day.getTime() + 1000, 20],
      [nextDay.getTime(), 5],
    ] as const) {
      service.record({
        purpose: "chat",
        provider: "p",
        model: "m",
        tokens: { input, output: 1, cacheRead: 0, cacheWrite: 0 },
        status: "success",
        createdAt,
      })
    }

    const daily = service.getDaily({})
    expect(daily).toHaveLength(2)
    expect(daily[0].date).toBe(toLocalDay(day))
    expect(daily[0].requestCount).toBe(2)
    expect(daily[0].inputTokens).toBe(30)
    expect(daily[1].date).toBe(toLocalDay(nextDay))
    expect(daily[1].inputTokens).toBe(5)
  })

  it("按模型与 Provider 聚合成功率、平均耗时与平均成本", () => {
    const service = createUsageLogService(() => database)
    const pricing = { input: 100, output: 0, cacheRead: 0, cacheWrite: 0 }

    service.record({
      purpose: "chat",
      provider: "anthropic",
      model: "m1",
      tokens: { input: 100, output: 0, cacheRead: 0, cacheWrite: 0 },
      durationMs: 100,
      status: "success",
    })
    service.record(
      {
        purpose: "chat",
        provider: "anthropic",
        model: "m1",
        tokens: { input: 300, output: 0, cacheRead: 0, cacheWrite: 0 },
        durationMs: 300,
        status: "success",
      },
      pricing,
    )
    service.record({
      purpose: "chat",
      provider: "anthropic",
      model: "m2",
      tokens: { input: 50, output: 0, cacheRead: 0, cacheWrite: 0 },
      durationMs: 500,
      status: "error",
    })

    const modelStats = service.getModelStats({})
    const m1 = modelStats.find((stat) => stat.model === "m1")
    expect(m1?.requestCount).toBe(2)
    expect(m1?.totalTokens).toBe(400)
    // 平均成本只按已计价请求摊薄（首条未配置价格不计入）。
    expect(m1?.totalCostUsd).toBeCloseTo(300 * 100e-6, 10)
    expect(m1?.avgCostPerRequestUsd).toBeCloseTo(300 * 100e-6, 10)
    const m2 = modelStats.find((stat) => stat.model === "m2")
    expect(m2?.totalCostUsd).toBeNull()
    expect(m2?.avgCostPerRequestUsd).toBeNull()

    const providerStats = service.getProviderStats({})
    expect(providerStats).toHaveLength(1)
    expect(providerStats[0].requestCount).toBe(3)
    expect(providerStats[0].successRate).toBeCloseTo((2 / 3) * 100, 6)
    expect(providerStats[0].avgDurationMs).toBeCloseTo(300, 6)
    expect(providerStats[0].totalCostUsd).toBeCloseTo(300 * 100e-6, 10)
  })

  it("筛选选项只返回当前范围内有数据的维度并关联项目名", () => {
    const service = createUsageLogService(() => database)
    database
      .prepare(
        "INSERT INTO project (external_id, name, type, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("p1", "Alpha", "virtual", null, new Date().toISOString(), new Date().toISOString())

    service.record({
      projectId: "p1",
      purpose: "chat",
      provider: "anthropic",
      model: "m1",
      tokens: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 },
      status: "success",
    })
    service.record({
      projectId: "p2",
      purpose: "chat",
      provider: "openai",
      model: "m2",
      tokens: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 },
      status: "success",
    })

    const all = service.getFilterOptions({})
    expect(all.providers.sort()).toEqual(["anthropic", "openai"])
    expect(all.models.sort()).toEqual(["m1", "m2"])
    // p2 无项目行，名称回落为 id。
    expect(all.projects).toEqual([
      { id: "p1", name: "Alpha" },
      { id: "p2", name: "p2" },
    ])

    // provider 维度自排除：筛选 openai 时仍返回完整 provider 列表，但模型只返回 openai 的。
    const filtered = service.getFilterOptions({ provider: "openai" })
    expect(filtered.providers.sort()).toEqual(["anthropic", "openai"])
    expect(filtered.models).toEqual(["m2"])
  })
})

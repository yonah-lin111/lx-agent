import { randomUUID } from "node:crypto"
import type {
  ModelPricing,
  UsageDailyPoint,
  UsageFilterOptions,
  UsageLogInput,
  UsageLogPage,
  UsageLogRecord,
  UsageLogStatus,
  UsageModelStats,
  UsageProviderStats,
  UsagePurpose,
  UsageQuery,
  UsageSummary,
} from "@shared/contracts/usage"
import { computeUsageRates } from "@shared/contracts/usage"
import type Database from "better-sqlite3"
import { getDatabase } from "@/db"

// usage_log 查询行结构。
interface UsageLogRow {
  id: number
  external_id: string
  session_id: string | null
  project_id: string | null
  purpose: string
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  input_cost_usd: number | null
  output_cost_usd: number | null
  cache_read_cost_usd: number | null
  cache_write_cost_usd: number | null
  total_cost_usd: number | null
  duration_ms: number | null
  status: string
  error_message: string | null
  created_at: string
}

// SQL 条件片段与参数。
interface WhereFragment {
  clause: string
  params: unknown[]
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

/**
 * 构造 usage_log 的 WHERE 条件；alias 用于需要联表的查询。
 */
const buildWhere = (query: UsageQuery, alias = ""): WhereFragment => {
  const prefix = alias ? `${alias}.` : ""
  const conditions: string[] = []
  const params: unknown[] = []

  if (query.startTime !== undefined) {
    conditions.push(`${prefix}created_at >= ?`)
    params.push(new Date(query.startTime).toISOString())
  }
  if (query.endTime !== undefined) {
    conditions.push(`${prefix}created_at <= ?`)
    params.push(new Date(query.endTime).toISOString())
  }
  if (query.provider) {
    conditions.push(`${prefix}provider = ?`)
    params.push(query.provider)
  }
  if (query.model) {
    conditions.push(`${prefix}model = ?`)
    params.push(query.model)
  }
  if (query.projectId) {
    conditions.push(`${prefix}project_id = ?`)
    params.push(query.projectId)
  }

  return { clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "", params }
}

// 解析日志状态为契约枚举。
const parseStatus = (value: string): UsageLogStatus =>
  value === "error" || value === "aborted" ? value : "success"

// 解析日志来源为契约枚举。
const parsePurpose = (value: string): UsagePurpose =>
  value === "subagent" || value === "compaction" || value === "title" || value === "suggested"
    ? value
    : "chat"

// 查询行转契约记录。
const toLogRecord = (row: UsageLogRow): UsageLogRecord => ({
  id: row.id,
  externalId: row.external_id,
  sessionId: row.session_id,
  projectId: row.project_id,
  purpose: parsePurpose(row.purpose),
  provider: row.provider,
  model: row.model,
  tokens: {
    input: row.input_tokens,
    output: row.output_tokens,
    cacheRead: row.cache_read_tokens,
    cacheWrite: row.cache_write_tokens,
  },
  rates: {
    inputCostUsd: row.input_cost_usd,
    outputCostUsd: row.output_cost_usd,
    cacheReadCostUsd: row.cache_read_cost_usd,
    cacheWriteCostUsd: row.cache_write_cost_usd,
    totalCostUsd: row.total_cost_usd,
  },
  durationMs: row.duration_ms,
  status: parseStatus(row.status),
  errorMessage: row.error_message,
  createdAt: new Date(row.created_at).getTime(),
})

/**
 * 提供请求日志写入、聚合统计与筛选查询服务。
 * 价格由调用方（usageRecorder）在写入时解析并传入，服务本身不依赖配置。
 */
export const createUsageLogService = (getConnection: () => Database.Database) => ({
  // 写入一条请求日志，成本按传入价格快照。
  record: (input: UsageLogInput, pricing?: ModelPricing | null): UsageLogRecord => {
    const database = getConnection()
    const createdAt = new Date(input.createdAt ?? Date.now()).toISOString()
    const externalId = randomUUID()
    const rates = computeUsageRates(input.tokens, pricing)

    const info = database
      .prepare(
        `INSERT INTO usage_log (
          external_id, session_id, project_id, purpose, provider, model,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
          input_cost_usd, output_cost_usd, cache_read_cost_usd, cache_write_cost_usd, total_cost_usd,
          duration_ms, status, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        externalId,
        input.sessionId ?? null,
        input.projectId ?? null,
        input.purpose,
        input.provider,
        input.model,
        input.tokens.input,
        input.tokens.output,
        input.tokens.cacheRead,
        input.tokens.cacheWrite,
        rates.inputCostUsd,
        rates.outputCostUsd,
        rates.cacheReadCostUsd,
        rates.cacheWriteCostUsd,
        rates.totalCostUsd,
        input.durationMs ?? null,
        input.status,
        input.errorMessage ?? null,
        createdAt,
      )

    return {
      id: Number(info.lastInsertRowid),
      externalId,
      sessionId: input.sessionId ?? null,
      projectId: input.projectId ?? null,
      purpose: input.purpose,
      provider: input.provider,
      model: input.model,
      tokens: { ...input.tokens },
      rates,
      durationMs: input.durationMs ?? null,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      createdAt: new Date(createdAt).getTime(),
    }
  },

  // 分页查询请求日志（按时间倒序）。
  listLogs: (query: UsageQuery, page = 1, pageSize = DEFAULT_PAGE_SIZE): UsageLogPage => {
    const database = getConnection()
    const { clause, params } = buildWhere(query)
    const safePage = Math.max(1, Math.floor(page))
    const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)))
    const offset = (safePage - 1) * safePageSize

    const totalRow = database
      .prepare(`SELECT COUNT(*) as total FROM usage_log ${clause}`)
      .get(...params) as { total: number }
    const rows = database
      .prepare(
        `SELECT * FROM usage_log ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, safePageSize, offset) as UsageLogRow[]

    return {
      rows: rows.map(toLogRecord),
      total: totalRow.total,
      page: safePage,
      pageSize: safePageSize,
    }
  },

  // 汇总统计：请求数、token、成本、成功率与平均耗时。
  getSummary: (query: UsageQuery): UsageSummary => {
    const database = getConnection()
    const { clause, params } = buildWhere(query)
    const row = database
      .prepare(
        `SELECT
          COUNT(*) as request_count,
          COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) as success_count,
          COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) as error_count,
          COALESCE(SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END), 0) as aborted_count,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
          COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
          COALESCE(SUM(CASE WHEN total_cost_usd IS NOT NULL THEN 1 ELSE 0 END), 0) as priced_count,
          SUM(total_cost_usd) as total_cost,
          AVG(duration_ms) as avg_duration
        FROM usage_log ${clause}`,
      )
      .get(...params) as {
      request_count: number
      success_count: number
      error_count: number
      aborted_count: number
      input_tokens: number
      output_tokens: number
      cache_read_tokens: number
      cache_write_tokens: number
      priced_count: number
      total_cost: number | null
      avg_duration: number | null
    }

    return {
      requestCount: row.request_count,
      successCount: row.success_count,
      errorCount: row.error_count,
      abortedCount: row.aborted_count,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheWriteTokens: row.cache_write_tokens,
      totalTokens: row.input_tokens + row.output_tokens,
      pricedRequestCount: row.priced_count,
      totalCostUsd: row.priced_count > 0 ? row.total_cost : null,
      successRate: row.request_count > 0 ? (row.success_count / row.request_count) * 100 : 0,
      avgDurationMs: row.avg_duration,
    }
  },

  // 按本地日期聚合每日用量。
  getDaily: (query: UsageQuery): UsageDailyPoint[] => {
    const database = getConnection()
    const { clause, params } = buildWhere(query)
    const rows = database
      .prepare(
        `SELECT
          date(created_at, 'localtime') as day,
          COUNT(*) as request_count,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
          COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
          SUM(total_cost_usd) as total_cost
        FROM usage_log ${clause}
        GROUP BY day
        ORDER BY day ASC`,
      )
      .all(...params) as Array<{
      day: string
      request_count: number
      input_tokens: number
      output_tokens: number
      cache_read_tokens: number
      cache_write_tokens: number
      total_cost: number | null
    }>

    return rows.map((row) => ({
      date: row.day,
      requestCount: row.request_count,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheWriteTokens: row.cache_write_tokens,
      totalCostUsd: row.total_cost,
    }))
  },

  // 按模型聚合统计（有价格缺失的模型成本为 null，平均成本按有价请求摊薄）。
  getModelStats: (query: UsageQuery): UsageModelStats[] => {
    const database = getConnection()
    const { clause, params } = buildWhere(query)
    const rows = database
      .prepare(
        `SELECT
          model,
          COUNT(*) as request_count,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
          COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
          SUM(CASE WHEN total_cost_usd IS NOT NULL THEN 1 ELSE 0 END) as priced_count,
          SUM(total_cost_usd) as total_cost
        FROM usage_log ${clause}
        GROUP BY model
        ORDER BY (total_cost IS NULL) ASC, total_cost DESC, request_count DESC`,
      )
      .all(...params) as Array<{
      model: string
      request_count: number
      input_tokens: number
      output_tokens: number
      cache_read_tokens: number
      cache_write_tokens: number
      priced_count: number
      total_cost: number | null
    }>

    return rows.map((row) => ({
      model: row.model,
      requestCount: row.request_count,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheWriteTokens: row.cache_write_tokens,
      totalTokens: row.input_tokens + row.output_tokens,
      totalCostUsd: row.priced_count > 0 ? row.total_cost : null,
      avgCostPerRequestUsd:
        row.priced_count > 0 && row.total_cost !== null ? row.total_cost / row.priced_count : null,
    }))
  },

  // 按 Provider 聚合统计。
  getProviderStats: (query: UsageQuery): UsageProviderStats[] => {
    const database = getConnection()
    const { clause, params } = buildWhere(query)
    const rows = database
      .prepare(
        `SELECT
          provider,
          COUNT(*) as request_count,
          COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN total_cost_usd IS NOT NULL THEN 1 ELSE 0 END) as priced_count,
          SUM(total_cost_usd) as total_cost,
          AVG(duration_ms) as avg_duration
        FROM usage_log ${clause}
        GROUP BY provider
        ORDER BY request_count DESC, provider ASC`,
      )
      .all(...params) as Array<{
      provider: string
      request_count: number
      total_tokens: number
      success_count: number
      priced_count: number
      total_cost: number | null
      avg_duration: number | null
    }>

    return rows.map((row) => ({
      provider: row.provider,
      requestCount: row.request_count,
      totalTokens: row.total_tokens,
      totalCostUsd: row.priced_count > 0 ? row.total_cost : null,
      successRate: row.request_count > 0 ? (row.success_count / row.request_count) * 100 : 0,
      avgDurationMs: row.avg_duration,
    }))
  },

  // 查询当前条件下有数据的筛选可选值（providers/models 排除自身维度筛选）。
  getFilterOptions: (query: UsageQuery): UsageFilterOptions => {
    const database = getConnection()

    const providerWhere = buildWhere({
      startTime: query.startTime,
      endTime: query.endTime,
      model: query.model,
      projectId: query.projectId,
    })
    const providers = (
      database
        .prepare(
          `SELECT DISTINCT provider FROM usage_log ${providerWhere.clause} ORDER BY provider ASC`,
        )
        .all(...providerWhere.params) as Array<{ provider: string }>
    ).map((row) => row.provider)

    const modelWhere = buildWhere({
      startTime: query.startTime,
      endTime: query.endTime,
      provider: query.provider,
      projectId: query.projectId,
    })
    const models = (
      database
        .prepare(`SELECT DISTINCT model FROM usage_log ${modelWhere.clause} ORDER BY model ASC`)
        .all(...modelWhere.params) as Array<{ model: string }>
    ).map((row) => row.model)

    const projectWhere = buildWhere(
      {
        startTime: query.startTime,
        endTime: query.endTime,
        provider: query.provider,
        model: query.model,
      },
      "ul",
    )
    const projectConditions = ["ul.project_id IS NOT NULL"]
    if (projectWhere.clause) {
      projectConditions.push(projectWhere.clause.replace(/^WHERE /, ""))
    }
    const projects = (
      database
        .prepare(
          `SELECT DISTINCT ul.project_id as id, p.name as name
           FROM usage_log ul
           LEFT JOIN project p ON p.external_id = ul.project_id
           WHERE ${projectConditions.join(" AND ")}
           ORDER BY (p.name IS NULL) ASC, p.name ASC, ul.project_id ASC`,
        )
        .all(...projectWhere.params) as Array<{ id: string; name: string | null }>
    ).map((row) => ({ id: row.id, name: row.name ?? row.id }))

    return { providers, models, projects }
  },
})

export const usageLogService = createUsageLogService(getDatabase)

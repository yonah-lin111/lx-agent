import { resolveUsageRange } from "@shared/contracts/usage"
import { useCallback, useEffect, useRef, useState } from "react"
import { usageApi } from "../api/usageApi"
import type {
  UsageDailyPoint,
  UsageFilterOptions,
  UsageLogPage,
  UsageModelStats,
  UsageProviderStats,
  UsageQuery,
  UsageRangeBounds,
  UsageSummary,
  UsageTimeRange,
} from "../types"

const PAGE_SIZE = 50
// 日志写入事件的时间窗防抖：一步一个请求，避免高频重载。
const RELOAD_DEBOUNCE_MS = 600

const EMPTY_FILTER_OPTIONS: UsageFilterOptions = { providers: [], models: [], projects: [] }

export interface UseUsageDataResult {
  range: UsageTimeRange
  provider?: string
  model?: string
  projectId?: string
  page: number
  rangeBounds: UsageRangeBounds
  summary: UsageSummary | null
  daily: UsageDailyPoint[]
  modelStats: UsageModelStats[]
  providerStats: UsageProviderStats[]
  filterOptions: UsageFilterOptions
  logPage: UsageLogPage | null
  isLoading: boolean
  error: string | null
  // 自动刷新间隔毫秒（0 = 关闭）。
  refreshIntervalMs: number
  setRange: (range: UsageTimeRange) => void
  setProvider: (provider?: string) => void
  setModel: (model?: string) => void
  setProjectId: (projectId?: string) => void
  setPage: (page: number) => void
  setRefreshIntervalMs: (intervalMs: number) => void
  refresh: () => void
}

/**
 * 管理用量统计的筛选、分页、聚合查询与日志写入事件刷新。
 */
export const useUsageData = (): UseUsageDataResult => {
  const [range, setRangeState] = useState<UsageTimeRange>("today")
  const [provider, setProviderState] = useState<string | undefined>(undefined)
  const [model, setModelState] = useState<string | undefined>(undefined)
  const [projectId, setProjectIdState] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [daily, setDaily] = useState<UsageDailyPoint[]>([])
  const [modelStats, setModelStats] = useState<UsageModelStats[]>([])
  const [providerStats, setProviderStats] = useState<UsageProviderStats[]>([])
  const [filterOptions, setFilterOptions] = useState<UsageFilterOptions>(EMPTY_FILTER_OPTIONS)
  const [logPage, setLogPage] = useState<UsageLogPage | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(0)
  // 图表所需的实时时间边界（每次 load 重新解析，避免挂载时冻结 endTime）。
  const [rangeBounds, setRangeBounds] = useState<UsageRangeBounds>(() => resolveUsageRange("today"))
  const requestIdRef = useRef(0)

  // 事件回调/定时器读取最新筛选与页码，避免重新订阅。
  const filtersRef = useRef({ range, provider, model, projectId })
  filtersRef.current = { range, provider, model, projectId }
  const pageRef = useRef(page)
  pageRef.current = page

  const load = useCallback(async (targetPage: number): Promise<void> => {
    // 时间范围在每次加载时按当前时间重新解析：today/7d/30d 的 endTime = 请求时刻，
    // 否则刷新/自动刷新会一直查询挂载时刻之前的旧区间，新日志永远不可见。
    const latest = filtersRef.current
    const bounds = resolveUsageRange(latest.range)
    const targetQuery: UsageQuery = {
      ...bounds,
      provider: latest.provider,
      model: latest.model,
      projectId: latest.projectId,
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsLoading(true)
    setError(null)
    try {
      const [nextSummary, nextDaily, nextModelStats, nextProviderStats, nextOptions, nextLogs] =
        await Promise.all([
          usageApi.getSummary(targetQuery),
          usageApi.getDaily(targetQuery),
          usageApi.getModelStats(targetQuery),
          usageApi.getProviderStats(targetQuery),
          usageApi.getFilterOptions(targetQuery),
          usageApi.listLogs(targetQuery, targetPage, PAGE_SIZE),
        ])
      // 过期请求（筛选快速切换）丢弃结果。
      if (requestId !== requestIdRef.current) return
      setSummary(nextSummary)
      setDaily(nextDaily)
      setModelStats(nextModelStats)
      setProviderStats(nextProviderStats)
      setFilterOptions(nextOptions)
      setLogPage(nextLogs)
      setRangeBounds(bounds)
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return
      setError(loadError instanceof Error ? loadError.message : "Failed to load usage data")
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load(page)
  }, [load, range, provider, model, projectId, page])

  // 日志写入后防抖重载当前视图。
  useEffect(() => {
    let timer: number | undefined
    const unsubscribe = usageApi.onLogRecorded(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void load(pageRef.current)
      }, RELOAD_DEBOUNCE_MS)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [load])

  // 自动刷新：间隔 > 0 时定时重载当前视图（0 = 关闭）。
  useEffect(() => {
    if (refreshIntervalMs <= 0) return
    const timer = window.setInterval(() => {
      void load(pageRef.current)
    }, refreshIntervalMs)
    return () => window.clearInterval(timer)
  }, [refreshIntervalMs, load])

  // 筛选变化重置页码；切换 Provider 时级联清空模型。
  const setRange = useCallback((next: UsageTimeRange): void => {
    setRangeState(next)
    setPage(1)
  }, [])
  const setProvider = useCallback((next?: string): void => {
    setProviderState(next)
    setModelState(undefined)
    setPage(1)
  }, [])
  const setModel = useCallback((next?: string): void => {
    setModelState(next)
    setPage(1)
  }, [])
  const setProjectId = useCallback((next?: string): void => {
    setProjectIdState(next)
    setPage(1)
  }, [])

  const refresh = useCallback((): void => {
    void load(pageRef.current)
  }, [load])

  return {
    range,
    provider,
    model,
    projectId,
    page,
    rangeBounds,
    summary,
    daily,
    modelStats,
    providerStats,
    filterOptions,
    logPage,
    isLoading,
    error,
    refreshIntervalMs,
    setRange,
    setProvider,
    setModel,
    setProjectId,
    setPage,
    setRefreshIntervalMs,
    refresh,
  }
}

import { resolveUsageRange } from "@shared/contracts/usage"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  query: UsageQuery
  rangeBounds: UsageRangeBounds
  summary: UsageSummary | null
  daily: UsageDailyPoint[]
  modelStats: UsageModelStats[]
  providerStats: UsageProviderStats[]
  filterOptions: UsageFilterOptions
  logPage: UsageLogPage | null
  isLoading: boolean
  error: string | null
  setRange: (range: UsageTimeRange) => void
  setProvider: (provider?: string) => void
  setModel: (model?: string) => void
  setProjectId: (projectId?: string) => void
  setPage: (page: number) => void
  refresh: () => void
}

/**
 * 管理用量统计的筛选、分页、聚合查询与日志写入事件刷新。
 */
export const useUsageData = (): UseUsageDataResult => {
  const [range, setRangeState] = useState<UsageTimeRange>("7d")
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
  const requestIdRef = useRef(0)

  const rangeBounds = useMemo(() => resolveUsageRange(range), [range])
  const query = useMemo<UsageQuery>(
    () => ({ ...rangeBounds, provider, model, projectId }),
    [rangeBounds, provider, model, projectId],
  )

  // 事件回调读取最新的查询与页码，避免重新订阅。
  const queryRef = useRef(query)
  queryRef.current = query
  const pageRef = useRef(page)
  pageRef.current = page

  const load = useCallback(async (targetQuery: UsageQuery, targetPage: number): Promise<void> => {
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
    void load(query, page)
  }, [load, query, page])

  // 日志写入后防抖重载当前视图。
  useEffect(() => {
    let timer: number | undefined
    const unsubscribe = usageApi.onLogRecorded(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void load(queryRef.current, pageRef.current)
      }, RELOAD_DEBOUNCE_MS)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [load])

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
    void load(queryRef.current, pageRef.current)
  }, [load])

  return {
    range,
    provider,
    model,
    projectId,
    page,
    query,
    rangeBounds,
    summary,
    daily,
    modelStats,
    providerStats,
    filterOptions,
    logPage,
    isLoading,
    error,
    setRange,
    setProvider,
    setModel,
    setProjectId,
    setPage,
    refresh,
  }
}

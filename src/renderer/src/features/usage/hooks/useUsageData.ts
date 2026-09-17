import { resolveUsageGranularity, resolveUsageRangeSelection } from "@shared/contracts/usage"
import { useCallback, useEffect, useRef, useState } from "react"
import { usageApi } from "../api/usageApi"
import type {
  UsageDailyPoint,
  UsageFilterOptions,
  UsageGranularity,
  UsageLogPage,
  UsageModelStats,
  UsageProviderStats,
  UsageQuery,
  UsageRangeBounds,
  UsageRangeSelection,
  UsageSummary,
} from "../types"

const PAGE_SIZE = 50
// 日志写入事件的时间窗防抖：一步一个请求，避免高频重载。
const RELOAD_DEBOUNCE_MS = 600

const EMPTY_FILTER_OPTIONS: UsageFilterOptions = {
  providers: [],
  models: [],
  projects: [],
  sessions: [],
}

export interface UseUsageDataResult {
  rangeSelection: UsageRangeSelection
  provider?: string
  model?: string
  projectId?: string
  sessionId?: string
  page: number
  rangeBounds: UsageRangeBounds
  // 图表序列粒度：单日范围（today 或单日自定义）为 hour，其余为 day。
  granularity: UsageGranularity
  summary: UsageSummary | null
  daily: UsageDailyPoint[]
  modelStats: UsageModelStats[]
  providerStats: UsageProviderStats[]
  filterOptions: UsageFilterOptions
  logPage: UsageLogPage | null
  isLoading: boolean
  error: string | null
  // 自动刷新间隔毫秒（0 = 关闭；关闭时日志写入事件也不触发实时重载）。
  refreshIntervalMs: number
  setRangeSelection: (selection: UsageRangeSelection) => void
  setProvider: (provider?: string) => void
  setModel: (model?: string) => void
  setProjectId: (projectId?: string) => void
  setSessionId: (sessionId?: string) => void
  setPage: (page: number) => void
  setRefreshIntervalMs: (intervalMs: number) => void
  refresh: () => void
}

/**
 * 管理用量统计的筛选、分页、聚合查询与日志写入事件刷新。
 */
export const useUsageData = (): UseUsageDataResult => {
  const [rangeSelection, setRangeSelectionState] = useState<UsageRangeSelection>({
    preset: "today",
  })
  const [provider, setProviderState] = useState<string | undefined>(undefined)
  const [model, setModelState] = useState<string | undefined>(undefined)
  const [projectId, setProjectIdState] = useState<string | undefined>(undefined)
  const [sessionId, setSessionIdState] = useState<string | undefined>(undefined)
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
  const [rangeBounds, setRangeBounds] = useState<UsageRangeBounds>(() =>
    resolveUsageRangeSelection({ preset: "today" }),
  )
  const requestIdRef = useRef(0)

  // 事件回调/定时器读取最新筛选与页码，避免重新订阅。
  const filtersRef = useRef({ rangeSelection, provider, model, projectId, sessionId })
  filtersRef.current = { rangeSelection, provider, model, projectId, sessionId }
  const pageRef = useRef(page)
  pageRef.current = page
  const refreshIntervalRef = useRef(refreshIntervalMs)
  refreshIntervalRef.current = refreshIntervalMs

  const load = useCallback(async (targetPage: number): Promise<void> => {
    // 时间范围在每次加载时按当前时间重新解析：预设 endTime = 请求时刻、结束日为今天的自定义区间
    // 截止到当前时刻，否则刷新/自动刷新会一直查询挂载时刻之前的旧区间，新日志永远不可见。
    const latest = filtersRef.current
    const bounds = resolveUsageRangeSelection(latest.rangeSelection)
    const granularity = resolveUsageGranularity(latest.rangeSelection)
    const targetQuery: UsageQuery = {
      ...bounds,
      provider: latest.provider,
      model: latest.model,
      projectId: latest.projectId,
      sessionId: latest.sessionId,
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsLoading(true)
    setError(null)
    try {
      const [nextSummary, nextDaily, nextModelStats, nextProviderStats, nextOptions, nextLogs] =
        await Promise.all([
          usageApi.getSummary(targetQuery),
          usageApi.getDaily(targetQuery, granularity),
          usageApi.getModelStats(targetQuery),
          usageApi.getProviderStats(targetQuery),
          usageApi.getFilterOptions(targetQuery),
          usageApi.listLogs(targetQuery, targetPage, PAGE_SIZE),
        ])
      // 过期请求（筛选快速切换）丢弃结果。
      if (requestId !== requestIdRef.current) return
      // 选中会话在当前时间范围下已无记录（如切换时间范围）：回落“全部会话”，
      // 本轮结果作废，由 sessionId 变化触发的下一轮加载刷新视图。
      if (
        latest.sessionId &&
        !nextOptions.sessions.some((session) => session.id === latest.sessionId)
      ) {
        setSessionIdState(undefined)
        return
      }
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
  }, [load, rangeSelection, provider, model, projectId, sessionId, page])

  // 日志写入后防抖重载：仅在自动刷新开启时生效（off 时不做任何实时更新）。
  useEffect(() => {
    let timer: number | undefined
    const unsubscribe = usageApi.onLogRecorded(() => {
      if (refreshIntervalRef.current <= 0) return
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

  // 筛选变化重置页码；切换 Provider 时级联清空模型；切换项目时级联清空会话。
  const setRangeSelection = useCallback((next: UsageRangeSelection): void => {
    setRangeSelectionState(next)
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
    setSessionIdState(undefined)
    setPage(1)
  }, [])
  const setSessionId = useCallback((next?: string): void => {
    setSessionIdState(next)
    setPage(1)
  }, [])

  const refresh = useCallback((): void => {
    void load(pageRef.current)
  }, [load])

  return {
    rangeSelection,
    provider,
    model,
    projectId,
    sessionId,
    page,
    rangeBounds,
    granularity: resolveUsageGranularity(rangeSelection),
    summary,
    daily,
    modelStats,
    providerStats,
    filterOptions,
    logPage,
    isLoading,
    error,
    refreshIntervalMs,
    setRangeSelection,
    setProvider,
    setModel,
    setProjectId,
    setSessionId,
    setPage,
    setRefreshIntervalMs,
    refresh,
  }
}

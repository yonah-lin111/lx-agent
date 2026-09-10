// 单日活跃度记录（用于绿墙热力图展示）。
export interface ActivityDayEntry {
  date: string
  count: number
  turns: number
  toolCalls: number
}

// 概览时间跨度选项。
export type OverviewTimeRange = "today" | "7d" | "30d" | "all"

// 周期聚合统计简报（支持今日、近 7 天、近 30 天与全部时间）。
export interface OverviewPeriodSummary {
  range: OverviewTimeRange
  turns: number
  toolCalls: number
  toolSuccessRate: number
  toolAvgDurationMs: number
  sessionCount: number
}

// 概览核心统计指标。
export interface OverviewMetrics {
  // 选定时间范围的聚合简报说明
  periodSummary?: OverviewPeriodSummary
  // Agent 交互总量：近 30 天与今日
  agentTurns: {
    total30d: number
    today: number
  }
  // 工具调用概况：调用总数、成功数与成功率（百分比）
  toolCalls: {
    total: number
    successCount: number
    successRate: number
  }
  // 活跃天数与连续活跃统计（基于近 365 天生产力热力图）
  activeDays: {
    totalDays: number
    longestStreak: number
    currentStreak: number
    activeRate: number
  }
  // 工具调用耗时：累计执行耗时与平均单次耗时（毫秒）
  toolDuration?: {
    totalMs: number
    avgMs: number
  }
  // 项目条目进度：全部或指定项目下的 Prompt 待办与完成统计
  projectItems?: {
    total: number
    todo: number
    inProgress: number
    completed: number
    completionRate: number
  }
  // 会话总览
  sessions: {
    total: number
    lastActiveAt: string | null
  }
}

// 概览项目简要信息（供项目切换器使用）。
export interface OverviewProjectOption {
  id: string
  name: string
}

// 概览统计数据返回载荷。
export interface OverviewStats {
  metrics: OverviewMetrics
  activityHeatmap: ActivityDayEntry[]
  activeProjectId?: string
  metricsProjectId?: string
  heatmapProjectId?: string
  timeRange?: OverviewTimeRange
  projects: OverviewProjectOption[]
}

// 获取概览数据输入参数。
export interface GetOverviewStatsInput {
  projectId?: string
  metricsProjectId?: string
  heatmapProjectId?: string
  timeRange?: OverviewTimeRange
}

// 概览领域 preload API 契约。
export interface OverviewApi {
  overview: {
    getStats: (input?: GetOverviewStatsInput) => Promise<OverviewStats>
  }
}

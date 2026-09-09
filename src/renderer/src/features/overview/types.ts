export type {
  ActivityDayEntry,
  GetOverviewStatsInput,
  OverviewMetrics,
  OverviewProjectOption,
  OverviewStats,
} from "@shared/contracts/overview"

// 热力图单格单元数据。
export interface HeatmapCell {
  date: string
  count: number
  turns: number
  toolCalls: number
  level: 0 | 1 | 2 | 3 | 4
}

// 热力图按周组织的网格列（每周包含最多 7 天）。
export interface HeatmapWeek {
  weekIndex: number
  days: (HeatmapCell | null)[]
  monthLabel?: string
}

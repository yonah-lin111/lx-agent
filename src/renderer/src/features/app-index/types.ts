export type { DailyActivity } from "@shared/contracts/activity"

// 热力图单格单元数据。
export interface HeatmapCell {
  date: string
  count: number
  level: 0 | 1 | 2 | 3 | 4
}

// 热力图按周组织的网格列（每周包含最多 7 天）。
export interface HeatmapWeek {
  weekIndex: number
  days: (HeatmapCell | null)[]
}

// 热力图按月组织的独立区块数据结构（支持按月流式自适应换行）。
export interface HeatmapMonth {
  monthKey: string
  label: string
  year: number
  month: number
  weeks: HeatmapWeek[]
}

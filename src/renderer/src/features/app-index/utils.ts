import type { DailyActivity } from "@shared/contracts/activity"
import type { HeatmapCell, HeatmapMonth, HeatmapWeek } from "./types"

/**
 * 根据会话数与当前数据集最大频次按比例计算热力图阶梯等级（0 - 4）。
 * 解决超过固定阈值后颜色全部饱和、缺乏区分度的问题。
 */
export const getActivityLevel = (count: number, maxCount: number = 0): 0 | 1 | 2 | 3 | 4 => {
  if (count <= 0) return 0
  if (maxCount <= 1) return 4

  const ratio = count / maxCount
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/**
 * 将每日会话记录组织为按月分组的自适应网格结构（HeatmapMonth[]）。
 * 每个月份为一个独立的周列容器（周一为起始行 0，周日为 6），支持：
 * 1. 容器宽度充足时，所有月份在单行连续平铺（不折行）；
 * 2. 容器宽度不足时，以“月份”为最小原子单位逐月自然折行（按月折行，不整块粗暴截断）；
 * 3. 严格对齐 Mon..Sun 7 天垂直基线，单元格无缝衔接。
 */
export const buildHeatmapMonths = (
  entries: DailyActivity[],
): {
  months: HeatmapMonth[]
  maxCount: number
} => {
  if (entries.length === 0) {
    return { months: [], maxCount: 0 }
  }

  const maxCount = entries.reduce((max, entry) => Math.max(max, entry.count), 0)

  // 按 YYYY-MM 进行月度聚合分组
  interface MonthBucket {
    monthKey: string
    year: number
    month: number
    entries: DailyActivity[]
  }

  const buckets: MonthBucket[] = []
  let currentBucket: MonthBucket | null = null

  for (const entry of entries) {
    const dateObj = new Date(`${entry.date}T00:00:00`)
    const year = dateObj.getFullYear()
    const month = dateObj.getMonth()
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`

    if (!currentBucket || currentBucket.monthKey !== monthKey) {
      currentBucket = {
        monthKey,
        year,
        month,
        entries: [],
      }
      buckets.push(currentBucket)
    }
    currentBucket.entries.push(entry)
  }

  let globalWeekIndex = 0
  const months: HeatmapMonth[] = []

  for (const bucket of buckets) {
    const monthWeeks: HeatmapWeek[] = []
    let currentWeekDays: (HeatmapCell | null)[] = []

    // 计算当月首日的星期索引（周一=0，周日=6）
    const firstDate = new Date(`${bucket.entries[0].date}T00:00:00`)
    const firstDayOfWeek = (firstDate.getDay() + 6) % 7

    // 前置补齐非当月周内日期的占位符
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeekDays.push(null)
    }

    for (const entry of bucket.entries) {
      currentWeekDays.push({
        date: entry.date,
        count: entry.count,
        level: getActivityLevel(entry.count, maxCount),
      })

      if (currentWeekDays.length === 7) {
        monthWeeks.push({
          weekIndex: globalWeekIndex++,
          days: currentWeekDays,
        })
        currentWeekDays = []
      }
    }

    // 尾部补齐占位符至满 7 天
    if (currentWeekDays.length > 0) {
      while (currentWeekDays.length < 7) {
        currentWeekDays.push(null)
      }
      monthWeeks.push({
        weekIndex: globalWeekIndex++,
        days: currentWeekDays,
      })
    }

    months.push({
      monthKey: bucket.monthKey,
      label: MONTH_NAMES[bucket.month],
      year: bucket.year,
      month: bucket.month,
      weeks: monthWeeks,
    })
  }

  return { months, maxCount }
}

/**
 * 将星标数格式化为 GitHub 风格紧凑文本（999 → 999，1234 → 1.2k，123456 → 123k）。
 */
export const formatStarCount = (stars: number): string => {
  if (stars < 1000) return String(stars)

  const truncatedThousands = Math.floor(stars / 100) / 10
  return truncatedThousands < 100 ? `${truncatedThousands}k` : `${Math.floor(stars / 1000)}k`
}

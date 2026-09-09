import type { ActivityDayEntry, HeatmapCell, HeatmapWeek } from "./types"

/**
 * 根据交互次数与当前数据集最大频次按比例计算热力图阶梯等级（0 - 4）。
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

// 格式化数字千分位。
export const formatNumber = (num: number): string => num.toLocaleString("en-US")

/**
 * 获取周内首个有效日期的月份索引（0-11）。
 */
const getWeekMonth = (week: HeatmapWeek): number | null => {
  for (const day of week.days) {
    if (day) {
      return new Date(`${day.date}T00:00:00`).getMonth()
    }
  }
  return null
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
 * 将平铺的近 365 天活动记录转换为按周组织的网格列结构（周一为起始行 0，周日为 6）。
 * 自动计算全局非零最大频次，驱动各单元格按比例分阶。
 * 并自动划分为对称双层（Tier 1 上半年，Tier 2 下半年），支持无横向滚动条自适应换行。
 */
export const buildHeatmapWeeks = (
  entries: ActivityDayEntry[],
): {
  weeks: HeatmapWeek[]
  tiers: HeatmapWeek[][]
  monthLabels: Array<{ label: string; weekIndex: number }>
  maxCount: number
} => {
  if (entries.length === 0) {
    return { weeks: [], tiers: [], monthLabels: [], maxCount: 0 }
  }

  const maxCount = entries.reduce((max, entry) => Math.max(max, entry.count), 0)
  const weeks: HeatmapWeek[] = []
  const monthLabels: Array<{ label: string; weekIndex: number }> = []

  let currentWeekDays: (HeatmapCell | null)[] = []
  let lastMonth = -1

  // 计算第一天的星期（周一=0，周日=6）
  const firstDate = new Date(`${entries[0].date}T00:00:00`)
  const firstDayOfWeek = (firstDate.getDay() + 6) % 7

  // 前置补齐占位
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeekDays.push(null)
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const dateObj = new Date(`${entry.date}T00:00:00`)
    const month = dateObj.getMonth()

    if (month !== lastMonth) {
      monthLabels.push({
        label: MONTH_NAMES[month],
        weekIndex: weeks.length,
      })
      lastMonth = month
    }

    currentWeekDays.push({
      date: entry.date,
      count: entry.count,
      turns: entry.turns,
      toolCalls: entry.toolCalls,
      level: getActivityLevel(entry.count, maxCount),
    })

    if (currentWeekDays.length === 7) {
      weeks.push({ weekIndex: weeks.length, days: currentWeekDays })
      currentWeekDays = []
    }
  }

  // 尾部补齐占位
  if (currentWeekDays.length > 0) {
    while (currentWeekDays.length < 7) {
      currentWeekDays.push(null)
    }
    weeks.push({ weekIndex: weeks.length, days: currentWeekDays })
  }

  // 构建支持自适应换行的分层结构（单周数据集保持 1 层，完整年度数据划分为 2 层）
  const tiers: HeatmapWeek[][] = []
  if (weeks.length <= 1) {
    const singleTier = weeks.map((w) => ({ ...w }))
    if (singleTier.length > 0) {
      const month = getWeekMonth(singleTier[0])
      if (month !== null) {
        singleTier[0].monthLabel = MONTH_NAMES[month]
      }
      tiers.push(singleTier)
    }
  } else {
    const splitIndex = Math.ceil(weeks.length / 2)
    const tier1 = weeks.slice(0, splitIndex).map((w) => ({ ...w }))
    const tier2 = weeks.slice(splitIndex).map((w) => ({ ...w }))

    // 对齐两组周列数，保证上下对称
    const maxCols = Math.max(tier1.length, tier2.length)
    while (tier2.length < maxCols) {
      tier2.push({
        weekIndex: weeks.length + (maxCols - tier2.length),
        days: [null, null, null, null, null, null, null],
      })
    }

    const assignLabels = (tierWeeks: HeatmapWeek[]): void => {
      let lastLabeledCol = -99
      let prevMonth = -1

      for (let colIdx = 0; colIdx < tierWeeks.length; colIdx++) {
        const week = tierWeeks[colIdx]
        const m = getWeekMonth(week)
        if (m === null) continue

        const isFirstCol = colIdx === 0
        const isNewMonth = m !== prevMonth && prevMonth !== -1
        const hasEnoughSpacing = colIdx - lastLabeledCol >= 3

        if (isFirstCol || (isNewMonth && hasEnoughSpacing)) {
          week.monthLabel = MONTH_NAMES[m]
          lastLabeledCol = colIdx
        }
        prevMonth = m
      }
    }

    assignLabels(tier1)
    assignLabels(tier2)

    tiers.push(tier1, tier2)
  }

  return { weeks, tiers, monthLabels, maxCount }
}

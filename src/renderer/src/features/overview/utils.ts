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
 * 将平铺的近 365 天活动记录转换为按周组织的网格列结构（周一为起始行 0，周日为 6）。
 * 自动计算全局非零最大频次，驱动各单元格按比例分阶。
 */
export const buildHeatmapWeeks = (
  entries: ActivityDayEntry[],
): {
  weeks: HeatmapWeek[]
  monthLabels: Array<{ label: string; weekIndex: number }>
  maxCount: number
} => {
  if (entries.length === 0) {
    return { weeks: [], monthLabels: [], maxCount: 0 }
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

    // 跨月且当前周有足够间距时标记月份文字
    if (month !== lastMonth) {
      const monthNames = [
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
      monthLabels.push({
        label: monthNames[month],
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

  return { weeks, monthLabels, maxCount }
}

import type { ActivityDayEntry, HeatmapCell, HeatmapWeek } from "./types"

/**
 * 根据交互次数计算热力图阶梯等级（0 - 4）。
 */
export const getActivityLevel = (count: number): 0 | 1 | 2 | 3 | 4 => {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 9) return 3
  return 4
}

// 格式化数字千分位。
export const formatNumber = (num: number): string => num.toLocaleString("en-US")

/**
 * 将平铺的近 365 天活动记录转换为按周组织的网格列结构（周一为起始行 0，周日为 6）。
 */
export const buildHeatmapWeeks = (
  entries: ActivityDayEntry[],
): {
  weeks: HeatmapWeek[]
  monthLabels: Array<{ label: string; weekIndex: number }>
} => {
  if (entries.length === 0) {
    return { weeks: [], monthLabels: [] }
  }

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
      level: getActivityLevel(entry.count),
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

  return { weeks, monthLabels }
}

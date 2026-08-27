/**
 * Current Time Reminder 状态机
 *
 * 参考 Codex `core/src/session/time_reminder.rs`
 * 周期性记录时间戳并在每轮对话跨越时间窗口或阈值时计算时间提醒片段。
 */

export interface TimeReminderConfig {
  intervalSeconds: number
}

export class TimeReminderTracker {
  private lastDeliveryTime: number | null = null
  private readonly intervalSeconds: number

  constructor(config: TimeReminderConfig = { intervalSeconds: 300 }) {
    this.intervalSeconds = config.intervalSeconds
  }

  /**
   * 检查当前时间是否达到触发提醒的阈值
   */
  public isReminderDue(now: number = Date.now()): boolean {
    if (this.lastDeliveryTime === null) {
      this.lastDeliveryTime = now
      return true
    }
    const elapsedSeconds = Math.floor((now - this.lastDeliveryTime) / 1000)
    if (elapsedSeconds >= this.intervalSeconds) {
      this.lastDeliveryTime = now
      return true
    }
    return false
  }

  /**
   * 格式化时间提醒注入块（遵循 Codex 规范）
   */
  public static formatReminder(date: Date = new Date()): string {
    const utc = date.toISOString()
    const local = date.toString()
    return `<current_time>\nUTC: ${utc}\nLocal: ${local}\n</current_time>`
  }
}

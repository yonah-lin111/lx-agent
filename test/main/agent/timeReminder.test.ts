import { describe, expect, it } from "vitest"
import { TimeReminderTracker } from "@/agent/core/timeReminder"

describe("TimeReminderTracker", () => {
  it("should trigger reminder on first run", () => {
    const tracker = new TimeReminderTracker({ intervalSeconds: 300 })
    expect(tracker.isReminderDue(1000)).toBe(true)
  })

  it("should suppress reminder within interval", () => {
    const tracker = new TimeReminderTracker({ intervalSeconds: 300 })
    tracker.isReminderDue(1000)
    expect(tracker.isReminderDue(1000 + 100 * 1000)).toBe(false)
  })

  it("should trigger reminder after interval elapsed", () => {
    const tracker = new TimeReminderTracker({ intervalSeconds: 300 })
    tracker.isReminderDue(1000)
    expect(tracker.isReminderDue(1000 + 301 * 1000)).toBe(true)
  })

  it("should format current time correctly", () => {
    const date = new Date("2026-08-27T12:00:00Z")
    const formatted = TimeReminderTracker.formatReminder(date)
    expect(formatted).toContain("<current_time>")
    expect(formatted).toContain("2026-08-27T12:00:00.000Z")
    expect(formatted).toContain("</current_time>")
  })
})

import { describe, expect, it } from "vitest"
import {
  buildDodgeSchedule,
  computeDodgeScore,
  DODGE_DURATION_MS,
} from "@/features/arcade/games/dodge/waves"

describe("星尘闪避波次与计分", () => {
  it("相同种子生成完全一致的弹幕时间表", () => {
    const first = buildDodgeSchedule(42)
    const second = buildDodgeSchedule(42)
    const third = buildDodgeSchedule(43)

    expect(first).toEqual(second)
    expect(first).not.toEqual(third)
  })

  it("事件时间递增且都在单局时长内，速度与数量在合理区间", () => {
    const schedule = buildDodgeSchedule(2026)

    expect(schedule.length).toBeGreaterThan(10)
    expect(schedule[0].atMs).toBeGreaterThanOrEqual(1000)

    for (let index = 0; index < schedule.length; index += 1) {
      const event = schedule[index]
      expect(event.atMs).toBeLessThan(DODGE_DURATION_MS)
      expect(event.count).toBeGreaterThanOrEqual(1)
      expect(event.speed).toBeGreaterThanOrEqual(150)
      expect(event.speed).toBeLessThanOrEqual(400)
      if (index > 0) expect(event.atMs).toBeGreaterThan(schedule[index - 1].atMs)
    }
  })

  it("密度随进度上升（最后 20 秒事件数多于前 20 秒）", () => {
    for (const seed of [7, 99]) {
      const schedule = buildDodgeSchedule(seed)
      const early = schedule.filter((event) => event.atMs <= 20000).length
      const late = schedule.filter((event) => event.atMs >= DODGE_DURATION_MS - 20000).length
      expect(late).toBeGreaterThan(early)
    }
  })

  it("计分公式：每秒 10 分 + 每颗星光 25 分", () => {
    expect(computeDodgeScore(0, 0)).toBe(0)
    expect(computeDodgeScore(12345, 3)).toBe(195)
    expect(computeDodgeScore(60000, 0)).toBe(600)
  })
})

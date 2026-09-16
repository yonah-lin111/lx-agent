import { describe, expect, it } from "vitest"
import {
  computeHopLandingPoints,
  createHopPlatform,
  getHopApexHeight,
  getHopChargeRatio,
  getHopFlightDurationMs,
  getHopJumpDistance,
  HOP_MAX_CHARGE_MS,
  HOP_MAX_DISTANCE,
  HOP_MIN_DISTANCE,
  resolveHopLanding,
} from "@/features/arcade/games/hop/world"
import { createSeededRandom } from "@/features/arcade/utils"

describe("跳一跳世界规则", () => {
  it("蓄力比例与跳跃距离线性映射且被钳制", () => {
    expect(getHopChargeRatio(0)).toBe(0)
    expect(getHopChargeRatio(HOP_MAX_CHARGE_MS)).toBe(1)
    expect(getHopChargeRatio(HOP_MAX_CHARGE_MS * 2)).toBe(1)

    expect(getHopJumpDistance(0)).toBe(HOP_MIN_DISTANCE)
    expect(getHopJumpDistance(HOP_MAX_CHARGE_MS)).toBe(HOP_MAX_DISTANCE)
    expect(getHopJumpDistance(HOP_MAX_CHARGE_MS * 2)).toBe(HOP_MAX_DISTANCE)
    expect(getHopJumpDistance(300)).toBeGreaterThan(getHopJumpDistance(100))

    expect(getHopFlightDurationMs(HOP_MAX_CHARGE_MS)).toBeGreaterThan(getHopFlightDurationMs(0))
    expect(getHopApexHeight(HOP_MAX_CHARGE_MS)).toBeGreaterThan(getHopApexHeight(0))
  })

  it("生成的下一块平台始终可见间隙且在蓄力可达范围内", () => {
    const random = createSeededRandom(23)
    let platform = { x: 100, width: 120 }
    for (let index = 0; index < 80; index += 1) {
      const next = createHopPlatform(platform, random)
      const centerDistance = next.x + next.width / 2 - (platform.x + platform.width / 2)

      expect(next.width).toBeGreaterThan(0)
      expect(next.x).toBeGreaterThan(platform.x + platform.width)
      expect(centerDistance).toBeGreaterThanOrEqual(HOP_MIN_DISTANCE)
      expect(centerDistance).toBeLessThanOrEqual(HOP_MAX_DISTANCE)
      platform = next
    }
  })

  it("落点判定：中心 ±10px 为完美，平台外为失败", () => {
    const platform = { x: 200, width: 60 }
    expect(resolveHopLanding(platform, 230)).toBe("perfect")
    expect(resolveHopLanding(platform, 240)).toBe("perfect")
    expect(resolveHopLanding(platform, 241)).toBe("landed")
    expect(resolveHopLanding(platform, 200)).toBe("landed")
    expect(resolveHopLanding(platform, 260)).toBe("landed")
    expect(resolveHopLanding(platform, 199)).toBe("miss")
    expect(resolveHopLanding(platform, 261)).toBe("miss")

    expect(computeHopLandingPoints("perfect")).toBe(2)
    expect(computeHopLandingPoints("landed")).toBe(1)
    expect(computeHopLandingPoints("miss")).toBe(0)
  })
})

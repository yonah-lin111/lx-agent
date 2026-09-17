import { describe, expect, it } from "vitest"
import { BUILTIN_WIDTH } from "@/features/game/builtin/constants"
import {
  CAKE_BASE_WIDTH,
  CAKE_MAX_SLIDE_SPEED,
  CAKE_MIN_SLIDE_SPEED,
  CAKE_PERFECT_TOLERANCE,
  clampCakeSlideCenter,
  computeCakeLayerPoints,
  getCakeSlideBounds,
  getCakeSlideSpeed,
  resolveCakeDrop,
} from "@/features/game/builtin/games/cake/world"

const base = { x: (BUILTIN_WIDTH - CAKE_BASE_WIDTH) / 2, width: CAKE_BASE_WIDTH }

describe("叠蛋糕世界规则", () => {
  it("完美对齐：吸附到下层并保持宽度，不产生切边", () => {
    const incoming = { x: base.x + CAKE_PERFECT_TOLERANCE, width: base.width }
    const result = resolveCakeDrop(base, incoming)

    expect(result.landing).toBe("perfect")
    expect(result.layer).toEqual(base)
    expect(result.sliced).toBeNull()
    expect(computeCakeLayerPoints("perfect")).toBe(2)
  })

  it("错位落层：保留重叠部分，超出部分被切掉且记录切片位置", () => {
    // 向右偏移 60px
    const offset = 60
    const incoming = { x: base.x + offset, width: base.width }
    const result = resolveCakeDrop(base, incoming)

    expect(result.landing).toBe("trimmed")
    expect(result.layer.width).toBe(base.width - offset)
    expect(result.layer.x).toBe(base.x + offset)
    expect(result.sliced).toEqual({ x: base.x + base.width, width: offset })
    expect(computeCakeLayerPoints("trimmed")).toBe(1)

    // 向左偏移时切片落在左侧
    const leftIncoming = { x: base.x - offset, width: base.width }
    const leftResult = resolveCakeDrop(base, leftIncoming)
    expect(leftResult.layer.x).toBe(base.x)
    expect(leftResult.sliced).toEqual({ x: base.x - offset, width: offset })
  })

  it("完全错开判定为失败", () => {
    const incoming = { x: base.x + base.width + 20, width: 120 }
    const result = resolveCakeDrop(base, incoming)

    expect(result.landing).toBe("miss")
    expect(computeCakeLayerPoints("miss")).toBe(0)
    expect(result.sliced?.width).toBe(120)
  })

  it("摆动速度随层数上升并有上限", () => {
    expect(getCakeSlideSpeed(1)).toBe(CAKE_MIN_SLIDE_SPEED + 14)
    expect(getCakeSlideSpeed(10)).toBeGreaterThan(getCakeSlideSpeed(1))
    expect(getCakeSlideSpeed(999)).toBe(CAKE_MAX_SLIDE_SPEED)
  })

  it("摆动区间保证整层留在屏幕内且中心被钳制", () => {
    const bounds = getCakeSlideBounds(200, BUILTIN_WIDTH, 36)
    expect(bounds.min).toBe(136)
    expect(bounds.max).toBe(BUILTIN_WIDTH - 136)
    expect(clampCakeSlideCenter(0, bounds)).toBe(bounds.min)
    expect(clampCakeSlideCenter(BUILTIN_WIDTH * 2, bounds)).toBe(bounds.max)

    // 宽度超过可用空间时区间不会反转
    const wide = getCakeSlideBounds(BUILTIN_WIDTH + 400, BUILTIN_WIDTH, 36)
    expect(wide.max).toBeGreaterThanOrEqual(wide.min)
  })
})

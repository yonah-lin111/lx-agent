import { clamp } from "../../utils"

// 跳一跳世界几何与规则常量（侧视：平台同高，只比跳跃距离）。
export const HOP_GROUND_Y = 430
export const HOP_PLATFORM_THICKNESS = 34
export const HOP_PLAYER_WIDTH = 30
export const HOP_PLAYER_HEIGHT = 44
export const HOP_MAX_CHARGE_MS = 900
export const HOP_MIN_DISTANCE = 70
export const HOP_MAX_DISTANCE = 330

// 落点判定：平台中心 ±10px 视为完美落点。
export const HOP_PERFECT_TOLERANCE = 10

// 相邻平台之间的最小可见间隙。
export const HOP_MIN_GAP = 24

// 平台：世界坐标 + 宽度（顶面固定在 HOP_GROUND_Y）。
export interface HopPlatform {
  x: number
  width: number
}

export type HopLanding = "perfect" | "landed" | "miss"

/**
 * 蓄力比例（0 到 1）。
 */
export const getHopChargeRatio = (chargeMs: number): number =>
  clamp(chargeMs / HOP_MAX_CHARGE_MS, 0, 1)

/**
 * 蓄力换算跳跃距离（中心位移），线性映射到 [最小, 最大]。
 */
export const getHopJumpDistance = (chargeMs: number): number =>
  HOP_MIN_DISTANCE + getHopChargeRatio(chargeMs) * (HOP_MAX_DISTANCE - HOP_MIN_DISTANCE)

/**
 * 飞行时长与最高点：蓄力越足滞空越久、跳得越高。
 */
export const getHopFlightDurationMs = (chargeMs: number): number =>
  260 + getHopChargeRatio(chargeMs) * 260

export const getHopApexHeight = (chargeMs: number): number => 80 + getHopChargeRatio(chargeMs) * 70

/**
 * 生成下一块平台：以「中心距」而非间隙约束，保证既有可见间隙又在蓄力可达范围内。
 */
export const createHopPlatform = (previous: HopPlatform, random: () => number): HopPlatform => {
  const width = 42 + random() * 68
  const minCenterDistance = (width + previous.width) / 2 + HOP_MIN_GAP
  const maxCenterDistance = HOP_MAX_DISTANCE - 24
  const centerDistance =
    minCenterDistance + random() * Math.max(0, maxCenterDistance - minCenterDistance)
  return { x: previous.x + previous.width / 2 + centerDistance - width / 2, width }
}

/**
 * 落点判定：出界为 miss，命中中心附近为 perfect，其余为 landed。
 */
export const resolveHopLanding = (platform: HopPlatform, centerX: number): HopLanding => {
  if (centerX < platform.x || centerX > platform.x + platform.width) return "miss"
  const center = platform.x + platform.width / 2
  return Math.abs(centerX - center) <= HOP_PERFECT_TOLERANCE ? "perfect" : "landed"
}

/**
 * 落点得分：完美落点 2 分，普通落点 1 分。
 */
export const computeHopLandingPoints = (landing: HopLanding): number => {
  if (landing === "perfect") return 2
  if (landing === "landed") return 1
  return 0
}

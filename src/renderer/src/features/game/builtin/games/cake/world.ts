import { clamp } from "../../utils"

// 叠蛋糕世界常量（一维横向叠放：每层只有 x 与宽度）。
export const CAKE_LAYER_HEIGHT = 46
export const CAKE_BASE_WIDTH = 300
export const CAKE_PERFECT_TOLERANCE = 4
export const CAKE_MIN_SLIDE_SPEED = 190
export const CAKE_MAX_SLIDE_SPEED = 560

// 蛋糕层：世界坐标下的左边界与宽度。
export interface CakeLayer {
  x: number
  width: number
}

export type CakeLanding = "perfect" | "trimmed" | "miss"

// 一次落层的结果：新层（完美对齐会吸附到下层并保持宽度）、被切掉的部分。
export interface CakeDropResult {
  landing: CakeLanding
  layer: CakeLayer
  sliced: CakeLayer | null
}

/**
 * 横向滑动速度：层数越多越快，上限 560px/s。
 */
export const getCakeSlideSpeed = (layerCount: number): number =>
  Math.min(CAKE_MAX_SLIDE_SPEED, CAKE_MIN_SLIDE_SPEED + layerCount * 14)

/**
 * 落层判定：
 * - 完全错开 → miss（本局结束）
 * - 偏差 ≤ 4px → perfect（吸附对齐且宽度不变）
 * - 其余 → trimmed（保留重叠部分，超出部分被切掉）
 */
export const resolveCakeDrop = (below: CakeLayer, incoming: CakeLayer): CakeDropResult => {
  const overlapLeft = Math.max(below.x, incoming.x)
  const overlapRight = Math.min(below.x + below.width, incoming.x + incoming.width)
  const overlapWidth = overlapRight - overlapLeft

  if (overlapWidth <= 0) {
    return { landing: "miss", layer: incoming, sliced: { x: incoming.x, width: incoming.width } }
  }

  if (Math.abs(incoming.x - below.x) <= CAKE_PERFECT_TOLERANCE) {
    return {
      landing: "perfect",
      layer: { x: below.x, width: below.width },
      sliced: null,
    }
  }

  const slicedWidth = incoming.width - overlapWidth
  return {
    landing: "trimmed",
    layer: { x: overlapLeft, width: overlapWidth },
    sliced: {
      x: incoming.x < below.x ? incoming.x : overlapRight,
      width: slicedWidth,
    },
  }
}

/**
 * 落层得分：完美 2 分，普通错位切边 1 分。
 */
export const computeCakeLayerPoints = (landing: CakeLanding): number => {
  if (landing === "perfect") return 2
  if (landing === "trimmed") return 1
  return 0
}

/**
 * 滑动层的中心摆动区间：保证整层始终留在屏幕内。
 */
export const getCakeSlideBounds = (
  width: number,
  screenWidth: number,
  margin: number,
): { min: number; max: number } => {
  const half = width / 2 + margin
  const min = half
  const max = Math.max(min, screenWidth - half)
  return { min, max }
}

/**
 * 按摆动区间把中心坐标钳制住。
 */
export const clampCakeSlideCenter = (center: number, bound: { min: number; max: number }): number =>
  clamp(center, bound.min, bound.max)

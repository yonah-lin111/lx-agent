// Dock 距离计算模式：center 取到项中心距离；edge 取到项边界的距离（项宽窄不一时更稳定）。
export type DockDistanceMode = "center" | "edge"

// 单个 Dock 项沿 Dock 轴的基线几何。
export interface DockMagnifyItem {
  center: number
  size: number
}

// 单个 Dock 项的放大变换结果。
export interface DockMagnifyTransform {
  scale: number
  offset: number
}

// 放大布局计算参数。
export interface DockMagnifyOptions {
  maxScale: number
  influenceRadiusPx: number
  distanceMode?: DockDistanceMode
}

// 距离衰减曲线：(1 - t²)²，t ≥ 1 时归零。
const dockFalloff = (distancePx: number, radiusPx: number): number => {
  if (radiusPx <= 0) return 0
  const ratio = distancePx / radiusPx
  if (ratio >= 1) return 0
  const base = 1 - ratio * ratio
  return base * base
}

// 计算指针到单项的距离。
const resolveDistance = (
  pointer: number,
  item: DockMagnifyItem,
  distanceMode: DockDistanceMode,
): number => {
  const centerDistance = Math.abs(pointer - item.center)
  if (distanceMode === "center") return centerDistance
  return Math.max(0, centerDistance - item.size / 2)
}

// 在 [min, max] 区间内夹取。
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

/**
 * 计算 Dock 放大布局：光标所在点原位锚定，邻居按各自额外尺寸向外推开且保持原始间距。
 */
export const computeDockMagnifyLayout = (
  pointer: number,
  items: readonly DockMagnifyItem[],
  options: DockMagnifyOptions,
): DockMagnifyTransform[] => {
  const { maxScale, influenceRadiusPx, distanceMode = "center" } = options
  if (items.length === 0) return []

  const scales = items.map(
    (item) =>
      1 +
      (maxScale - 1) * dockFalloff(resolveDistance(pointer, item, distanceMode), influenceRadiusPx),
  )
  const sizes = items.map((item, index) => item.size * scales[index])
  const gaps = items.map((item, index) => {
    if (index === 0) return 0
    const previous = items[index - 1]
    return item.center - item.size / 2 - (previous.center + previous.size / 2)
  })

  // 按放大后的尺寸顺序重排，保持各项之间的原始间距。
  const starts: number[] = []
  items.forEach((item, index) => {
    if (index === 0) {
      starts.push(item.center - item.size / 2)
      return
    }
    starts.push(starts[index - 1] + sizes[index - 1] + gaps[index])
  })

  // 指针超出 Dock 两端时收敛到条边缘，避免整条被拖走。
  const firstItem = items[0]
  const lastItem = items[items.length - 1]
  const stripStart = firstItem.center - firstItem.size / 2
  const stripEnd = lastItem.center + lastItem.size / 2
  const reference = clamp(pointer, stripStart, stripEnd)

  // 锚定项：包含参考点的项，否则取最近项。
  let anchorIndex = 0
  let anchorDistance = Number.POSITIVE_INFINITY
  items.forEach((item, index) => {
    const start = item.center - item.size / 2
    const end = item.center + item.size / 2
    const distance = reference < start ? start - reference : reference > end ? reference - end : 0
    if (distance < anchorDistance) {
      anchorDistance = distance
      anchorIndex = index
    }
  })

  const anchorItem = items[anchorIndex]
  const anchorRatio =
    anchorItem.size > 0
      ? clamp((reference - (anchorItem.center - anchorItem.size / 2)) / anchorItem.size, 0, 1)
      : 0
  const anchorNewPosition = starts[anchorIndex] + anchorRatio * sizes[anchorIndex]
  const shift = reference - anchorNewPosition

  return items.map((item, index) => ({
    scale: scales[index],
    offset: starts[index] + sizes[index] / 2 + shift - item.center,
  }))
}

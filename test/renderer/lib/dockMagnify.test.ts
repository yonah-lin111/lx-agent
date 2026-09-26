import { describe, expect, it } from "vitest"
import { computeDockMagnifyLayout, type DockMagnifyItem } from "@/lib/dockMagnify"

// 统一测试参数：放大上限 1.5，影响半径 56px。
const MAX_SCALE = 1.5
const RADIUS_PX = 56
const CENTER_OPTIONS = { maxScale: MAX_SCALE, influenceRadiusPx: RADIUS_PX }
const EDGE_OPTIONS = { ...CENTER_OPTIONS, distanceMode: "edge" as const }

// 6 个 24px 宽、间距 4px 的项，首项中心位于 30px。
const BASE_ITEMS: DockMagnifyItem[] = Array.from({ length: 6 }, (_, index) => ({
  center: 30 + index * 28,
  size: 24,
}))

describe("computeDockMagnifyLayout", () => {
  it("空列表返回空布局", () => {
    expect(computeDockMagnifyLayout(0, [], CENTER_OPTIONS)).toEqual([])
  })

  it("指针位于项中心时达到放大上限，超出影响半径的项保持原尺寸", () => {
    const layout = computeDockMagnifyLayout(30, BASE_ITEMS, CENTER_OPTIONS)

    expect(layout[0].scale).toBeCloseTo(MAX_SCALE, 5)
    // d=28px 时 t=0.5，(1 - t²)² = 0.5625，scale = 1 + 0.5 * 0.5625
    expect(layout[1].scale).toBeCloseTo(1.28125, 5)
    // d=56px 时衰减归零
    expect(layout[2].scale).toBe(1)
    expect(layout[5].scale).toBe(1)
  })

  it("距离越远放大越小", () => {
    const layout = computeDockMagnifyLayout(58, BASE_ITEMS, CENTER_OPTIONS)

    expect(layout[1].scale).toBeCloseTo(MAX_SCALE, 5)
    expect(layout[1].scale).toBeGreaterThan(layout[2].scale)
    expect(layout[2].scale).toBeGreaterThan(layout[3].scale)
    expect(layout[3].scale).toBe(1)
  })

  it("指针下项原位锚定，邻居向外推开且保持原始间距", () => {
    const layout = computeDockMagnifyLayout(30, BASE_ITEMS, CENTER_OPTIONS)

    expect(layout[0].offset).toBeCloseTo(0, 5)
    for (let index = 1; index < layout.length; index += 1) {
      expect(layout[index].offset).toBeGreaterThan(0)
    }

    for (let index = 1; index < BASE_ITEMS.length; index += 1) {
      const previousEnd =
        BASE_ITEMS[index - 1].center +
        layout[index - 1].offset +
        (BASE_ITEMS[index - 1].size * layout[index - 1].scale) / 2
      const currentStart =
        BASE_ITEMS[index].center +
        layout[index].offset -
        (BASE_ITEMS[index].size * layout[index].scale) / 2
      expect(currentStart - previousEnd).toBeCloseTo(4, 5)
    }
  })

  it("指针位于项内部非中心位置时锚定该点", () => {
    const pointer = 24
    const layout = computeDockMagnifyLayout(pointer, BASE_ITEMS, CENTER_OPTIONS)
    const ratio = (pointer - (BASE_ITEMS[0].center - BASE_ITEMS[0].size / 2)) / BASE_ITEMS[0].size
    const anchor =
      BASE_ITEMS[0].center + layout[0].offset + (ratio - 0.5) * BASE_ITEMS[0].size * layout[0].scale

    expect(anchor).toBeCloseTo(pointer, 5)
  })

  it("指针远离 Dock 时输出恒等变换", () => {
    const layout = computeDockMagnifyLayout(230, BASE_ITEMS, CENTER_OPTIONS)

    for (const item of layout) {
      expect(item.scale).toBe(1)
      expect(item.offset).toBeCloseTo(0, 5)
    }
  })

  it("指针越过末端时整条末端边缘保持原位", () => {
    const pointer = 190
    const layout = computeDockMagnifyLayout(pointer, BASE_ITEMS, CENTER_OPTIONS)
    const lastIndex = BASE_ITEMS.length - 1
    const lastEnd =
      BASE_ITEMS[lastIndex].center +
      layout[lastIndex].offset +
      (BASE_ITEMS[lastIndex].size * layout[lastIndex].scale) / 2

    expect(lastEnd).toBeCloseTo(182, 5)
    expect(layout[lastIndex].scale).toBeGreaterThan(1)
  })

  it("单项列表仍按锚点放大", () => {
    const layout = computeDockMagnifyLayout(12, [{ center: 12, size: 24 }], CENTER_OPTIONS)

    expect(layout[0].scale).toBeCloseTo(MAX_SCALE, 5)
    expect(layout[0].offset).toBeCloseTo(0, 5)
  })

  it("edge 模式：指针在宽项内部任意位置都达到放大上限", () => {
    const wideItem: DockMagnifyItem[] = [{ center: 100, size: 120 }]

    // 宽项右边缘处：center 模式距离 60px 超出半径而失效，edge 模式仍为最大放大。
    expect(computeDockMagnifyLayout(160, wideItem, CENTER_OPTIONS)[0].scale).toBe(1)
    expect(computeDockMagnifyLayout(160, wideItem, EDGE_OPTIONS)[0].scale).toBeCloseTo(MAX_SCALE, 5)
  })

  it("edge 模式：距离按到项边界的距离衰减", () => {
    const wideItem: DockMagnifyItem[] = [{ center: 100, size: 120 }]

    // 边界外 10px：t = 10/56，(1 - t²)² ≈ 0.9372，scale ≈ 1.4686。
    expect(computeDockMagnifyLayout(170, wideItem, EDGE_OPTIONS)[0].scale).toBeCloseTo(1.4686, 4)
    // 边界外 56px 及以上归零。
    expect(computeDockMagnifyLayout(216, wideItem, EDGE_OPTIONS)[0].scale).toBe(1)
  })

  it("edge 模式下邻居比 center 模式更早进入放大区", () => {
    const centerLayout = computeDockMagnifyLayout(30, BASE_ITEMS, CENTER_OPTIONS)
    const edgeLayout = computeDockMagnifyLayout(30, BASE_ITEMS, EDGE_OPTIONS)

    expect(edgeLayout[1].scale).toBeGreaterThan(centerLayout[1].scale)
    expect(edgeLayout[1].scale).toBeCloseTo(1.4217, 4)
  })
})

import { describe, expect, it } from "vitest"
import {
  CELL_HEIGHT_TILES,
  CELL_WIDTH_TILES,
  computeOfficeLayout,
  MAX_DESK_COLUMNS,
  WALL_TILES,
} from "@/features/openclaw"

describe("computeOfficeLayout", () => {
  it("无员工时仍返回最小可用房间（1 列 1 行）", () => {
    const layout = computeOfficeLayout(0)

    expect(layout.desks).toHaveLength(0)
    expect(layout.columns).toBe(1)
    expect(layout.rows).toBe(1)
    expect(layout.widthTiles).toBe(WALL_TILES * 2 + CELL_WIDTH_TILES)
  })

  it("工位数量随员工数增减", () => {
    expect(computeOfficeLayout(3).desks).toHaveLength(3)
    expect(computeOfficeLayout(7).desks).toHaveLength(7)
  })

  it("列数不超过上限，行数按需增长", () => {
    const layout = computeOfficeLayout(20)

    expect(layout.columns).toBeLessThanOrEqual(MAX_DESK_COLUMNS)
    expect(layout.rows).toBe(Math.ceil(20 / layout.columns))
    expect(layout.heightTiles).toBe(WALL_TILES * 2 + layout.rows * CELL_HEIGHT_TILES + 1)
  })

  it("工位按行列顺序排布且不重叠", () => {
    const layout = computeOfficeLayout(5)
    const cells = layout.desks.map((desk) => `${desk.cell.x},${desk.cell.y}`)

    expect(new Set(cells).size).toBe(5)
    expect(layout.desks[0]?.cell).toEqual({ x: WALL_TILES, y: WALL_TILES })
    expect(layout.desks[1]?.cell.x).toBe(WALL_TILES + CELL_WIDTH_TILES)
  })

  it("入口位于房间底部中央", () => {
    const layout = computeOfficeLayout(4)

    expect(layout.entrance.y).toBe(layout.heightTiles - 1)
    expect(layout.entrance.x).toBe(Math.floor(layout.widthTiles / 2))
  })

  it("工位显示器与座位位于各自格子内", () => {
    const layout = computeOfficeLayout(2)
    const desk = layout.desks[0]

    expect(desk).toBeDefined()
    if (!desk) return
    expect(desk.monitor.x).toBe(desk.cell.x + 2)
    expect(desk.monitor.y).toBe(desk.cell.y)
    expect(desk.seat).toEqual({ x: desk.cell.x + 1, y: desk.cell.y + 1 })
  })
})

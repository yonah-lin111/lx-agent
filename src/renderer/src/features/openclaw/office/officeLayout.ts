// 程序化办公室布局：由员工数量推导房间尺寸与工位网格（纯函数，便于单测）。

// 单格瓦片逻辑尺寸（像素）。
export const TILE_SIZE = 16
// 墙厚（瓦片数）。
export const WALL_TILES = 1
// 每个工位单元格占用的瓦片数。
export const CELL_WIDTH_TILES = 4
export const CELL_HEIGHT_TILES = 3
// 工位网格最大列数。
export const MAX_DESK_COLUMNS = 4

export interface OfficeTilePoint {
  x: number
  y: number
}

export interface OfficeDesk {
  // 员工在员工列表中的序号。
  index: number
  // 座位（员工站立/就座位置）。
  seat: OfficeTilePoint
  // 桌面上的显示器位置。
  monitor: OfficeTilePoint
  // 所属格子左上角。
  cell: OfficeTilePoint
}

export interface OfficeLayout {
  tileSize: number
  columns: number
  rows: number
  widthTiles: number
  heightTiles: number
  // 入口位置（新员工登场点 / 门）。
  entrance: OfficeTilePoint
  desks: OfficeDesk[]
}

/**
 * 根据员工数量计算办公室布局：工位数量随员工数动态增减，最多 4 列。
 */
export const computeOfficeLayout = (agentCount: number): OfficeLayout => {
  const count = Math.max(0, Math.floor(agentCount))
  const columns = Math.min(MAX_DESK_COLUMNS, Math.max(1, Math.ceil(Math.sqrt(count || 1))))
  const rows = Math.max(1, Math.ceil((count || 1) / columns))

  const widthTiles = WALL_TILES * 2 + columns * CELL_WIDTH_TILES
  // 底部额外留出一行作为通行/入口区域。
  const heightTiles = WALL_TILES * 2 + rows * CELL_HEIGHT_TILES + 1

  const desks: OfficeDesk[] = []
  for (let index = 0; index < count; index += 1) {
    const column = index % columns
    const row = Math.floor(index / columns)
    const cell: OfficeTilePoint = {
      x: WALL_TILES + column * CELL_WIDTH_TILES,
      y: WALL_TILES + row * CELL_HEIGHT_TILES,
    }
    desks.push({
      index,
      cell,
      // 座位位于格子左侧内缩一格。
      seat: { x: cell.x + 1, y: cell.y + 1 },
      // 显示器位于格子上方居中。
      monitor: { x: cell.x + 2, y: cell.y },
    })
  }

  return {
    tileSize: TILE_SIZE,
    columns,
    rows,
    widthTiles,
    heightTiles,
    entrance: { x: Math.floor(widthTiles / 2), y: heightTiles - 1 },
    desks,
  }
}

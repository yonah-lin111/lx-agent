// 一笔画关卡：size × size 网格 + 一条可解性见证路径（单元格索引按行优先编号）。
export interface OneStrokeLevel {
  size: number
  // 蛇形覆盖路径：证明该网格必然可解（玩家只需覆盖全部格子的任意一条路径）。
  solution: number[]
}

/**
 * 判断两个单元格是否正交相邻（一笔画只允许上下左右移动）。
 */
export const isOrthogonallyAdjacent = (from: number, to: number, size: number): boolean => {
  const fromRow = Math.floor(from / size)
  const fromCol = from % size
  const toRow = Math.floor(to / size)
  const toCol = to % size
  return Math.abs(fromRow - toRow) + Math.abs(fromCol - toCol) === 1
}

// 蛇形覆盖路径：以行为单位来回扫过整张网格，任意网格尺寸都存在。
const buildSnakePath = (size: number): number[] => {
  const path: number[] = []
  for (let row = 0; row < size; row += 1) {
    for (let step = 0; step < size; step += 1) {
      const col = row % 2 === 0 ? step : size - 1 - step
      path.push(row * size + col)
    }
  }
  return path
}

/**
 * 生成一笔画关卡：网格必然可解，solution 为一条现成的哈密顿路径。
 */
export const generateOneStrokeLevel = (size: number): OneStrokeLevel => ({
  size,
  solution: buildSnakePath(size),
})

import { getTetrominoOffsets, TETROMINO_KINDS, type TetrominoKind } from "./pieces"

// 盘面尺寸与几何。
export const TETRIS_COLUMNS = 10
export const TETRIS_ROWS = 20

// 0 表示空，非 0 为已锁定方块（存方块种类序号 + 1，用于着色）。
export type TetrisBoard = number[][]

// 活动方块：种类 + 旋转态 + 包围盒左上角在盘面上的坐标。
export interface TetrisPiece {
  kind: TetrominoKind
  rotation: number
  x: number
  y: number
}

// 消行得分表（按本次消除行数取，再乘等级）。
export const TETRIS_LINE_SCORES = [0, 40, 100, 300, 1200]

// 软降/硬降每格额外得分。
export const TETRIS_SOFT_DROP_POINTS = 1
export const TETRIS_HARD_DROP_POINTS = 2

/**
 * 创建空盘面。
 */
export const createTetrisBoard = (): TetrisBoard =>
  Array.from({ length: TETRIS_ROWS }, () => new Array<number>(TETRIS_COLUMNS).fill(0))

/**
 * 方块在当前旋转态与位置下占据的盘面格子（列, 行）。
 */
export const getTetrisPieceCells = (piece: TetrisPiece): Array<[number, number]> =>
  getTetrominoOffsets(piece.kind, piece.rotation).map(
    ([column, row]) => [piece.x + column, piece.y + row] as [number, number],
  )

/**
 * 方块能否放在该位置（边界内且不与已锁定格重叠）。
 */
export const canPlaceTetrisPiece = (board: TetrisBoard, piece: TetrisPiece): boolean =>
  getTetrisPieceCells(piece).every(([column, row]) => {
    if (column < 0 || column >= TETRIS_COLUMNS) return false
    if (row < 0 || row >= TETRIS_ROWS) return false
    return board[row][column] === 0
  })

/**
 * 将方块锁定到盘面，返回新盘面。
 */
export const mergeTetrisPiece = (board: TetrisBoard, piece: TetrisPiece): TetrisBoard => {
  const kindIndex = TETROMINO_KINDS.indexOf(piece.kind) + 1
  const next = board.map((row) => [...row])
  for (const [column, row] of getTetrisPieceCells(piece)) {
    if (row < 0 || row >= TETRIS_ROWS || column < 0 || column >= TETRIS_COLUMNS) continue
    next[row][column] = kindIndex
  }
  return next
}

/**
 * 找出已满的行号（升序）。
 */
export const findFullTetrisRows = (board: TetrisBoard): number[] => {
  const rows: number[] = []
  board.forEach((row, index) => {
    if (row.every((cell) => cell !== 0)) rows.push(index)
  })
  return rows
}

/**
 * 消除指定行并让上方内容下落，返回新盘面。
 */
export const clearTetrisRows = (board: TetrisBoard, rows: number[]): TetrisBoard => {
  const remaining = board.filter((_, index) => !rows.includes(index))
  const empty = Array.from({ length: rows.length }, () => new Array<number>(TETRIS_COLUMNS).fill(0))
  return [...empty, ...remaining]
}

/**
 * 消行得分：得分表 × 等级。
 */
export const computeTetrisLineScore = (cleared: number, level: number): number =>
  (TETRIS_LINE_SCORES[cleared] ?? 0) * level

/**
 * 等级（每 10 行 +1，从 1 开始）。
 */
export const getTetrisLevel = (totalLines: number): number => Math.floor(totalLines / 10) + 1

/**
 * 重力下落间隔：等级越高越快，下限 90ms。
 */
export const getTetrisDropInterval = (level: number): number => Math.max(90, 800 - (level - 1) * 70)

/**
 * 方块落到底部后的位置（用于幽灵投影与硬降）。
 */
export const getTetrisDropY = (board: TetrisBoard, piece: TetrisPiece): number => {
  let y = piece.y
  while (canPlaceTetrisPiece(board, { ...piece, y: y + 1 })) y += 1
  return y
}

/**
 * 生成一袋 7 种方块（Fisher-Yates 洗牌），保证出块均匀。
 */
export const createTetrisBag = (random: () => number): TetrominoKind[] => {
  const bag = [...TETROMINO_KINDS]
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = bag[index]
    bag[index] = bag[swapIndex]
    bag[swapIndex] = current
  }
  return bag
}

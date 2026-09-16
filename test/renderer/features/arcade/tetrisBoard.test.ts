import { describe, expect, it } from "vitest"
import {
  canPlaceTetrisPiece,
  clearTetrisRows,
  computeTetrisLineScore,
  createTetrisBag,
  createTetrisBoard,
  findFullTetrisRows,
  getTetrisDropInterval,
  getTetrisDropY,
  getTetrisLevel,
  mergeTetrisPiece,
  TETRIS_COLUMNS,
  TETRIS_ROWS,
  type TetrisBoard,
  type TetrisPiece,
} from "@/features/arcade/games/tetris/board"
import {
  getTetrominoOffsets,
  rotateClockwise,
  TETROMINO_KINDS,
  TETROMINO_ROTATIONS,
} from "@/features/arcade/games/tetris/pieces"
import { createSeededRandom } from "@/features/arcade/utils"

describe("俄罗斯方块盘面规则", () => {
  it("7-bag：每袋含全部 7 种方块且不重复", () => {
    const random = createSeededRandom(11)
    for (let bag = 0; bag < 5; bag += 1) {
      const kinds = createTetrisBag(random)
      expect(kinds).toHaveLength(7)
      expect(new Set(kinds).size).toBe(7)
      expect([...kinds].sort()).toEqual([...TETROMINO_KINDS].sort())
    }
  })

  it("每种方块 4 个旋转态都保持 4 格，且旋转 4 次回到基准", () => {
    for (const kind of TETROMINO_KINDS) {
      for (let rotation = 0; rotation < 4; rotation += 1) {
        expect(getTetrominoOffsets(kind, rotation)).toHaveLength(4)
      }
      let matrix = TETROMINO_ROTATIONS[kind][0]
      for (let step = 0; step < 4; step += 1) matrix = rotateClockwise(matrix)
      expect(matrix).toEqual(TETROMINO_ROTATIONS[kind][0])
    }
  })

  it("放置校验：越界与重叠都不可放置", () => {
    const board = createTetrisBoard()
    const piece: TetrisPiece = { kind: "T", rotation: 0, x: 0, y: 0 }
    expect(canPlaceTetrisPiece(board, piece)).toBe(true)
    expect(canPlaceTetrisPiece(board, { ...piece, x: -1 })).toBe(false)
    expect(canPlaceTetrisPiece(board, { ...piece, x: TETRIS_COLUMNS - 1 })).toBe(false)
    expect(canPlaceTetrisPiece(board, { ...piece, y: TETRIS_ROWS })).toBe(false)

    const occupied: TetrisBoard = createTetrisBoard()
    occupied[5][5] = 1
    expect(canPlaceTetrisPiece(occupied, { kind: "O", rotation: 0, x: 4, y: 4 })).toBe(false)
    expect(canPlaceTetrisPiece(occupied, { kind: "O", rotation: 0, x: 6, y: 4 })).toBe(true)
  })

  it("锁定、消行与上方内容下落", () => {
    let board = createTetrisBoard()
    for (let column = 0; column < TETRIS_COLUMNS - 2; column += 1) {
      board[TETRIS_ROWS - 1][column] = 1
    }

    const piece: TetrisPiece = { kind: "O", rotation: 0, x: TETRIS_COLUMNS - 2, y: 0 }
    const dropY = getTetrisDropY(board, piece)
    board = mergeTetrisPiece(board, { ...piece, y: dropY })
    expect(findFullTetrisRows(board)).toEqual([TETRIS_ROWS - 1])

    const cleared = clearTetrisRows(board, [TETRIS_ROWS - 1])
    expect(findFullTetrisRows(cleared)).toEqual([])
    // O 的上半部分随消行下落到新的底行
    expect(cleared[TETRIS_ROWS - 1][TETRIS_COLUMNS - 1]).not.toBe(0)
    expect(cleared[TETRIS_ROWS - 2][TETRIS_COLUMNS - 1]).toBe(0)
  })

  it("计分与等级：得分表随等级放大，每 10 行升级且下落更快", () => {
    expect(computeTetrisLineScore(1, 1)).toBe(40)
    expect(computeTetrisLineScore(2, 1)).toBe(100)
    expect(computeTetrisLineScore(4, 1)).toBe(1200)
    expect(computeTetrisLineScore(4, 3)).toBe(3600)
    expect(computeTetrisLineScore(0, 5)).toBe(0)

    expect(getTetrisLevel(0)).toBe(1)
    expect(getTetrisLevel(9)).toBe(1)
    expect(getTetrisLevel(10)).toBe(2)
    expect(getTetrisDropInterval(1)).toBe(800)
    expect(getTetrisDropInterval(2)).toBeLessThan(getTetrisDropInterval(1))
    expect(getTetrisDropInterval(99)).toBe(90)
  })
})

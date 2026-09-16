import { ARCADE_HEIGHT, ARCADE_WIDTH } from "../../constants"
import type { ArcadeGame, ArcadeInputState, ArcadePalette } from "../../types"
import { createSeededRandom, roundRectPath } from "../../utils"
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
  TETRIS_HARD_DROP_POINTS,
  TETRIS_ROWS,
  TETRIS_SOFT_DROP_POINTS,
  type TetrisBoard,
  type TetrisPiece,
} from "./board"
import {
  getTetrominoOffsets,
  TETROMINO_KINDS,
  TETROMINO_ROTATIONS,
  type TetrominoKind,
} from "./pieces"

// 棋盘几何（棋盘居中偏左，右侧留出分数与预览面板）。
const CELL = 26
const BOARD_LEFT = 264
const BOARD_TOP = 40
const BOARD_PIXEL_WIDTH = TETRIS_COLUMNS * CELL
const BOARD_PIXEL_HEIGHT = TETRIS_ROWS * CELL
const SIDE_LEFT = BOARD_LEFT + BOARD_PIXEL_WIDTH + 44
const PREVIEW_CELL = 22

// 输入手感。
const DAS_DELAY_MS = 170
const DAS_REPEAT_MS = 55
const SOFT_DROP_FACTOR = 12

// 每种方块的配色（两套主题共用，像素主题靠硬边与描边区分）。
const TETROMINO_COLORS: Record<TetrominoKind, string> = {
  I: "#38bdf8",
  O: "#facc15",
  T: "#c084fc",
  S: "#34d399",
  Z: "#fb7185",
  J: "#60a5fa",
  L: "#fb923c",
}

const LINE_CLEAR_FLASH_MS = 220

/**
 * 方块坠落：堆叠、消行、等级加速的经典俄罗斯方块。
 */
export const createTetrisGame = (): ArcadeGame => {
  const random = createSeededRandom(Math.floor(Math.random() * 0x7fffffff))

  let board: TetrisBoard = createTetrisBoard()
  let queue: TetrominoKind[] = []
  let piece: TetrisPiece | null = null
  let score = 0
  let lines = 0
  let finished = false
  let elapsed = 0
  let dropElapsed = 0
  let moveDirection = 0
  let repeatAt = Number.POSITIVE_INFINITY
  let flashRows: number[] = []
  let flashUntil = 0

  const takeNextKind = (): TetrominoKind => {
    while (queue.length < 8) queue.push(...createTetrisBag(random))
    return queue.shift() as TetrominoKind
  }

  const createPiece = (kind: TetrominoKind): TetrisPiece => {
    const width = TETROMINO_ROTATIONS[kind][0][0].length
    return { kind, rotation: 0, x: Math.floor((TETRIS_COLUMNS - width) / 2), y: 0 }
  }

  const spawnPiece = (): void => {
    piece = createPiece(takeNextKind())
    dropElapsed = 0
    if (!canPlaceTetrisPiece(board, piece)) {
      piece = null
      finished = true
    }
  }

  const lockPiece = (): void => {
    if (!piece) return
    board = mergeTetrisPiece(board, piece)
    const fullRows = findFullTetrisRows(board)
    if (fullRows.length > 0) {
      const level = getTetrisLevel(lines)
      board = clearTetrisRows(board, fullRows)
      lines += fullRows.length
      score += computeTetrisLineScore(fullRows.length, level)
      flashRows = fullRows
      flashUntil = elapsed + LINE_CLEAR_FLASH_MS
    }
    piece = null
    spawnPiece()
  }

  const stepDown = (softDrop: boolean): void => {
    if (!piece) return
    const moved = { ...piece, y: piece.y + 1 }
    if (canPlaceTetrisPiece(board, moved)) {
      piece = moved
      if (softDrop) score += TETRIS_SOFT_DROP_POINTS
      return
    }
    lockPiece()
  }

  const tryMove = (dx: number): boolean => {
    if (!piece) return false
    const moved = { ...piece, x: piece.x + dx }
    if (!canPlaceTetrisPiece(board, moved)) return false
    piece = moved
    return true
  }

  const tryRotate = (): void => {
    if (!piece) return
    const rotation = piece.rotation + 1
    // 简化踢墙：原地 → 左右一格 → 上抬 → 左右两格。
    const kicks: Array<[number, number]> = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [-2, 0],
      [2, 0],
    ]
    for (const [dx, dy] of kicks) {
      const candidate = { ...piece, rotation, x: piece.x + dx, y: piece.y + dy }
      if (canPlaceTetrisPiece(board, candidate)) {
        piece = candidate
        return
      }
    }
  }

  const hardDrop = (): void => {
    if (!piece) return
    const targetY = getTetrisDropY(board, piece)
    score += (targetY - piece.y) * TETRIS_HARD_DROP_POINTS
    piece = { ...piece, y: targetY }
    lockPiece()
  }

  const drawBlock = (
    ctx: CanvasRenderingContext2D,
    palette: ArcadePalette,
    left: number,
    top: number,
    size: number,
    color: string,
    alpha: number,
  ): void => {
    if (alpha <= 0) return
    ctx.globalAlpha = alpha
    if (palette.pixel) {
      ctx.fillStyle = color
      ctx.fillRect(left + 1, top + 1, size - 2, size - 2)
      ctx.strokeStyle = "#000000"
      ctx.lineWidth = 2
      ctx.strokeRect(left + 1, top + 1, size - 2, size - 2)
    } else {
      roundRectPath(ctx, left + 1, top + 1, size - 2, size - 2, palette.radius)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = "rgba(255, 255, 255, 0.32)"
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  const drawPlayfield = (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
    ctx.fillStyle = palette.pixel ? "#101018" : "rgba(255, 255, 255, 0.03)"
    ctx.fillRect(BOARD_LEFT, BOARD_TOP, BOARD_PIXEL_WIDTH, BOARD_PIXEL_HEIGHT)

    ctx.strokeStyle = palette.grid
    ctx.lineWidth = 1
    for (let column = 1; column < TETRIS_COLUMNS; column += 1) {
      const x = BOARD_LEFT + column * CELL
      ctx.beginPath()
      ctx.moveTo(x, BOARD_TOP)
      ctx.lineTo(x, BOARD_TOP + BOARD_PIXEL_HEIGHT)
      ctx.stroke()
    }
    for (let row = 1; row < TETRIS_ROWS; row += 1) {
      const y = BOARD_TOP + row * CELL
      ctx.beginPath()
      ctx.moveTo(BOARD_LEFT, y)
      ctx.lineTo(BOARD_LEFT + BOARD_PIXEL_WIDTH, y)
      ctx.stroke()
    }

    ctx.strokeStyle = palette.border
    ctx.lineWidth = 2
    ctx.strokeRect(BOARD_LEFT - 1, BOARD_TOP - 1, BOARD_PIXEL_WIDTH + 2, BOARD_PIXEL_HEIGHT + 2)
  }

  const drawNextPreview = (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
    const boxSize = PREVIEW_CELL * 4 + 16
    ctx.strokeStyle = palette.grid
    ctx.lineWidth = 1
    ctx.strokeRect(SIDE_LEFT, 214, boxSize, boxSize)

    const nextKind = queue[0]
    if (!nextKind) return
    const offsets = getTetrominoOffsets(nextKind, 0)
    const columns = offsets.map(([column]) => column)
    const rows = offsets.map(([, row]) => row)
    const minColumn = Math.min(...columns)
    const minRow = Math.min(...rows)
    const pieceWidth = Math.max(...columns) - minColumn + 1
    const pieceHeight = Math.max(...rows) - minRow + 1
    const originX = SIDE_LEFT + (boxSize - pieceWidth * PREVIEW_CELL) / 2
    const originY = 214 + (boxSize - pieceHeight * PREVIEW_CELL) / 2

    for (const [column, row] of offsets) {
      drawBlock(
        ctx,
        palette,
        originX + (column - minColumn) * PREVIEW_CELL,
        originY + (row - minRow) * PREVIEW_CELL,
        PREVIEW_CELL,
        TETROMINO_COLORS[nextKind],
        1,
      )
    }
  }

  const drawSidePanel = (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
    ctx.textBaseline = "middle"
    ctx.textAlign = "left"

    ctx.fillStyle = palette.textMuted
    ctx.font = `500 13px ${palette.fontFamily}`
    ctx.fillText("SCORE", SIDE_LEFT, 60)

    ctx.fillStyle = palette.text
    ctx.font = `700 30px ${palette.fontFamily}`
    ctx.fillText(String(score), SIDE_LEFT, 92)

    ctx.fillStyle = palette.textMuted
    ctx.font = `500 14px ${palette.fontFamily}`
    ctx.fillText(`Lv ${getTetrisLevel(lines)}`, SIDE_LEFT, 134)
    ctx.fillText(`Lines ${lines}`, SIDE_LEFT, 160)

    drawNextPreview(ctx, palette)
  }

  spawnPiece()

  return {
    update: (dt: number, input: ArcadeInputState): void => {
      if (finished) return
      elapsed += dt

      if (input.pressedKeys.has("ArrowUp") || input.pressedKeys.has("KeyX")) tryRotate()
      if (input.pressedKeys.has("Space")) {
        hardDrop()
        return
      }

      // 水平移动：首次按下立即响应，长按走 DAS 连发。
      const direction =
        (input.keys.has("ArrowLeft") ? -1 : 0) + (input.keys.has("ArrowRight") ? 1 : 0)
      if (direction !== moveDirection) {
        moveDirection = direction
        if (direction !== 0) {
          tryMove(direction)
          repeatAt = elapsed + DAS_DELAY_MS
        } else {
          repeatAt = Number.POSITIVE_INFINITY
        }
      } else if (direction !== 0 && elapsed >= repeatAt) {
        tryMove(direction)
        repeatAt = elapsed + DAS_REPEAT_MS
      }

      const softDrop = input.keys.has("ArrowDown")
      dropElapsed += softDrop ? dt * SOFT_DROP_FACTOR : dt
      const interval = getTetrisDropInterval(getTetrisLevel(lines))
      if (dropElapsed >= interval) {
        dropElapsed = 0
        stepDown(softDrop)
      }
    },

    getScore: (): number => score,

    isFinished: (): boolean => finished,

    render: (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = palette.background
      ctx.fillRect(0, 0, ARCADE_WIDTH, ARCADE_HEIGHT)

      drawPlayfield(ctx, palette)

      // 已锁定方块
      board.forEach((row, rowIndex) => {
        row.forEach((cell, columnIndex) => {
          if (cell === 0) return
          const kind = TETROMINO_KINDS[cell - 1]
          drawBlock(
            ctx,
            palette,
            BOARD_LEFT + columnIndex * CELL,
            BOARD_TOP + rowIndex * CELL,
            CELL,
            TETROMINO_COLORS[kind],
            1,
          )
        })
      })

      // 消行闪光
      if (elapsed < flashUntil) {
        ctx.globalAlpha = ((flashUntil - elapsed) / LINE_CLEAR_FLASH_MS) * 0.7
        ctx.fillStyle = palette.text
        for (const row of flashRows) {
          ctx.fillRect(BOARD_LEFT, BOARD_TOP + row * CELL, BOARD_PIXEL_WIDTH, CELL)
        }
        ctx.globalAlpha = 1
      }

      if (piece) {
        // 幽灵投影
        const ghostY = getTetrisDropY(board, piece)
        if (ghostY !== piece.y) {
          for (const [column, row] of getTetrominoOffsets(piece.kind, piece.rotation)) {
            drawBlock(
              ctx,
              palette,
              BOARD_LEFT + (piece.x + column) * CELL,
              BOARD_TOP + (ghostY + row) * CELL,
              CELL,
              TETROMINO_COLORS[piece.kind],
              0.18,
            )
          }
        }

        // 活动方块
        for (const [column, row] of getTetrominoOffsets(piece.kind, piece.rotation)) {
          drawBlock(
            ctx,
            palette,
            BOARD_LEFT + (piece.x + column) * CELL,
            BOARD_TOP + (piece.y + row) * CELL,
            CELL,
            TETROMINO_COLORS[piece.kind],
            1,
          )
        }
      }

      drawSidePanel(ctx, palette)
    },
  }
}

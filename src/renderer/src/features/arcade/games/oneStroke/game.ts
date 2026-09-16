import { ARCADE_HEIGHT, ARCADE_WIDTH } from "../../constants"
import type { ArcadeGame, ArcadeInputState, ArcadePalette } from "../../types"
import { roundRectPath } from "../../utils"
import { generateOneStrokeLevel, isOrthogonallyAdjacent, type OneStrokeLevel } from "./generator"

// 关卡尺寸阶梯（渐进难度）。
const LEVEL_SIZES = [3, 4, 4, 5, 5, 6, 6, 7]

// 棋盘几何（居中放置）。
const BOARD_SIZE = 430
const BOARD_LEFT = (ARCADE_WIDTH - BOARD_SIZE) / 2
const BOARD_TOP = 132

// 单关得分（格子数 × 10）。
const levelPoints = (size: number): number => size * size * 10

interface CellRect {
  x: number
  y: number
  size: number
}

/**
 * 一笔画：在网格上拖拽出一条不重复、不交叉、覆盖全部格子的路径。
 */
export const createOneStrokeGame = (): ArcadeGame => {
  let levelIndex = 0
  let level: OneStrokeLevel = generateOneStrokeLevel(LEVEL_SIZES[0])
  let path: number[] = []
  let score = 0
  let finished = false
  let clock = 0
  let flashUntil = 0
  let isTracing = false

  const getCellRect = (size: number, index: number): CellRect => {
    const gap = size >= 6 ? 6 : 8
    const cellSize = (BOARD_SIZE - gap * (size + 1)) / size
    const row = Math.floor(index / size)
    const col = index % size
    return {
      x: BOARD_LEFT + gap + col * (cellSize + gap),
      y: BOARD_TOP + gap + row * (cellSize + gap),
      size: cellSize,
    }
  }

  const cellCenter = (index: number): { x: number; y: number } => {
    const rect = getCellRect(level.size, index)
    return { x: rect.x + rect.size / 2, y: rect.y + rect.size / 2 }
  }

  const cellAt = (x: number, y: number): number | null => {
    const { size } = level
    const gap = size >= 6 ? 6 : 8
    const cellSize = (BOARD_SIZE - gap * (size + 1)) / size
    const stride = cellSize + gap
    if (x < BOARD_LEFT || x > BOARD_LEFT + BOARD_SIZE) return null
    if (y < BOARD_TOP || y > BOARD_TOP + BOARD_SIZE) return null

    const col = Math.floor((x - BOARD_LEFT - gap / 2) / stride)
    const row = Math.floor((y - BOARD_TOP - gap / 2) / stride)
    if (row < 0 || row >= size || col < 0 || col >= size) return null

    const center = cellCenter(row * size + col)
    if (Math.abs(center.x - x) > cellSize || Math.abs(center.y - y) > cellSize) return null
    return row * size + col
  }

  const advanceLevel = (): void => {
    score += levelPoints(level.size)
    levelIndex += 1
    if (levelIndex >= LEVEL_SIZES.length) {
      finished = true
      return
    }
    level = generateOneStrokeLevel(LEVEL_SIZES[levelIndex])
    path = []
  }

  const handleCellInput = (x: number, y: number): void => {
    const cell = cellAt(x, y)
    if (cell === null) return

    if (path.length === 0) {
      path = [cell]
      return
    }

    const head = path[path.length - 1]
    if (cell === head) return

    if (path.length > 1 && cell === path[path.length - 2]) {
      path.pop()
      return
    }

    if (path.includes(cell)) return
    if (!isOrthogonallyAdjacent(head, cell, level.size)) return

    path.push(cell)
    if (path.length === level.size * level.size) {
      flashUntil = clock + 700
      advanceLevel()
    }
  }

  const drawBackdrop = (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
    const glow = ctx.createRadialGradient(
      ARCADE_WIDTH / 2,
      BOARD_TOP + BOARD_SIZE / 2,
      60,
      ARCADE_WIDTH / 2,
      BOARD_TOP + BOARD_SIZE / 2,
      BOARD_SIZE,
    )
    glow.addColorStop(0, palette.accentSoft)
    glow.addColorStop(1, "rgba(0, 0, 0, 0)")
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, ARCADE_WIDTH, ARCADE_HEIGHT)

    if (palette.pixel) {
      // Minecraft 主题：暗色棋盘格装饰
      const tile = 40
      for (let row = 0; row * tile < ARCADE_HEIGHT; row += 1) {
        for (let col = 0; col * tile < ARCADE_WIDTH; col += 1) {
          if ((row + col) % 2 === 0) continue
          ctx.fillStyle = "rgba(255, 255, 255, 0.015)"
          ctx.fillRect(col * tile, row * tile, tile, tile)
        }
      }
    } else {
      // 默认主题：斜向细纹理
      ctx.strokeStyle = "rgba(255, 255, 255, 0.025)"
      ctx.lineWidth = 1
      for (let offset = -ARCADE_HEIGHT; offset < ARCADE_WIDTH; offset += 48) {
        ctx.beginPath()
        ctx.moveTo(offset, ARCADE_HEIGHT)
        ctx.lineTo(offset + ARCADE_HEIGHT, 0)
        ctx.stroke()
      }
    }
  }

  const drawHud = (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
    ctx.fillStyle = palette.textMuted
    ctx.font = `500 14px ${palette.fontFamily}`
    ctx.textBaseline = "middle"
    ctx.textAlign = "left"
    ctx.fillText(`LV ${Math.min(levelIndex + 1, LEVEL_SIZES.length)}/${LEVEL_SIZES.length}`, 72, 52)

    ctx.textAlign = "right"
    ctx.fillStyle = palette.text
    ctx.font = `700 18px ${palette.fontFamily}`
    ctx.fillText(String(score), ARCADE_WIDTH - 72, 52)

    ctx.textAlign = "center"
    ctx.fillStyle = palette.textMuted
    ctx.font = `500 13px ${palette.fontFamily}`
    ctx.fillText(`${path.length}/${level.size * level.size}`, ARCADE_WIDTH / 2, 52)
  }

  return {
    update: (dt: number, input: ArcadeInputState): void => {
      clock += dt
      if (input.pressedKeys.has("KeyR")) {
        path = []
      }
    },

    pointerDown: (x: number, y: number): void => {
      isTracing = true
      handleCellInput(x, y)
    },

    pointerMove: (x: number, y: number): void => {
      if (!isTracing) return
      handleCellInput(x, y)
    },

    pointerUp: (): void => {
      isTracing = false
    },

    getScore: (): number => score,

    isFinished: (): boolean => finished,

    render: (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, ARCADE_WIDTH, ARCADE_HEIGHT)
      ctx.fillStyle = palette.background
      ctx.fillRect(0, 0, ARCADE_WIDTH, ARCADE_HEIGHT)

      drawBackdrop(ctx, palette)

      const { size } = level
      const pathSet = new Set(path)
      const head = path.length > 0 ? path[path.length - 1] : null

      // 棋盘格子
      for (let index = 0; index < size * size; index += 1) {
        const rect = getCellRect(size, index)
        const isVisited = pathSet.has(index)
        if (palette.pixel) {
          ctx.fillStyle = isVisited ? palette.accent : palette.surface
          ctx.fillRect(rect.x, rect.y, rect.size, rect.size)
          ctx.strokeStyle = palette.border
          ctx.lineWidth = 2
          ctx.strokeRect(rect.x + 1, rect.y + 1, rect.size - 2, rect.size - 2)
          if (isVisited) {
            ctx.fillStyle = palette.accentSoft
            ctx.fillRect(rect.x + 1, rect.y + 1, rect.size - 2, rect.size - 2)
          }
        } else {
          roundRectPath(ctx, rect.x, rect.y, rect.size, rect.size, palette.radius)
          ctx.fillStyle = isVisited ? palette.accentSoft : palette.surface
          ctx.fill()
          ctx.strokeStyle = isVisited ? palette.accent : palette.border
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // 已走路径连线
      if (path.length > 1) {
        ctx.strokeStyle = palette.accent
        ctx.lineWidth = palette.pixel ? 8 : 7
        ctx.lineJoin = palette.pixel ? "miter" : "round"
        ctx.lineCap = palette.pixel ? "butt" : "round"
        if (palette.glow) {
          ctx.shadowColor = palette.accent
          ctx.shadowBlur = 14
        }
        ctx.beginPath()
        path.forEach((cell, index) => {
          const center = cellCenter(cell)
          if (index === 0) ctx.moveTo(center.x, center.y)
          else ctx.lineTo(center.x, center.y)
        })
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // 路径头部脉冲
      if (head !== null) {
        const center = cellCenter(head)
        const pulse = 1 + Math.sin(clock / 180) * 0.12
        ctx.beginPath()
        ctx.arc(center.x, center.y, getCellRect(size, head).size * 0.2 * pulse, 0, Math.PI * 2)
        ctx.fillStyle = palette.background
        ctx.fill()
        ctx.strokeStyle = palette.accent
        ctx.lineWidth = 2
        ctx.stroke()
      }

      drawHud(ctx, palette)

      // 过关闪光
      if (clock < flashUntil) {
        const remain = (flashUntil - clock) / 700
        ctx.fillStyle = palette.accentSoft
        ctx.globalAlpha = remain * 0.9
        ctx.fillRect(0, 0, ARCADE_WIDTH, ARCADE_HEIGHT)
        ctx.globalAlpha = 1
      }
    },
  }
}

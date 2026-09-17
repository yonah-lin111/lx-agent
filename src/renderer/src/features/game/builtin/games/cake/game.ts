import { BUILTIN_HEIGHT, BUILTIN_WIDTH } from "../../constants"
import type { BuiltinGame, BuiltinInputState, BuiltinPalette } from "../../types"
import { createSeededRandom } from "../../utils"
import {
  CAKE_BASE_WIDTH,
  CAKE_LAYER_HEIGHT,
  type CakeLayer,
  computeCakeLayerPoints,
  getCakeSlideBounds,
  getCakeSlideSpeed,
  resolveCakeDrop,
} from "./world"

// 塔顶锚定位置与地面（塔矮时整体下移贴地）。
const TOWER_TOP_Y = 306
const GROUND_Y = 500
const HOVER_GAP = 52
const DROP_MS = 110
const SCREEN_MARGIN = 36

// 切边碎片与完美特效。
const DEBRIS_GRAVITY = 1900
const PERFECT_FLASH_MS = 760

// 蛋糕层配色（按层循环）。
const CAKE_LAYER_COLORS = [
  "#f6d8b0",
  "#f5a6ba",
  "#c9945f",
  "#cfe8a9",
  "#f5c26b",
  "#d9c6f2",
  "#f7b267",
  "#e79a9a",
]

type CakePhase = "sliding" | "dropping"

interface CakeDebris {
  x: number
  width: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}

/**
 * 叠蛋糕：蛋糕层左右摆动，点击落下；与下层错位的部分被切掉，层越叠越窄，落空即结束。
 */
export const createCakeGame = (): BuiltinGame => {
  const random = createSeededRandom(Math.floor(Math.random() * 0x7fffffff))

  const layers: CakeLayer[] = [{ x: (BUILTIN_WIDTH - CAKE_BASE_WIDTH) / 2, width: CAKE_BASE_WIDTH }]
  let phase: CakePhase = "sliding"
  let slideCenter = 0
  let slideDirection = 1
  let slideWidth = CAKE_BASE_WIDTH
  let dropProgress = 0
  let pendingDrop: CakeLayer | null = null
  let cameraOffset = 0
  let score = 0
  let perfectCount = 0
  let perfectFlashAt = Number.NEGATIVE_INFINITY
  let perfectFlashCenter = 0
  let elapsed = 0
  let finished = false
  const debris: CakeDebris[] = []

  const layerColor = (index: number): string => CAKE_LAYER_COLORS[index % CAKE_LAYER_COLORS.length]

  // 塔矮时整体下移贴地；落层后 cameraOffset 由 -层高 缓动回 0，形成平滑上摇镜头。
  const towerShift = (): number => {
    const baseTop = TOWER_TOP_Y + (layers.length - 1) * CAKE_LAYER_HEIGHT
    return cameraOffset + Math.max(0, GROUND_Y - baseTop)
  }

  const layerTopY = (index: number): number =>
    TOWER_TOP_Y + (layers.length - 1 - index) * CAKE_LAYER_HEIGHT + towerShift()

  const hoverTopY = (): number => layerTopY(layers.length - 1) - CAKE_LAYER_HEIGHT - HOVER_GAP

  const landingTopY = (): number => layerTopY(layers.length - 1) - CAKE_LAYER_HEIGHT

  const startSliding = (): void => {
    const top = layers[layers.length - 1]
    slideWidth = top.width
    slideDirection = random() < 0.5 ? -1 : 1
    const bounds = getCakeSlideBounds(slideWidth, BUILTIN_WIDTH, SCREEN_MARGIN)
    slideCenter = slideDirection > 0 ? bounds.min : bounds.max
  }

  const spawnDebris = (layer: CakeLayer, topY: number, direction: number): void => {
    if (layer.width <= 0.5) return
    debris.push({
      x: layer.x,
      width: layer.width,
      y: topY,
      vx: direction * 150,
      vy: 40,
      life: 1,
      color: layerColor(layers.length + 3),
    })
  }

  const resolveDrop = (): void => {
    const incoming = pendingDrop
    pendingDrop = null
    if (!incoming) return

    const top = layers[layers.length - 1]
    const result = resolveCakeDrop(top, incoming)
    phase = "sliding"

    if (result.landing === "miss") {
      spawnDebris(incoming, hoverTopY() + HOVER_GAP, slideDirection)
      finished = true
      return
    }

    layers.push(result.layer)
    score += computeCakeLayerPoints(result.landing)
    // 新层已落在旧塔顶位置，先抵消一层的高度差再缓动回 0，视觉上塔匀滑下移。
    cameraOffset -= CAKE_LAYER_HEIGHT
    if (result.sliced) {
      spawnDebris(result.sliced, landingTopY(), result.sliced.x < result.layer.x ? -1 : 1)
    }
    if (result.landing === "perfect") {
      perfectCount += 1
      perfectFlashAt = elapsed
      perfectFlashCenter = result.layer.x + result.layer.width / 2
    }
    startSliding()
  }

  const updateDebris = (dt: number): void => {
    for (let index = debris.length - 1; index >= 0; index -= 1) {
      const piece = debris[index]
      piece.life -= dt / 620
      if (piece.life <= 0) {
        debris.splice(index, 1)
        continue
      }
      piece.vy += (DEBRIS_GRAVITY * dt) / 1000
      piece.x += (piece.vx * dt) / 1000
      piece.y += (piece.vy * dt) / 1000
    }
  }

  const drawLayer = (
    ctx: CanvasRenderingContext2D,
    palette: BuiltinPalette,
    layer: CakeLayer,
    topY: number,
    color: string,
    withFrosting: boolean,
  ): void => {
    if (palette.pixel) {
      ctx.fillStyle = color
      ctx.fillRect(layer.x, topY, layer.width, CAKE_LAYER_HEIGHT)
      ctx.strokeStyle = "#000000"
      ctx.lineWidth = 2
      ctx.strokeRect(layer.x + 1, topY + 1, layer.width - 2, CAKE_LAYER_HEIGHT - 2)
      ctx.fillStyle = "rgba(255, 255, 255, 0.18)"
      ctx.fillRect(layer.x + 3, topY + 3, layer.width - 6, 6)
    } else {
      ctx.fillStyle = color
      ctx.fillRect(layer.x, topY, layer.width, CAKE_LAYER_HEIGHT)
      ctx.fillStyle = "rgba(255, 255, 255, 0.22)"
      ctx.fillRect(layer.x, topY, layer.width, 5)
      ctx.strokeStyle = "rgba(0, 0, 0, 0.28)"
      ctx.lineWidth = 1.5
      ctx.strokeRect(layer.x + 0.5, topY + 0.5, layer.width - 1, CAKE_LAYER_HEIGHT - 1)
    }

    if (!withFrosting) return
    // 顶层奶油花边
    ctx.fillStyle = palette.pixel ? "#ffffff" : "rgba(255, 255, 255, 0.85)"
    const dollopWidth = 12
    const count = Math.max(1, Math.floor(layer.width / dollopWidth))
    for (let index = 0; index < count; index += 1) {
      const x = layer.x + index * (layer.width / count)
      ctx.beginPath()
      ctx.arc(x + layer.width / count / 2, topY + 2, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  startSliding()

  return {
    update: (dt: number, input: BuiltinInputState): void => {
      if (finished) return
      elapsed += dt
      cameraOffset *= Math.exp(-dt / 70)
      updateDebris(dt)

      if (phase === "sliding") {
        const bounds = getCakeSlideBounds(slideWidth, BUILTIN_WIDTH, SCREEN_MARGIN)
        const speed = getCakeSlideSpeed(layers.length)
        slideCenter += (slideDirection * speed * dt) / 1000
        if (slideCenter <= bounds.min) {
          slideCenter = bounds.min
          slideDirection = 1
        } else if (slideCenter >= bounds.max) {
          slideCenter = bounds.max
          slideDirection = -1
        }

        if (input.pressedKeys.has("Space")) {
          phase = "dropping"
          dropProgress = 0
          pendingDrop = { x: slideCenter - slideWidth / 2, width: slideWidth }
        }
        return
      }

      dropProgress = Math.min(1, dropProgress + dt / DROP_MS)
      if (dropProgress >= 1) resolveDrop()
    },

    pointerDown: (): void => {
      if (finished || phase !== "sliding") return
      phase = "dropping"
      dropProgress = 0
      pendingDrop = { x: slideCenter - slideWidth / 2, width: slideWidth }
    },

    getScore: (): number => score,

    isFinished: (): boolean => finished,

    render: (ctx: CanvasRenderingContext2D, palette: BuiltinPalette): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)

      const sky = ctx.createLinearGradient(0, 0, 0, BUILTIN_HEIGHT)
      sky.addColorStop(0, palette.background)
      sky.addColorStop(1, palette.backgroundAlt)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, BUILTIN_WIDTH, BUILTIN_HEIGHT)

      // 地面（塔高到一定程度后会滚出画面）
      const groundTop = layerTopY(0) + CAKE_LAYER_HEIGHT
      if (groundTop < BUILTIN_HEIGHT) {
        ctx.fillStyle = palette.pixel ? "#0c1218" : "#0b1118"
        ctx.fillRect(0, groundTop, BUILTIN_WIDTH, BUILTIN_HEIGHT - groundTop)
      }

      // 由底向上绘制塔身，顶层带奶油花边
      layers.forEach((layer, index) => {
        drawLayer(
          ctx,
          palette,
          layer,
          layerTopY(index),
          layerColor(index),
          index === layers.length - 1,
        )
      })

      // 滑动 / 下落的蛋糕层
      if (pendingDrop) {
        const eased = 1 - (1 - dropProgress) * (1 - dropProgress)
        const topY = hoverTopY() + (landingTopY() - hoverTopY()) * eased
        drawLayer(ctx, palette, pendingDrop, topY, layerColor(layers.length), true)
      } else if (!finished) {
        const incoming: CakeLayer = { x: slideCenter - slideWidth / 2, width: slideWidth }
        drawLayer(ctx, palette, incoming, hoverTopY(), layerColor(layers.length), true)
      }

      // 切边碎片
      debris.forEach((piece) => {
        ctx.globalAlpha = Math.max(0, Math.min(1, piece.life))
        ctx.fillStyle = piece.color
        ctx.fillRect(piece.x, piece.y, piece.width, CAKE_LAYER_HEIGHT)
        ctx.globalAlpha = 1
      })

      // 完美落点特效
      if (elapsed - perfectFlashAt < PERFECT_FLASH_MS) {
        const age = (elapsed - perfectFlashAt) / PERFECT_FLASH_MS
        const topY = layerTopY(layers.length - 1)
        ctx.globalAlpha = 1 - age
        ctx.strokeStyle = palette.star
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(perfectFlashCenter, topY + CAKE_LAYER_HEIGHT / 2, 16 + age * 46, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = palette.star
        ctx.font = `700 16px ${palette.fontFamily}`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText("+2", perfectFlashCenter, topY - 16)
        ctx.globalAlpha = 1
      }

      // 分数与高度
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillStyle = palette.text
      ctx.font = `700 30px ${palette.fontFamily}`
      ctx.fillText(String(score), 72, 56)
      ctx.fillStyle = palette.textMuted
      ctx.font = `500 13px ${palette.fontFamily}`
      ctx.fillText(`${layers.length} · ${perfectCount}`, 72, 88)
    },
  }
}

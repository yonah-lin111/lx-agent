import { ARCADE_HEIGHT, ARCADE_WIDTH } from "../../constants"
import type { ArcadeGame, ArcadeInputState, ArcadePalette } from "../../types"
import { createSeededRandom } from "../../utils"
import {
  computeHopLandingPoints,
  createHopPlatform,
  getHopApexHeight,
  getHopChargeRatio,
  getHopFlightDurationMs,
  getHopJumpDistance,
  HOP_GROUND_Y,
  HOP_MAX_CHARGE_MS,
  HOP_PLATFORM_THICKNESS,
  HOP_PLAYER_HEIGHT,
  HOP_PLAYER_WIDTH,
  type HopLanding,
  type HopPlatform,
  resolveHopLanding,
} from "./world"

// 镜头：把当前平台中心锚定在屏幕固定位置。
const CAMERA_ANCHOR_X = 250
const CAMERA_LERP = 0.18

// 坠落与特效。
const FALL_GRAVITY = 2200
const PERFECT_FLASH_MS = 800

// 视差山丘（确定性轮廓）。
const HILL_LAYERS = [
  { seed: 17, samples: 22, amplitude: 130, parallax: 0.06, baseline: 0.78, color: "#101a24" },
  { seed: 29, samples: 30, amplitude: 92, parallax: 0.14, baseline: 0.86, color: "#16222e" },
]

type HopPhase = "charging" | "flying" | "falling" | "done"

const buildHillProfile = (seed: number, samples: number, amplitude: number): number[] => {
  const random = createSeededRandom(seed)
  const heights: number[] = []
  let current = amplitude * (0.4 + random() * 0.3)
  for (let index = 0; index < samples; index += 1) {
    current += (random() - 0.5) * amplitude * 0.5
    current = Math.min(amplitude, Math.max(amplitude * 0.18, current))
    heights.push(current)
  }
  heights[heights.length - 1] = heights[0]
  return heights
}

/**
 * 跳一跳：按住蓄力、松手起跳，落在下一块平台得分，踩中中心额外加分。
 */
export const createHopGame = (): ArcadeGame => {
  const random = createSeededRandom(Math.floor(Math.random() * 0x7fffffff))
  const hills = HILL_LAYERS.map((layer) =>
    buildHillProfile(layer.seed, layer.samples, layer.amplitude),
  )

  const firstPlatform: HopPlatform = { x: 110, width: 130 }
  const platforms: HopPlatform[] = [firstPlatform, createHopPlatform(firstPlatform, random)]

  let currentIndex = 0
  let phase: HopPhase = "charging"
  let chargeMs = 0
  let pointerHolding = false
  let keyboardWasHolding = false
  let flightMs = 0
  let flightDuration = 0
  let startX = 0
  let jumpDistance = 0
  let apex = 0
  let playerX = firstPlatform.x + firstPlatform.width / 2
  let playerY = HOP_GROUND_Y
  let fallVelocity = 0
  let camera = playerX - CAMERA_ANCHOR_X
  let score = 0
  let elapsed = 0
  let finished = false
  let perfectFlash: { at: number; x: number; y: number } | null = null

  const currentPlatform = (): HopPlatform => platforms[currentIndex]

  const jump = (): void => {
    if (phase !== "charging") return
    phase = "flying"
    flightMs = 0
    flightDuration = getHopFlightDurationMs(chargeMs)
    startX = playerX
    jumpDistance = getHopJumpDistance(chargeMs)
    apex = getHopApexHeight(chargeMs)
    chargeMs = 0
  }

  const land = (): void => {
    const target = platforms[currentIndex + 1]
    const landing: HopLanding = target ? resolveHopLanding(target, playerX) : "miss"

    if (landing === "miss") {
      phase = "falling"
      fallVelocity = 120
      return
    }

    currentIndex += 1
    score += computeHopLandingPoints(landing)
    if (landing === "perfect") {
      perfectFlash = { at: elapsed, x: playerX, y: playerY }
    }
    playerY = HOP_GROUND_Y
    phase = "charging"
    platforms.push(createHopPlatform(platforms[platforms.length - 1], random))
  }

  const drawHills = (
    ctx: CanvasRenderingContext2D,
    palette: ArcadePalette,
    layerIndex: number,
  ): void => {
    const layer = HILL_LAYERS[layerIndex]
    const profile = hills[layerIndex]
    const baseline = ARCADE_HEIGHT * layer.baseline
    const spacing = ARCADE_WIDTH / 8
    const steps = 32

    ctx.beginPath()
    ctx.moveTo(0, ARCADE_HEIGHT)
    for (let step = 0; step <= steps; step += 1) {
      const x = (ARCADE_WIDTH / steps) * step
      const index = Math.floor((x + camera * layer.parallax) / spacing) % profile.length
      const height = profile[(index + profile.length) % profile.length]
      if (palette.pixel) {
        const stepWidth = ARCADE_WIDTH / steps
        ctx.lineTo(x, baseline - height)
        ctx.lineTo(x + stepWidth, baseline - height)
      } else {
        ctx.lineTo(x, baseline - height)
      }
    }
    ctx.lineTo(ARCADE_WIDTH, ARCADE_HEIGHT)
    ctx.closePath()
    ctx.fillStyle = layer.color
    ctx.fill()
  }

  const drawPlatforms = (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
    platforms.forEach((platform, index) => {
      const left = platform.x - camera
      if (left + platform.width < -40 || left > ARCADE_WIDTH + 40) return
      const isCurrent = index === currentIndex
      ctx.fillStyle = palette.pixel ? "#241f33" : "#1b2430"
      ctx.fillRect(left, HOP_GROUND_Y, platform.width, HOP_PLATFORM_THICKNESS)
      ctx.strokeStyle = palette.pixel ? "#000000" : palette.border
      ctx.lineWidth = 2
      ctx.strokeRect(left + 1, HOP_GROUND_Y + 1, platform.width - 2, HOP_PLATFORM_THICKNESS - 2)
      ctx.strokeStyle = isCurrent ? palette.accent : palette.border
      ctx.beginPath()
      ctx.moveTo(left, HOP_GROUND_Y)
      ctx.lineTo(left + platform.width, HOP_GROUND_Y)
      ctx.stroke()
    })
  }

  const drawPlayer = (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
    const screenX = playerX - camera
    const ratio = phase === "charging" ? getHopChargeRatio(chargeMs) : 0
    const squash = 1 - ratio * 0.18
    const bodyHeight = HOP_PLAYER_HEIGHT * squash
    const bodyWidth = HOP_PLAYER_WIDTH * (2 - squash)
    const top = playerY - bodyHeight
    const left = screenX - bodyWidth / 2

    if (phase === "charging") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.32)"
      ctx.beginPath()
      ctx.ellipse(screenX, HOP_GROUND_Y + 6, bodyWidth * 0.55, 5, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    if (palette.pixel) {
      ctx.fillStyle = "#0a0f14"
      ctx.fillRect(left, top, bodyWidth, bodyHeight)
      ctx.strokeStyle = palette.accent
      ctx.lineWidth = 2
      ctx.strokeRect(left + 1, top + 1, bodyWidth - 2, bodyHeight - 2)
    } else {
      ctx.beginPath()
      ctx.moveTo(left + 4, playerY)
      ctx.lineTo(left + 4, top + bodyHeight * 0.42)
      ctx.quadraticCurveTo(
        screenX,
        top - bodyHeight * 0.06,
        left + bodyWidth - 4,
        top + bodyHeight * 0.42,
      )
      ctx.lineTo(left + bodyWidth - 4, playerY)
      ctx.closePath()
      ctx.fillStyle = "#0a0f14"
      ctx.fill()
      ctx.strokeStyle = palette.accent
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // 蓄力条
    if (phase === "charging" && ratio > 0) {
      const barWidth = 56
      const barHeight = 6
      const barX = screenX - barWidth / 2
      const barY = top - 30
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)"
      ctx.fillRect(barX, barY, barWidth, barHeight)
      ctx.fillStyle = ratio >= 0.98 ? palette.star : palette.accent
      ctx.fillRect(barX, barY, barWidth * ratio, barHeight)
    }
  }

  const drawEffects = (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
    if (!perfectFlash) return
    const age = (elapsed - perfectFlash.at) / PERFECT_FLASH_MS
    if (age >= 1) {
      perfectFlash = null
      return
    }
    const x = perfectFlash.x - camera
    const y = perfectFlash.y - HOP_PLAYER_HEIGHT - 12
    ctx.globalAlpha = 1 - age
    ctx.strokeStyle = palette.star
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 12 + age * 36, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = palette.star
    ctx.font = `700 16px ${palette.fontFamily}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("+2", x, y - 30)
    ctx.globalAlpha = 1
  }

  return {
    update: (dt: number, input: ArcadeInputState): void => {
      if (finished) return
      elapsed += dt

      const keyboardHolding = input.keys.has("Space")
      if (phase === "charging") {
        if (keyboardHolding || pointerHolding) {
          chargeMs = Math.min(HOP_MAX_CHARGE_MS, chargeMs + dt)
        } else if (keyboardWasHolding) {
          jump()
        }
      }
      keyboardWasHolding = keyboardHolding

      if (phase === "flying") {
        flightMs += dt
        const progress = Math.min(1, flightMs / flightDuration)
        playerX = startX + jumpDistance * progress
        playerY = HOP_GROUND_Y - Math.sin(Math.PI * progress) * apex
        if (progress >= 1) land()
      }

      if (phase === "falling") {
        fallVelocity += (FALL_GRAVITY * dt) / 1000
        playerY += (fallVelocity * dt) / 1000
        if (playerY > ARCADE_HEIGHT + 100) {
          phase = "done"
          finished = true
        }
      }

      const anchor = currentPlatform()
      const cameraTarget = anchor.x + anchor.width / 2 - CAMERA_ANCHOR_X
      camera += (cameraTarget - camera) * CAMERA_LERP
    },

    pointerDown: (): void => {
      pointerHolding = true
    },

    pointerUp: (): void => {
      pointerHolding = false
      jump()
    },

    getScore: (): number => score,

    isFinished: (): boolean => finished,

    render: (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)

      const sky = ctx.createLinearGradient(0, 0, 0, ARCADE_HEIGHT)
      sky.addColorStop(0, palette.background)
      sky.addColorStop(1, palette.backgroundAlt)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, ARCADE_WIDTH, ARCADE_HEIGHT)

      HILL_LAYERS.forEach((_, index) => drawHills(ctx, palette, index))

      // 地面带
      ctx.fillStyle = palette.pixel ? "#0c1218" : "#0b1118"
      ctx.fillRect(0, HOP_GROUND_Y + HOP_PLATFORM_THICKNESS, ARCADE_WIDTH, ARCADE_HEIGHT)
      ctx.strokeStyle = palette.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, HOP_GROUND_Y + HOP_PLATFORM_THICKNESS)
      ctx.lineTo(ARCADE_WIDTH, HOP_GROUND_Y + HOP_PLATFORM_THICKNESS)
      ctx.stroke()

      drawPlatforms(ctx, palette)
      drawPlayer(ctx, palette)
      drawEffects(ctx, palette)

      // 分数
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillStyle = palette.text
      ctx.font = `700 30px ${palette.fontFamily}`
      ctx.fillText(String(score), 72, 60)
      ctx.fillStyle = palette.textMuted
      ctx.font = `500 13px ${palette.fontFamily}`
      ctx.fillText(`${currentIndex + 1}`, 72, 92)
    },
  }
}

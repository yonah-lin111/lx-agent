import { ARCADE_HEIGHT, ARCADE_WIDTH } from "../../constants"
import type { ArcadeGame, ArcadeInputState, ArcadePalette } from "../../types"
import { clamp, createSeededRandom } from "../../utils"
import {
  computeRunnerScore,
  createRunnerObstacle,
  createRunnerRidge,
  getRunnerSpawnGap,
  getRunnerSpeed,
  hasRunnerCollision,
  RUNNER_GROUND_Y,
  RUNNER_PLAYER_HEIGHT,
  RUNNER_PLAYER_WIDTH,
  RUNNER_PLAYER_X,
  type RunnerObstacle,
  type RunnerPlayerBox,
} from "./world"

// 物理参数。
const GRAVITY = 2600
const HOLD_GRAVITY_RATIO = 0.6
const JUMP_VELOCITY = -920
const COYOTE_MS = 100
const JUMP_BUFFER_MS = 130
const MAX_MULTIPLIER = 3

// 视差山脊配置。
const RIDGE_LAYERS = [
  { seed: 11, samples: 26, amplitude: 150, speed: 0.12, baseline: 0.72 },
  { seed: 23, samples: 34, amplitude: 118, speed: 0.26, baseline: 0.8 },
  { seed: 37, samples: 44, amplitude: 86, speed: 0.46, baseline: 0.88 },
]

interface RunnerOrb {
  x: number
  elevation: number
  collected: boolean
}

interface RunnerParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

/**
 * 剪影跃迁：单键无限跑酷。
 */
export const createRunnerGame = (): ArcadeGame => {
  const random = createSeededRandom(Math.floor(Math.random() * 0x7fffffff))
  const ridges = RIDGE_LAYERS.map((layer) =>
    createRunnerRidge(layer.seed, layer.samples, layer.amplitude),
  )

  let distance = 0
  let multiplier = 1
  let finished = false
  let elapsed = 0
  let playerElevation = 0
  let verticalVelocity = 0
  let lastGroundedAt = 0
  let jumpBufferedAt = -Infinity
  let pendingPointerJump = false
  let hitFlashUntil = 0
  let spawnAtX = ARCADE_WIDTH + 320

  const obstacles: RunnerObstacle[] = []
  const orbs: RunnerOrb[] = []
  const particles: RunnerParticle[] = []

  const playerBox = (): RunnerPlayerBox => ({
    x: RUNNER_PLAYER_X,
    y: RUNNER_GROUND_Y - RUNNER_PLAYER_HEIGHT - playerElevation,
    width: RUNNER_PLAYER_WIDTH,
    height: RUNNER_PLAYER_HEIGHT,
  })

  const spawnWorld = (): void => {
    const speed = getRunnerSpeed(distance)
    while (spawnAtX < distance + ARCADE_WIDTH + 320) {
      obstacles.push(createRunnerObstacle(spawnAtX, random))
      if (random() < 0.55) {
        orbs.push({
          x: spawnAtX + 120 + random() * 160,
          elevation: 40 + random() * 110,
          collected: false,
        })
      }
      spawnAtX += getRunnerSpawnGap(random, speed)
    }
  }

  const burst = (x: number, y: number, count: number): void => {
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2
      const speed = 40 + random() * 150
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 320 + random() * 260,
      })
    }
  }

  const drawRidge = (
    ctx: CanvasRenderingContext2D,
    palette: ArcadePalette,
    ridgeIndex: number,
    color: string,
  ): void => {
    const layer = RIDGE_LAYERS[ridgeIndex]
    const heights = ridges[ridgeIndex]
    const spacing = ARCADE_WIDTH / 6
    const scroll = (distance * layer.speed) % (spacing * heights.length)
    const baselineY = ARCADE_HEIGHT * layer.baseline

    ctx.beginPath()
    ctx.moveTo(0, ARCADE_HEIGHT)
    const steps = Math.ceil(ARCADE_WIDTH / spacing) + 2
    for (let step = 0; step <= steps; step += 1) {
      const worldX = step * spacing
      const sampleIndex = Math.floor((worldX + scroll) / spacing) % heights.length
      const height = heights[sampleIndex]
      const x = step * spacing - (scroll % spacing)
      if (palette.pixel) {
        ctx.lineTo(x, baselineY - height)
        ctx.lineTo(x + spacing, baselineY - height)
      } else {
        const nextIndex = (sampleIndex + 1) % heights.length
        const nextHeight = heights[nextIndex]
        const ratio = ((worldX + scroll) % spacing) / spacing
        const interpolated = height + (nextHeight - height) * ratio
        ctx.lineTo(x, baselineY - interpolated)
      }
    }
    ctx.lineTo(ARCADE_WIDTH, ARCADE_HEIGHT)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }

  return {
    update: (dt: number, input: ArcadeInputState): void => {
      if (finished) return
      elapsed += dt

      const speed = getRunnerSpeed(distance)
      distance += (speed * dt) / 1000

      // 跳跃：缓冲 + 土狼时间 + 长按滞空
      if (input.pressedKeys.has("Space") || pendingPointerJump) {
        jumpBufferedAt = elapsed
        pendingPointerJump = false
      }
      const isGrounded = playerElevation <= 0
      if (isGrounded) lastGroundedAt = elapsed

      const canJump = isGrounded || elapsed - lastGroundedAt <= COYOTE_MS
      if (elapsed - jumpBufferedAt <= JUMP_BUFFER_MS && canJump) {
        verticalVelocity = JUMP_VELOCITY
        jumpBufferedAt = -Infinity
        lastGroundedAt = -Infinity
        burst(RUNNER_PLAYER_X, RUNNER_GROUND_Y, 8)
      }

      const isRising = verticalVelocity < 0
      const gravity = isRising && input.keys.has("Space") ? GRAVITY * HOLD_GRAVITY_RATIO : GRAVITY
      verticalVelocity += (gravity * dt) / 1000
      playerElevation = Math.max(0, playerElevation - (verticalVelocity * dt) / 1000)

      spawnWorld()

      // 玩家与障碍碰撞（只检测屏幕附近）
      const box = playerBox()
      for (const obstacle of obstacles) {
        if (obstacle.x + obstacle.width < box.x) continue
        if (obstacle.x > box.x + box.width + ARCADE_WIDTH) break
        if (hasRunnerCollision(box, obstacle)) {
          finished = true
          hitFlashUntil = elapsed + 320
          burst(RUNNER_PLAYER_X + RUNNER_PLAYER_WIDTH, RUNNER_GROUND_Y - 30, 26)
          return
        }
      }

      // 星光拾取
      for (const orb of orbs) {
        if (orb.collected) continue
        const screenX = orb.x - distance
        if (screenX < -60) continue
        if (screenX > ARCADE_WIDTH + 60) break
        const orbY = RUNNER_GROUND_Y - orb.elevation
        if (
          Math.abs(screenX - (box.x + box.width / 2)) < RUNNER_PLAYER_WIDTH / 2 + 14 &&
          Math.abs(orbY - (box.y + box.height / 2)) < RUNNER_PLAYER_HEIGHT / 2 + 14
        ) {
          orb.collected = true
          multiplier = Math.min(MAX_MULTIPLIER, multiplier + 0.1)
          burst(screenX, orbY, 12)
        }
      }

      // 粒子推进
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index]
        particle.life -= dt
        if (particle.life <= 0) {
          particles.splice(index, 1)
          continue
        }
        particle.x += particle.vx * (dt / 1000)
        particle.y += particle.vy * (dt / 1000)
        particle.vx *= 0.96
        particle.vy *= 0.96
      }
    },

    pointerDown: (): void => {
      pendingPointerJump = true
    },

    getScore: (): number => computeRunnerScore(distance / 10, multiplier),

    isFinished: (): boolean => finished,

    render: (ctx: CanvasRenderingContext2D, palette: ArcadePalette): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)

      // 天幕：随距离由夜转晨
      const shift = clamp(distance / 12000, 0, 1)
      const sky = ctx.createLinearGradient(0, 0, 0, ARCADE_HEIGHT)
      sky.addColorStop(0, palette.background)
      sky.addColorStop(1, shift > 0.5 ? palette.backgroundAlt : palette.surface)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, ARCADE_WIDTH, ARCADE_HEIGHT)

      // 三层视差山脊
      const ridgeColors = palette.pixel
        ? ["#101820", "#15202b", "#1b2838"]
        : ["#0f1620", "#141d29", "#1a2532"]
      ridgeColors.forEach((color, index) => drawRidge(ctx, palette, index, color))

      // 地面
      ctx.fillStyle = palette.pixel ? "#0c1218" : "#0b1118"
      ctx.fillRect(0, RUNNER_GROUND_Y, ARCADE_WIDTH, ARCADE_HEIGHT - RUNNER_GROUND_Y)
      ctx.strokeStyle = palette.accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, RUNNER_GROUND_Y)
      ctx.lineTo(ARCADE_WIDTH, RUNNER_GROUND_Y)
      ctx.stroke()

      // 障碍
      obstacles.forEach((obstacle) => {
        const screenX = obstacle.x - distance
        if (screenX + obstacle.width < -20 || screenX > ARCADE_WIDTH + 20) return
        const bottomY = RUNNER_GROUND_Y - obstacle.elevation
        if (palette.pixel) {
          ctx.fillStyle = "#2b2b3d"
          ctx.fillRect(screenX, bottomY - obstacle.height, obstacle.width, obstacle.height)
          ctx.strokeStyle = palette.border
          ctx.lineWidth = 2
          ctx.strokeRect(
            screenX + 1,
            bottomY - obstacle.height + 1,
            obstacle.width - 2,
            obstacle.height - 2,
          )
          return
        }
        ctx.fillStyle = "#232c3a"
        ctx.beginPath()
        ctx.moveTo(screenX, bottomY)
        ctx.lineTo(screenX + obstacle.width * 0.5, bottomY - obstacle.height)
        ctx.lineTo(screenX + obstacle.width, bottomY)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = palette.border
        ctx.lineWidth = 1.5
        ctx.stroke()
      })

      // 星光
      orbs.forEach((orb) => {
        if (orb.collected) return
        const screenX = orb.x - distance
        if (screenX < -40 || screenX > ARCADE_WIDTH + 40) return
        const orbY = RUNNER_GROUND_Y - orb.elevation
        ctx.fillStyle = palette.star
        if (palette.glow) {
          ctx.shadowColor = palette.star
          ctx.shadowBlur = 14
        }
        const pulse = 6 + Math.sin(elapsed / 180 + orb.x) * 1.5
        ctx.beginPath()
        ctx.arc(screenX, orbY, pulse, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      })

      // 玩家剪影
      const box = playerBox()
      const bodyColor = "#0a0f14"
      if (palette.pixel) {
        ctx.fillStyle = bodyColor
        ctx.fillRect(box.x, box.y, box.width, box.height)
        ctx.fillRect(box.x + 4, box.y - 14, box.width - 8, 14)
        ctx.strokeStyle = palette.accent
        ctx.lineWidth = 2
        ctx.strokeRect(box.x + 1, box.y + 1, box.width - 2, box.height - 2)
      } else {
        ctx.fillStyle = bodyColor
        ctx.beginPath()
        ctx.arc(box.x + box.width / 2, box.y + 10, 11, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(box.x + 4, box.y + box.height)
        ctx.lineTo(box.x + 4, box.y + 22)
        ctx.quadraticCurveTo(box.x + box.width / 2, box.y + 12, box.x + box.width - 4, box.y + 22)
        ctx.lineTo(box.x + box.width - 4, box.y + box.height)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = palette.accent
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // 粒子
      particles.forEach((particle) => {
        ctx.globalAlpha = clamp(particle.life / 400, 0, 1)
        ctx.fillStyle = palette.star
        ctx.fillRect(particle.x - 1.5, particle.y - 1.5, 3, 3)
      })
      ctx.globalAlpha = 1

      // HUD
      ctx.textBaseline = "middle"
      ctx.textAlign = "left"
      ctx.fillStyle = palette.textMuted
      ctx.font = `500 14px ${palette.fontFamily}`
      ctx.fillText(`${Math.floor(distance / 10)} m`, 72, 52)
      ctx.fillText(`×${multiplier.toFixed(1)}`, 72, 76)

      ctx.textAlign = "right"
      ctx.fillStyle = palette.text
      ctx.font = `700 18px ${palette.fontFamily}`
      ctx.fillText(String(computeRunnerScore(distance / 10, multiplier)), ARCADE_WIDTH - 72, 52)

      // 撞击闪红
      if (elapsed < hitFlashUntil) {
        ctx.globalAlpha = clamp((hitFlashUntil - elapsed) / 320, 0, 1) * 0.4
        ctx.fillStyle = palette.danger
        ctx.fillRect(0, 0, ARCADE_WIDTH, ARCADE_HEIGHT)
        ctx.globalAlpha = 1
      }
    },
  }
}

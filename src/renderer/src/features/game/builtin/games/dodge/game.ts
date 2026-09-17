import { BUILTIN_HEIGHT, BUILTIN_WIDTH } from "../../constants"
import type { BuiltinGame, BuiltinInputState, BuiltinPalette } from "../../types"
import { clamp, createSeededRandom } from "../../utils"
import {
  buildDodgeSchedule,
  computeDodgeScore,
  DODGE_DURATION_MS,
  DODGE_MAX_HP,
  type DodgePattern,
} from "./waves"

// 玩家参数。
const PLAYER_RADIUS = 13
const PLAYER_ACCELERATION = 1750
const PLAYER_MAX_SPEED = 330
const DASH_DURATION_MS = 170
const DASH_COOLDOWN_MS = 1100
const INVULNERABLE_MS = 1300

// 子弹参数。
const BULLET_RADIUS = 6
const STARLIGHT_RADIUS = 11
const STARLIGHT_INTERVAL_MS = 3600
const STARLIGHT_LIFETIME_MS = 6500

interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
}

interface Starlight {
  x: number
  y: number
  bornAt: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
}

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
}

/**
 * 星尘闪避：60 秒弹幕生存。
 */
export const createDodgeGame = (): BuiltinGame => {
  const random = createSeededRandom(Math.floor(Math.random() * 0x7fffffff))
  const schedule = buildDodgeSchedule(Math.floor(random() * 0x7fffffff))
  const backgroundStars = Array.from({ length: 110 }, () => ({
    x: random() * BUILTIN_WIDTH,
    y: random() * BUILTIN_HEIGHT,
    radius: 0.6 + random() * 1.6,
    alpha: 0.2 + random() * 0.6,
    phase: random() * Math.PI * 2,
  }))

  const player = {
    x: BUILTIN_WIDTH / 2,
    y: BUILTIN_HEIGHT / 2,
    vx: 0,
    vy: 0,
    facingX: 1,
    facingY: 0,
  }
  let hp = DODGE_MAX_HP
  let elapsed = 0
  let nextSpawnIndex = 0
  let nextStarlightAt = 1800
  let starlightCollected = 0
  let invulnerableUntil = 0
  let dashUntil = 0
  let dashReadyAt = 0
  let hitFlashUntil = 0
  let shakeUntil = 0
  let shakeStrength = 0
  let finished = false

  const bullets: Bullet[] = []
  const starlights: Starlight[] = []
  const particles: Particle[] = []
  const trail: Particle[] = []

  const spawnParticles = (x: number, y: number, count: number): void => {
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2
      const speed = 40 + random() * 160
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 380 + random() * 260,
        maxLife: 640,
      })
    }
  }

  const spawnEventBullets = (
    atMs: number,
    pattern: DodgePattern,
    count: number,
    speed: number,
    seed: number,
  ): void => {
    const eventRandom = createSeededRandom(seed)
    const margin = 26

    if (pattern === "ring") {
      const centerX = margin + eventRandom() * (BUILTIN_WIDTH - margin * 2)
      const centerY = margin + eventRandom() * (BUILTIN_HEIGHT - margin * 2)
      const offset = eventRandom() * Math.PI * 2
      for (let index = 0; index < count; index += 1) {
        const angle = offset + (index / count) * Math.PI * 2
        bullets.push({
          x: centerX,
          y: centerY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
        })
      }
      return
    }

    const edge = Math.floor(eventRandom() * 4)
    const originX =
      edge === 0 ? margin : edge === 1 ? BUILTIN_WIDTH - margin : eventRandom() * BUILTIN_WIDTH
    const originY =
      edge === 2 ? margin : edge === 3 ? BUILTIN_HEIGHT - margin : eventRandom() * BUILTIN_HEIGHT
    const baseAngle = Math.atan2(player.y - originY, player.x - originX)

    const spread = pattern === "spiral" ? 0.22 : 0.12
    const spin = pattern === "spiral" ? Math.sin(atMs / 420) * 0.5 : 0
    for (let index = 0; index < count; index += 1) {
      const angle = baseAngle + spin + (index - (count - 1) / 2) * spread
      bullets.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      })
    }
    spawnParticles(originX, originY, 4)
  }

  const applyDamage = (): void => {
    hp -= 1
    invulnerableUntil = elapsed + INVULNERABLE_MS
    hitFlashUntil = elapsed + 260
    shakeUntil = elapsed + 320
    shakeStrength = 14
    spawnParticles(player.x, player.y, 26)
    if (hp <= 0) {
      hp = 0
      finished = true
    }
  }

  const drawPlayer = (ctx: CanvasRenderingContext2D, palette: BuiltinPalette): void => {
    if (elapsed < invulnerableUntil && Math.floor(elapsed / 90) % 2 === 0) return

    // 拖尾
    trail.forEach((particle) => {
      const alpha = particle.life / particle.maxLife
      ctx.globalAlpha = alpha * 0.35
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, PLAYER_RADIUS * (0.4 + alpha * 0.5), 0, Math.PI * 2)
      ctx.fillStyle = palette.accent
      ctx.fill()
    })
    ctx.globalAlpha = 1

    if (palette.pixel) {
      ctx.fillStyle = palette.accent
      ctx.fillRect(
        player.x - PLAYER_RADIUS,
        player.y - PLAYER_RADIUS,
        PLAYER_RADIUS * 2,
        PLAYER_RADIUS * 2,
      )
      ctx.strokeStyle = palette.border
      ctx.lineWidth = 2
      ctx.strokeRect(
        player.x - PLAYER_RADIUS + 1,
        player.y - PLAYER_RADIUS + 1,
        PLAYER_RADIUS * 2 - 2,
        PLAYER_RADIUS * 2 - 2,
      )
      return
    }

    const gradient = ctx.createRadialGradient(
      player.x,
      player.y,
      2,
      player.x,
      player.y,
      PLAYER_RADIUS * 2.1,
    )
    gradient.addColorStop(0, "#ffffff")
    gradient.addColorStop(0.35, palette.accent)
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)")
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(player.x, player.y, PLAYER_RADIUS * 2.1, 0, Math.PI * 2)
    ctx.fill()
  }

  const drawHearts = (ctx: CanvasRenderingContext2D, palette: BuiltinPalette): void => {
    for (let index = 0; index < DODGE_MAX_HP; index += 1) {
      const filled = index < hp
      const x = 74 + index * 26
      const y = 52
      ctx.fillStyle = filled ? palette.danger : "rgba(255, 255, 255, 0.16)"
      if (palette.pixel) {
        ctx.fillRect(x - 8, y - 6, 6, 6)
        ctx.fillRect(x + 2, y - 6, 6, 6)
        ctx.fillRect(x - 8, y - 2, 16, 6)
        ctx.fillRect(x - 4, y + 4, 8, 4)
      } else {
        ctx.beginPath()
        ctx.arc(x - 4, y - 3, 5, 0, Math.PI * 2)
        ctx.arc(x + 4, y - 3, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(x - 8.6, y - 1)
        ctx.lineTo(x, y + 10)
        ctx.lineTo(x + 8.6, y - 1)
        ctx.closePath()
        ctx.fill()
      }
    }
  }

  return {
    update: (dt: number, input: BuiltinInputState): void => {
      elapsed += dt

      if (elapsed >= DODGE_DURATION_MS) {
        finished = true
        return
      }

      // 移动输入（冲刺期间保持冲刺向量）
      let directionX = 0
      let directionY = 0
      for (const key of input.keys) {
        const direction = MOVE_KEYS[key]
        if (direction) {
          directionX += direction[0]
          directionY += direction[1]
        }
      }
      const length = Math.hypot(directionX, directionY)
      if (length > 0) {
        directionX /= length
        directionY /= length
        player.facingX = directionX
        player.facingY = directionY
      }

      const isDashing = elapsed < dashUntil
      if (!isDashing) {
        player.vx += directionX * PLAYER_ACCELERATION * (dt / 1000)
        player.vy += directionY * PLAYER_ACCELERATION * (dt / 1000)
        const damping = Math.exp(-dt / 130)
        player.vx *= damping
        player.vy *= damping
        const speed = Math.hypot(player.vx, player.vy)
        if (speed > PLAYER_MAX_SPEED) {
          player.vx = (player.vx / speed) * PLAYER_MAX_SPEED
          player.vy = (player.vy / speed) * PLAYER_MAX_SPEED
        }
      }

      if (input.pressedKeys.has("Space") && elapsed >= dashReadyAt) {
        dashUntil = elapsed + DASH_DURATION_MS
        dashReadyAt = elapsed + DASH_COOLDOWN_MS
        const dashSpeed = 980
        player.vx = player.facingX * dashSpeed
        player.vy = player.facingY * dashSpeed
        spawnParticles(player.x, player.y, 12)
      }

      player.x = clamp(
        player.x + player.vx * (dt / 1000),
        PLAYER_RADIUS,
        BUILTIN_WIDTH - PLAYER_RADIUS,
      )
      player.y = clamp(
        player.y + player.vy * (dt / 1000),
        PLAYER_RADIUS,
        BUILTIN_HEIGHT - PLAYER_RADIUS,
      )

      // 拖尾粒子
      trail.unshift({
        x: player.x,
        y: player.y,
        vx: 0,
        vy: 0,
        life: 320,
        maxLife: 320,
      })
      if (trail.length > 14) trail.pop()
      for (const particle of trail) {
        particle.life -= dt
      }
      while (trail.length > 0 && trail[trail.length - 1].life <= 0) trail.pop()

      // 生成弹幕
      while (nextSpawnIndex < schedule.length && schedule[nextSpawnIndex].atMs <= elapsed) {
        const event = schedule[nextSpawnIndex]
        spawnEventBullets(event.atMs, event.pattern, event.count, event.speed, event.seed)
        nextSpawnIndex += 1
      }

      // 子弹推进与碰撞
      const isProtected = elapsed < invulnerableUntil || isDashing
      for (let index = bullets.length - 1; index >= 0; index -= 1) {
        const bullet = bullets[index]
        bullet.x += bullet.vx * (dt / 1000)
        bullet.y += bullet.vy * (dt / 1000)
        if (
          bullet.x < -40 ||
          bullet.x > BUILTIN_WIDTH + 40 ||
          bullet.y < -40 ||
          bullet.y > BUILTIN_HEIGHT + 40
        ) {
          bullets.splice(index, 1)
          continue
        }
        const distance = Math.hypot(bullet.x - player.x, bullet.y - player.y)
        if (distance < PLAYER_RADIUS + BULLET_RADIUS) {
          bullets.splice(index, 1)
          if (!isProtected) {
            applyDamage()
            if (finished) return
          }
        }
      }

      // 星光拾取
      if (elapsed >= nextStarlightAt) {
        nextStarlightAt = elapsed + STARLIGHT_INTERVAL_MS
        starlights.push({
          x: 80 + random() * (BUILTIN_WIDTH - 160),
          y: 80 + random() * (BUILTIN_HEIGHT - 160),
          bornAt: elapsed,
        })
      }
      for (let index = starlights.length - 1; index >= 0; index -= 1) {
        const starlight = starlights[index]
        if (elapsed - starlight.bornAt > STARLIGHT_LIFETIME_MS) {
          starlights.splice(index, 1)
          continue
        }
        if (
          Math.hypot(starlight.x - player.x, starlight.y - player.y) <
          PLAYER_RADIUS + STARLIGHT_RADIUS
        ) {
          starlights.splice(index, 1)
          starlightCollected += 1
          spawnParticles(starlight.x, starlight.y, 14)
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

    getScore: (): number => computeDodgeScore(elapsed, starlightCollected),

    isFinished: (): boolean => finished,

    render: (ctx: CanvasRenderingContext2D, palette: BuiltinPalette): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      if (elapsed < shakeUntil) {
        ctx.translate(
          Math.sin(elapsed * 0.9) * shakeStrength * 0.6,
          Math.cos(elapsed * 1.3) * shakeStrength * 0.6,
        )
      }

      const gradient = ctx.createRadialGradient(
        BUILTIN_WIDTH / 2,
        BUILTIN_HEIGHT / 2,
        80,
        BUILTIN_WIDTH / 2,
        BUILTIN_HEIGHT / 2,
        BUILTIN_WIDTH * 0.7,
      )
      gradient.addColorStop(0, palette.backgroundAlt)
      gradient.addColorStop(1, palette.background)
      ctx.fillStyle = gradient
      ctx.fillRect(-40, -40, BUILTIN_WIDTH + 80, BUILTIN_HEIGHT + 80)

      // 背景星点
      backgroundStars.forEach((star) => {
        ctx.globalAlpha = star.alpha * (0.6 + Math.sin(elapsed / 900 + star.phase) * 0.4)
        ctx.fillStyle = palette.text
        if (palette.pixel) {
          ctx.fillRect(star.x, star.y, 2, 2)
        } else {
          ctx.beginPath()
          ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
          ctx.fill()
        }
      })
      ctx.globalAlpha = 1

      // 星光
      starlights.forEach((starlight) => {
        const rotation = elapsed / 480
        ctx.save()
        ctx.translate(starlight.x, starlight.y)
        ctx.rotate(rotation)
        ctx.fillStyle = palette.star
        if (palette.glow) {
          ctx.shadowColor = palette.star
          ctx.shadowBlur = 16
        }
        ctx.beginPath()
        ctx.moveTo(0, -STARLIGHT_RADIUS)
        ctx.lineTo(STARLIGHT_RADIUS * 0.45, 0)
        ctx.lineTo(0, STARLIGHT_RADIUS)
        ctx.lineTo(-STARLIGHT_RADIUS * 0.45, 0)
        ctx.closePath()
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.restore()
      })

      // 子弹
      bullets.forEach((bullet) => {
        if (palette.pixel) {
          ctx.fillStyle = palette.danger
          ctx.fillRect(
            bullet.x - BULLET_RADIUS,
            bullet.y - BULLET_RADIUS,
            BULLET_RADIUS * 2,
            BULLET_RADIUS * 2,
          )
          ctx.strokeStyle = palette.border
          ctx.lineWidth = 2
          ctx.strokeRect(
            bullet.x - BULLET_RADIUS + 1,
            bullet.y - BULLET_RADIUS + 1,
            BULLET_RADIUS * 2 - 2,
            BULLET_RADIUS * 2 - 2,
          )
          return
        }
        ctx.fillStyle = palette.danger
        if (palette.glow) {
          ctx.shadowColor = palette.danger
          ctx.shadowBlur = 12
        }
        ctx.beginPath()
        ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)"
        ctx.beginPath()
        ctx.arc(bullet.x - 1.5, bullet.y - 1.5, BULLET_RADIUS * 0.35, 0, Math.PI * 2)
        ctx.fill()
      })

      drawPlayer(ctx, palette)

      // 粒子
      particles.forEach((particle) => {
        const alpha = clamp(particle.life / particle.maxLife, 0, 1)
        ctx.globalAlpha = alpha
        ctx.fillStyle = palette.star
        ctx.fillRect(particle.x - 1.5, particle.y - 1.5, 3, 3)
      })
      ctx.globalAlpha = 1

      // HUD：剩余时间条 + 生命 + 分数
      const remainRatio = clamp(1 - elapsed / DODGE_DURATION_MS, 0, 1)
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)"
      ctx.fillRect(64, 74, BUILTIN_WIDTH - 128, 6)
      ctx.fillStyle = remainRatio > 0.25 ? palette.accent : palette.danger
      ctx.fillRect(64, 74, (BUILTIN_WIDTH - 128) * remainRatio, 6)

      drawHearts(ctx, palette)

      ctx.textBaseline = "middle"
      ctx.textAlign = "right"
      ctx.fillStyle = palette.text
      ctx.font = `700 18px ${palette.fontFamily}`
      ctx.fillText(String(computeDodgeScore(elapsed, starlightCollected)), BUILTIN_WIDTH - 72, 52)

      // 受击红闪
      if (elapsed < hitFlashUntil) {
        ctx.globalAlpha = clamp((hitFlashUntil - elapsed) / 260, 0, 1) * 0.35
        ctx.fillStyle = palette.danger
        ctx.fillRect(-40, -40, BUILTIN_WIDTH + 80, BUILTIN_HEIGHT + 80)
        ctx.globalAlpha = 1
      }
    },
  }
}

import { createSeededRandom } from "../../utils"

// 弹幕样式。
export type DodgePattern = "aimed" | "ring" | "spiral"

// 单次弹幕生成事件。
export interface DodgeSpawnEvent {
  atMs: number
  pattern: DodgePattern
  count: number
  speed: number
  seed: number
}

// 单局时长与生命值。
export const DODGE_DURATION_MS = 60000
export const DODGE_MAX_HP = 3

/**
 * 星尘闪避计分：生存每秒 10 分 + 每颗星光 25 分。
 */
export const computeDodgeScore = (elapsedMs: number, starlight: number): number =>
  Math.floor(elapsedMs / 1000) * 10 + starlight * 25

/**
 * 生成弹幕时间表：随进度从单发瞄准过渡到环形与螺旋，密度与速度单调上升。
 */
export const buildDodgeSchedule = (
  seed: number,
  durationMs: number = DODGE_DURATION_MS,
): DodgeSpawnEvent[] => {
  const random = createSeededRandom(seed)
  const events: DodgeSpawnEvent[] = []
  let at = 1400

  while (at < durationMs - 600) {
    const progress = at / durationMs
    const roll = random()
    const pattern: DodgePattern =
      progress < 0.2
        ? "aimed"
        : progress < 0.5
          ? roll < 0.55
            ? "aimed"
            : "ring"
          : roll < 0.35
            ? "ring"
            : roll < 0.72
              ? "spiral"
              : "aimed"
    const count =
      pattern === "ring"
        ? 8 + Math.floor(progress * 10)
        : pattern === "spiral"
          ? 3
          : 1 + Math.floor(progress * 2.4)
    const speed = Math.round(150 + progress * 170 + random() * 40)

    events.push({
      atMs: Math.round(at),
      pattern,
      count,
      speed,
      seed: Math.floor(random() * 0x7fffffff),
    })

    at += 1450 - progress * 950 + random() * 300
  }

  return events
}

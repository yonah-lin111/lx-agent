import { describe, expect, it } from "vitest"
import {
  computeRunnerScore,
  createRunnerObstacle,
  createRunnerRidge,
  getRunnerSpawnGap,
  getRunnerSpeed,
  hasRunnerCollision,
  RUNNER_GROUND_Y,
  RUNNER_PLAYER_HEIGHT,
  type RunnerPlayerBox,
} from "@/features/arcade/games/runner/world"
import { createSeededRandom } from "@/features/arcade/utils"

// 站立玩家碰撞盒。
const standingPlayer: RunnerPlayerBox = {
  x: 168,
  y: RUNNER_GROUND_Y - RUNNER_PLAYER_HEIGHT,
  width: 34,
  height: RUNNER_PLAYER_HEIGHT,
}

describe("剪影跃迁世界规则", () => {
  it("计分 = 距离（米）× 倍率 向下取整", () => {
    expect(computeRunnerScore(0, 1)).toBe(0)
    expect(computeRunnerScore(100, 1.5)).toBe(150)
    expect(computeRunnerScore(99.9, 2)).toBe(199)
  })

  it("速度随距离单调上升并有上限", () => {
    expect(getRunnerSpeed(0)).toBe(330)
    expect(getRunnerSpeed(1000)).toBeGreaterThan(getRunnerSpeed(0))
    expect(getRunnerSpeed(1_000_000)).toBe(690)
  })

  it("障碍生成确定性：同种子同结果，且贴地与悬空障碍都会出现", () => {
    const first = createRunnerObstacle(1200, createSeededRandom(5))
    const second = createRunnerObstacle(1200, createSeededRandom(5))
    expect(first).toEqual(second)

    const random = createSeededRandom(9)
    const obstacles = Array.from({ length: 40 }, (_, index) =>
      createRunnerObstacle(index * 400, random),
    )
    expect(obstacles.some((obstacle) => obstacle.elevation === 0)).toBe(true)
    const airObstacles = obstacles.filter((obstacle) => obstacle.elevation > 0)
    expect(airObstacles.length).toBeGreaterThan(0)
    for (const obstacle of airObstacles) {
      // 悬空障碍底部必须高于站立玩家头顶，贴地跑过才安全。
      expect(obstacle.elevation).toBeGreaterThan(RUNNER_PLAYER_HEIGHT)
    }
  })

  it("障碍间距有下限，避免不可通过", () => {
    const random = createSeededRandom(3)
    for (let index = 0; index < 30; index += 1) {
      expect(getRunnerSpawnGap(random, 690)).toBeGreaterThanOrEqual(300)
    }
  })

  it("碰撞检测：贴地障碍站立即撞、悬空障碍站立安全但起跳会撞", () => {
    const groundObstacle = { x: 200, width: 40, height: 50, elevation: 0 }
    expect(hasRunnerCollision(standingPlayer, groundObstacle)).toBe(true)

    const airObstacle = { x: 200, width: 40, height: 30, elevation: 78 }
    expect(hasRunnerCollision(standingPlayer, airObstacle)).toBe(false)

    const jumpingPlayer: RunnerPlayerBox = {
      ...standingPlayer,
      y: standingPlayer.y - 34,
    }
    expect(hasRunnerCollision(jumpingPlayer, airObstacle)).toBe(true)

    const farObstacle = { x: 900, width: 40, height: 50, elevation: 0 }
    expect(hasRunnerCollision(standingPlayer, farObstacle)).toBe(false)
  })

  it("山脊采样确定性且首尾对齐形成可循环地形", () => {
    const first = createRunnerRidge(11, 26, 150)
    const second = createRunnerRidge(11, 26, 150)

    expect(first).toEqual(second)
    expect(first).toHaveLength(26)
    expect(first[0]).toBe(first[first.length - 1])
    for (const height of first) {
      expect(height).toBeGreaterThanOrEqual(150 * 0.15)
      expect(height).toBeLessThanOrEqual(150)
    }
  })
})

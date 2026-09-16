import { createSeededRandom } from "../../utils"

// 跑酷世界几何常量。
export const RUNNER_GROUND_Y = 470
export const RUNNER_PLAYER_X = 168
export const RUNNER_PLAYER_WIDTH = 34
export const RUNNER_PLAYER_HEIGHT = 54

// 障碍物（世界坐标 + 距地面高度）。
export interface RunnerObstacle {
  x: number
  width: number
  height: number
  // 0 = 贴地障碍（必须起跳越过）；大于玩家身高 = 悬空障碍（必须贴地跑过）。
  elevation: number
}

// 玩家碰撞盒（世界坐标，y 为顶部）。
export interface RunnerPlayerBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 跑酷计分：距离（米）× 倍率。
 */
export const computeRunnerScore = (distanceInMeters: number, multiplier: number): number =>
  Math.floor(distanceInMeters * multiplier)

/**
 * 跑动速度随距离提升，上限 690。
 */
export const getRunnerSpeed = (distance: number): number => 330 + Math.min(360, distance * 0.055)

/**
 * 生成一个障碍：约 6 成为贴地障碍，其余为悬空障碍（限制为不能乱跳）。
 */
export const createRunnerObstacle = (x: number, random: () => number): RunnerObstacle => {
  const roll = random()
  if (roll < 0.62) {
    return { x, width: 26 + random() * 30, height: 36 + random() * 44, elevation: 0 }
  }
  return {
    x,
    width: 34 + random() * 36,
    height: 26 + random() * 14,
    elevation: RUNNER_PLAYER_HEIGHT + 16 + random() * 26,
  }
}

/**
 * 生成下一次障碍间距（与当前速度正相关，保证极限速度下仍可反应）。
 */
export const getRunnerSpawnGap = (random: () => number, speed: number): number =>
  300 + random() * 260 + speed * 0.42

/**
 * 轴对齐碰撞检测：障碍为世界坐标，cameraDistance 为镜头已推进距离，
 * 由本函数统一换算到屏幕空间（玩家碰撞盒一直位于固定屏幕位置）。
 */
export const hasRunnerCollision = (
  player: RunnerPlayerBox,
  obstacle: RunnerObstacle,
  cameraDistance: number,
): boolean => {
  const obstacleLeft = obstacle.x - cameraDistance
  const obstacleRight = obstacleLeft + obstacle.width
  const playerRight = player.x + player.width
  const playerBottom = player.y + player.height
  const obstacleBottom = RUNNER_GROUND_Y - obstacle.elevation
  const obstacleTop = obstacleBottom - obstacle.height

  if (playerRight <= obstacleLeft || player.x >= obstacleRight) return false
  return player.y < obstacleBottom && playerBottom > obstacleTop
}

/**
 * 生成视差山脊高度采样（确定性），供三层剪影重复滚动。
 */
export const createRunnerRidge = (seed: number, samples: number, amplitude: number): number[] => {
  const random = createSeededRandom(seed)
  const heights: number[] = []
  let current = amplitude * (0.35 + random() * 0.3)
  for (let index = 0; index < samples; index += 1) {
    current += (random() - 0.5) * amplitude * 0.42
    current = Math.max(amplitude * 0.15, Math.min(amplitude, current))
    heights.push(current)
  }
  // 首尾对齐，保证无缝循环滚动。
  heights[heights.length - 1] = heights[0]
  return heights
}

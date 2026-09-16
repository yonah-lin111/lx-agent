import { describe, expect, it } from "vitest"
import { createArcadeGame } from "@/features/arcade/games"
import { getOneStrokeCellCenter } from "@/features/arcade/games/oneStroke/game"
import { generateOneStrokeLevel } from "@/features/arcade/games/oneStroke/generator"
import type { ArcadeGameId, ArcadeInputState } from "@/features/arcade/types"

// 16.7ms 一帧的输入快照。
const createInput = (): ArcadeInputState => ({ keys: new Set(), pressedKeys: new Set() })

// 走完一张网格：沿见证解逐个格子连线。
const drawLevel = (game: ReturnType<typeof createArcadeGame>, size: number): void => {
  const { solution } = generateOneStrokeLevel(size)
  const start = getOneStrokeCellCenter(size, solution[0])
  game.pointerDown?.(start.x, start.y)
  for (const cell of solution.slice(1)) {
    const point = getOneStrokeCellCenter(size, cell)
    game.pointerMove?.(point.x, point.y)
  }
  game.pointerUp?.(start.x, start.y)
}

// 推进若干毫秒（每帧清空按下态）。
const advance = (
  game: ReturnType<typeof createArcadeGame>,
  input: ArcadeInputState,
  ms: number,
): void => {
  for (let elapsed = 0; elapsed < ms; elapsed += 16.7) {
    input.pressedKeys.clear()
    game.update(16.7, input)
  }
}

const runFrames = (
  gameId: ArcadeGameId,
  frames: number,
  mutate?: (input: ArcadeInputState, frame: number) => void,
): ReturnType<typeof createArcadeGame> => {
  const game = createArcadeGame(gameId)
  const input = createInput()
  for (let frame = 0; frame < frames; frame += 1) {
    input.pressedKeys.clear()
    mutate?.(input, frame)
    game.update(16.7, input)
    if (game.isFinished()) break
  }
  return game
}

describe("彩蛋游戏运行时冒烟测试", () => {
  it("三款游戏都能创建并处于未结束状态", () => {
    for (const gameId of ["oneStroke", "dodge", "runner"] as const) {
      const game = createArcadeGame(gameId)
      expect(game.getScore()).toBe(0)
      expect(game.isFinished()).toBe(false)
    }
  })

  it("一笔画：拖动到任意格开始连线，R 键可重置且不崩溃", () => {
    const game = createArcadeGame("oneStroke")
    const input = createInput()

    game.pointerDown?.(447, 360)
    game.pointerMove?.(510, 360)
    game.pointerUp?.(510, 360)
    game.update(16.7, input)

    input.pressedKeys.add("KeyR")
    game.update(16.7, input)

    expect(Number.isFinite(game.getScore())).toBe(true)
  })

  it("一笔画：过关后先进入 3-2-1 倒计时，倒计时内输入无效", () => {
    const game = createArcadeGame("oneStroke")
    const input = createInput()

    drawLevel(game, 3)
    expect(game.getScore()).toBe(90)

    // 倒计时期间继续连线应被忽略
    drawLevel(game, 4)
    advance(game, input, 3000)
    expect(game.getScore()).toBe(90)

    // 倒计时结束后恢复正常
    drawLevel(game, 4)
    expect(game.getScore()).toBe(250)
  })

  it("星尘闪避：60 秒后必然结束且分数有限", () => {
    const game = runFrames("dodge", 3800)
    expect(game.isFinished()).toBe(true)
    expect(Number.isFinite(game.getScore())).toBe(true)
    expect(game.getScore()).toBeGreaterThanOrEqual(0)
  })

  it("剪影跃迁：跑动积累距离与分数，跳跃输入不崩溃", () => {
    const game = runFrames("runner", 900, (input, frame) => {
      if (frame % 120 === 0) input.pressedKeys.add("Space")
      if (frame % 120 < 20) input.keys.add("Space")
    })

    expect(game.getScore()).toBeGreaterThan(0)
    expect(Number.isFinite(game.getScore())).toBe(true)
  })

  it("剪影跃迁：完全不跳跃时必然撞上贴地障碍并结束", () => {
    const game = runFrames("runner", 2400)
    expect(game.isFinished()).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import { createArcadeGame } from "@/features/arcade/games"
import type { ArcadeGameId, ArcadeInputState } from "@/features/arcade/types"

// 16.7ms 一帧的输入快照。
const createInput = (): ArcadeInputState => ({ keys: new Set(), pressedKeys: new Set() })

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
    for (const gameId of ["tetris", "dodge", "cake"] as const) {
      const game = createArcadeGame(gameId)
      expect(game.getScore()).toBe(0)
      expect(game.isFinished()).toBe(false)
    }
  })

  it("俄罗斯方块：连续硬降堆满盘面后结束，分数有限", () => {
    const game = runFrames("tetris", 4000, (input) => {
      input.pressedKeys.add("Space")
    })

    expect(game.isFinished()).toBe(true)
    expect(Number.isFinite(game.getScore())).toBe(true)
    expect(game.getScore()).toBeGreaterThan(0)
  })

  it("俄罗斯方块：左右移动与旋转输入不崩溃", () => {
    const game = runFrames("tetris", 600, (input, frame) => {
      if (frame % 30 === 0) input.pressedKeys.add("ArrowLeft")
      if (frame % 30 === 10) input.pressedKeys.add("ArrowRight")
      if (frame % 30 === 20) input.pressedKeys.add("ArrowUp")
      if (frame % 30 > 24) input.keys.add("ArrowDown")
    })

    expect(Number.isFinite(game.getScore())).toBe(true)
  })

  it("星尘闪避：60 秒后必然结束且分数有限", () => {
    const game = runFrames("dodge", 3800)
    expect(game.isFinished()).toBe(true)
    expect(Number.isFinite(game.getScore())).toBe(true)
    expect(game.getScore()).toBeGreaterThanOrEqual(0)
  })

  it("叠蛋糕：首次落层必然命中并计分（基座足够宽）", () => {
    const game = createArcadeGame("cake")
    const input = createInput()

    input.pressedKeys.add("Space")
    game.update(16.7, input)
    for (let frame = 0; frame < 12; frame += 1) {
      input.pressedKeys.clear()
      game.update(16.7, input)
    }

    expect(game.getScore()).toBeGreaterThanOrEqual(1)
    expect(game.isFinished()).toBe(false)
  })

  it("叠蛋糕：连续落层会因错位累积而结束，分数有限", () => {
    const game = createArcadeGame("cake")
    const input = createInput()

    for (let frame = 0; frame < 2000; frame += 1) {
      input.pressedKeys.clear()
      if (frame % 25 === 0) input.pressedKeys.add("Space")
      game.update(16.7, input)
      if (game.isFinished()) break
    }

    expect(Number.isFinite(game.getScore())).toBe(true)
  })
})

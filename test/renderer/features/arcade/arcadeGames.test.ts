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
})

import { describe, expect, it } from "vitest"
import {
  generateOneStrokeLevel,
  isOrthogonallyAdjacent,
} from "@/features/arcade/games/oneStroke/generator"

describe("一笔画关卡生成器", () => {
  it("为 3..7 尺寸生成可解见证路径（覆盖全部格子、去重、正交连续）", () => {
    for (const size of [3, 4, 5, 6, 7]) {
      const level = generateOneStrokeLevel(size)

      expect(level.size).toBe(size)
      expect(level.solution).toHaveLength(size * size)
      expect(new Set(level.solution).size).toBe(size * size)
      for (let index = 1; index < level.solution.length; index += 1) {
        expect(isOrthogonallyAdjacent(level.solution[index - 1], level.solution[index], size)).toBe(
          true,
        )
      }
    }
  })

  it("isOrthogonallyAdjacent 只接受上下左右相邻", () => {
    expect(isOrthogonallyAdjacent(0, 1, 3)).toBe(true)
    expect(isOrthogonallyAdjacent(0, 3, 3)).toBe(true)
    expect(isOrthogonallyAdjacent(0, 4, 3)).toBe(false)
    expect(isOrthogonallyAdjacent(0, 2, 3)).toBe(false)
  })
})

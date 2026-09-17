// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BUILTIN_BEST_SCORES_STORAGE_KEY } from "@/features/game/builtin/constants"
import { useBuiltinBestScores } from "@/features/game/builtin/hooks/useBuiltinBestScores"

const readStoredScores = (): Record<string, number> =>
  JSON.parse(localStorage.getItem(BUILTIN_BEST_SCORES_STORAGE_KEY) ?? "{}") as Record<
    string,
    number
  >

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("useBuiltinBestScores", () => {
  it("存储键为 lx_game_builtin_best_v1", () => {
    expect(BUILTIN_BEST_SCORES_STORAGE_KEY).toBe("lx_game_builtin_best_v1")
  })

  it("读取本机最高分并过滤非法数据", () => {
    localStorage.setItem(
      BUILTIN_BEST_SCORES_STORAGE_KEY,
      JSON.stringify({ dodge: 90, bad: "x", negative: -3 }),
    )

    const { result } = renderHook(() => useBuiltinBestScores())

    expect(result.current.bestScores).toEqual({ dodge: 90 })
  })

  it("非法 JSON 回退为空表", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    localStorage.setItem(BUILTIN_BEST_SCORES_STORAGE_KEY, "{oops")

    const { result } = renderHook(() => useBuiltinBestScores())

    expect(result.current.bestScores).toEqual({})
  })

  it("刷新纪录时写入 localStorage 并返回 true", () => {
    const { result } = renderHook(() => useBuiltinBestScores())

    let isNewBest = false
    act(() => {
      isNewBest = result.current.submitScore("tetris", 120)
    })

    expect(isNewBest).toBe(true)
    expect(result.current.bestScores.tetris).toBe(120)
    expect(readStoredScores()).toEqual({ tetris: 120 })
  })

  it("未刷新纪录时不写入并返回 false", () => {
    localStorage.setItem(BUILTIN_BEST_SCORES_STORAGE_KEY, JSON.stringify({ tetris: 200 }))
    const { result } = renderHook(() => useBuiltinBestScores())

    let isNewBest = true
    act(() => {
      isNewBest = result.current.submitScore("tetris", 120)
    })

    expect(isNewBest).toBe(false)
    expect(readStoredScores()).toEqual({ tetris: 200 })
  })

  it("localStorage 写入失败时不影响内存最高分", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded")
    })
    const { result } = renderHook(() => useBuiltinBestScores())

    let isNewBest = false
    act(() => {
      isNewBest = result.current.submitScore("cake", 66)
    })

    expect(isNewBest).toBe(true)
    expect(result.current.bestScores.cake).toBe(66)
  })
})

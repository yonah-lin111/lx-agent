import { useEffect } from "react"
import { create } from "zustand"
import { BUILTIN_BEST_SCORES_STORAGE_KEY } from "../constants"

/**
 * 读取本机保存的内置游戏最高分（非法数据安全回退为空表）。
 */
const readBestScores = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(BUILTIN_BEST_SCORES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}

    const result: Record<string, number> = {}
    for (const [gameId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        result[gameId] = value
      }
    }
    return result
  } catch (error) {
    console.error("Failed to read builtin best scores", error)
    return {}
  }
}

interface BuiltinBestScoresStore {
  bestScores: Record<string, number>
  load: () => void
  submitScore: (gameId: string, score: number) => boolean
}

// 模块级 Store：游戏库与游戏覆盖层同时挂载时共享同一份最高分。
const useBuiltinBestScoresStore = create<BuiltinBestScoresStore>((set, get) => ({
  bestScores: {},
  load: () => set({ bestScores: readBestScores() }),
  submitScore: (gameId, score) => {
    const current = get().bestScores
    if (score <= (current[gameId] ?? 0)) return false

    const next = { ...current, [gameId]: score }
    set({ bestScores: next })
    try {
      localStorage.setItem(BUILTIN_BEST_SCORES_STORAGE_KEY, JSON.stringify(next))
    } catch (error) {
      console.error("Failed to save builtin best score", error)
    }
    return true
  },
}))

/**
 * 管理各内置游戏最高分：挂载时同步一次本机数据，仅刷新纪录时写入 localStorage。
 */
export const useBuiltinBestScores = (): {
  bestScores: Record<string, number>
  submitScore: (gameId: string, score: number) => boolean
} => {
  const bestScores = useBuiltinBestScoresStore((state) => state.bestScores)
  const submitScore = useBuiltinBestScoresStore((state) => state.submitScore)

  useEffect(() => {
    useBuiltinBestScoresStore.getState().load()
  }, [])

  return { bestScores, submitScore }
}

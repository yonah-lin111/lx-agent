import { useCallback, useRef, useState } from "react"
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

/**
 * 管理各内置游戏最高分：仅在刷新纪录时写入 localStorage。
 */
export const useBuiltinBestScores = (): {
  bestScores: Record<string, number>
  submitScore: (gameId: string, score: number) => boolean
} => {
  const [bestScores, setBestScores] = useState<Record<string, number>>(readBestScores)
  const bestScoresRef = useRef(bestScores)

  const submitScore = useCallback((gameId: string, score: number): boolean => {
    if (score <= (bestScoresRef.current[gameId] ?? 0)) return false

    const next = { ...bestScoresRef.current, [gameId]: score }
    bestScoresRef.current = next
    setBestScores(next)
    try {
      localStorage.setItem(BUILTIN_BEST_SCORES_STORAGE_KEY, JSON.stringify(next))
    } catch (error) {
      console.error("Failed to save builtin best score", error)
    }
    return true
  }, [])

  return { bestScores, submitScore }
}

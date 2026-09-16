import { useCallback, useRef, useState } from "react"
import { ARCADE_BEST_SCORES_STORAGE_KEY } from "../constants"

/**
 * 读取本机保存的彩蛋最高分（非法数据安全回退为空表）。
 */
const readBestScores = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(ARCADE_BEST_SCORES_STORAGE_KEY)
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
    console.error("Failed to read arcade best scores", error)
    return {}
  }
}

/**
 * 管理各小游戏最高分：仅在刷新纪录时写入 localStorage。
 */
export const useArcadeBestScores = (): {
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
      localStorage.setItem(ARCADE_BEST_SCORES_STORAGE_KEY, JSON.stringify(next))
    } catch (error) {
      console.error("Failed to save arcade best score", error)
    }
    return true
  }, [])

  return { bestScores, submitScore }
}

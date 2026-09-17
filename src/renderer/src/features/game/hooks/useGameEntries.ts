import type { GameImportResult, GameRomEntry } from "@shared/contracts/game"
import { useCallback, useEffect, useState } from "react"
import { gameApi } from "@/features/game/api/gameApi"

/**
 * 管理游戏条目列表加载与增删改操作（操作后自动刷新列表）。
 */
export const useGameEntries = () => {
  const [entries, setEntries] = useState<GameRomEntry[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [hasError, setHasError] = useState<boolean>(false)

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setHasError(false)
    try {
      setEntries(await gameApi.list())
    } catch {
      setEntries([])
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const importFromDialog = useCallback((): Promise<GameImportResult[]> => {
    return gameApi.importFromDialog()
  }, [])

  const rename = useCallback(
    async (id: number, title: string): Promise<void> => {
      await gameApi.rename(id, title)
      await reload()
    },
    [reload],
  )

  const remove = useCallback(
    async (id: number): Promise<void> => {
      await gameApi.remove(id)
      await reload()
    },
    [reload],
  )

  return {
    entries,
    isLoading,
    hasError,
    reload,
    importFromDialog,
    rename,
    remove,
  }
}

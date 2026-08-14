import type { NoteCard } from "@shared/contracts/noteCard"
import { useCallback, useEffect, useState } from "react"
import { noteCardApi } from "@/features/note-card/api/noteCardApi"

/**
 * 获取并管理笔记卡片列表数据；cards 为 null 表示加载中。
 */
export const useNoteCards = (): {
  cards: NoteCard[] | null
  refresh: () => Promise<void>
} => {
  const [cards, setCards] = useState<NoteCard[] | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await noteCardApi.list()
      setCards(data)
    } catch (error) {
      console.error("Failed to load note cards", error)
      setCards([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { cards, refresh }
}

import type { CreateNoteCardInput, NoteCard, UpdateNoteCardInput } from "@shared/contracts/noteCard"
import { useState } from "react"
import { noteCardApi } from "@/features/note-card/api/noteCardApi"

/**
 * 笔记卡片的创建、更新与删除操作。
 */
export const useNoteCardMutations = (): {
  isMutating: boolean
  createCard: (input: CreateNoteCardInput) => Promise<NoteCard>
  updateCard: (id: string, input: UpdateNoteCardInput) => Promise<NoteCard>
  deleteCard: (id: string) => Promise<void>
} => {
  const [isMutating, setIsMutating] = useState(false)

  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    setIsMutating(true)
    try {
      return await operation()
    } finally {
      setIsMutating(false)
    }
  }

  return {
    isMutating,
    createCard: (input) => run(() => noteCardApi.create(input)),
    updateCard: (id, input) => run(() => noteCardApi.update(id, input)),
    deleteCard: (id) => run(() => noteCardApi.delete(id)),
  }
}

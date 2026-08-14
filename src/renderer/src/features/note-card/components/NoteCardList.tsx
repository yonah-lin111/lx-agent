import type { CreateNoteCardInput, NoteCard } from "@shared/contracts/noteCard"
import { useCallback, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxToast } from "@/components/ui/LxToast"
import { NoteCardView } from "@/features/note-card/components/NoteCard"
import { NoteCardModal } from "@/features/note-card/components/NoteCardModal"
import { NoteCardSkeleton } from "@/features/note-card/components/NoteCardSkeleton"
import { useNoteCardMutations } from "@/features/note-card/hooks/useNoteCardMutations"
import { useNoteCards } from "@/features/note-card/hooks/useNoteCards"

/**
 * 顶部展开区的笔记卡片列表：加载骨架屏、新增/编辑弹窗与删除复制操作。
 */
export const NoteCardList = (): React.JSX.Element => {
  const { cards, refresh } = useNoteCards()
  const { isMutating, createCard, updateCard, deleteCard } = useNoteCardMutations()
  const toast = useLxToast()
  const [isModalOpen, setIsModalOpen] = useState(false)
  // 弹窗编辑目标；null 表示新增模式。
  const [editingCard, setEditingCard] = useState<NoteCard | null>(null)

  const openModal = useCallback((card: NoteCard | null): void => {
    setEditingCard(card)
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback((): void => {
    setIsModalOpen(false)
  }, [])

  const handleSave = useCallback(
    async (input: CreateNoteCardInput): Promise<void> => {
      try {
        if (editingCard) {
          await updateCard(editingCard.id, input)
        } else {
          await createCard(input)
        }
        closeModal()
        await refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败")
      }
    },
    [editingCard, updateCard, createCard, closeModal, refresh, toast],
  )

  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      try {
        await deleteCard(id)
        await refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "删除失败")
      }
    },
    [deleteCard, refresh, toast],
  )

  const handleCopy = useCallback(
    async (card: NoteCard): Promise<void> => {
      try {
        await navigator.clipboard.writeText(card.content)
        toast.success("内容已复制到剪贴板")
      } catch {
        toast.error("复制失败")
      }
    },
    [toast],
  )

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center justify-between px-1 pb-1">
        <span className="text-xs font-mono text-white/40">笔记</span>
        <LxIconButton
          aria-label="新增笔记"
          preset="add"
          size="small"
          title={{ content: "新增笔记", placement: "bottom" }}
          onClick={() => openModal(null)}
        />
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {cards === null ? (
          <NoteCardSkeleton />
        ) : cards.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-white/30">暂无笔记，点击右上角 + 新增</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {cards.map((card) => (
              <NoteCardView
                key={card.id}
                card={card}
                onEdit={() => openModal(card)}
                onDelete={() => handleDelete(card.id)}
                onCopy={() => handleCopy(card)}
              />
            ))}
          </div>
        )}
      </div>
      <NoteCardModal
        isOpen={isModalOpen}
        card={editingCard}
        isSaving={isMutating}
        onClose={closeModal}
        onSave={(input) => void handleSave(input)}
      />
    </div>
  )
}

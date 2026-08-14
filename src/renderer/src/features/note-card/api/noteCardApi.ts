import type { CreateNoteCardInput, NoteCard, UpdateNoteCardInput } from "@shared/contracts/noteCard"

// 隔离笔记卡片对 Electron preload API 的依赖。
export const noteCardApi = {
  list: (): Promise<NoteCard[]> => window.api.noteCard.list(),
  create: (input: CreateNoteCardInput): Promise<NoteCard> => window.api.noteCard.create(input),
  update: (id: string, input: UpdateNoteCardInput): Promise<NoteCard> =>
    window.api.noteCard.update(id, input),
  delete: (id: string): Promise<void> => window.api.noteCard.delete(id),
}

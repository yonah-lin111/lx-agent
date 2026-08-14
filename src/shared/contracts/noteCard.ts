// 笔记卡片数据。
export type NoteCard = {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

// 笔记卡片创建参数。
export type CreateNoteCardInput = {
  title: string
  content: string
  tags?: string[]
}

// 笔记卡片更新参数。
export type UpdateNoteCardInput = Partial<CreateNoteCardInput>

// 笔记卡片 IPC 接口。
export interface NoteCardApi {
  noteCard: {
    list: () => Promise<NoteCard[]>
    create: (input: CreateNoteCardInput) => Promise<NoteCard>
    update: (id: string, input: UpdateNoteCardInput) => Promise<NoteCard>
    delete: (id: string) => Promise<void>
  }
}

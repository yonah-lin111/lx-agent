import { randomUUID } from "node:crypto"
import type { CreateNoteCardInput, NoteCard, UpdateNoteCardInput } from "@shared/contracts/noteCard"
import type Database from "better-sqlite3"
import { getDatabase } from "@/db"

export type {
  CreateNoteCardInput,
  NoteCard,
  UpdateNoteCardInput,
} from "@shared/contracts/noteCard"

// 笔记卡片数据库记录。
type NoteCardRow = {
  external_id: string
  title: string
  content: string
  tags: string | null
  created_at: string
  updated_at: string
}

// 规范化标签列表：去空白、去重并丢弃空值。
const normalizeTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return []
  const uniqueTags = new Set<string>()
  for (const tag of tags) {
    if (typeof tag !== "string") continue
    const trimmed = tag.trim()
    if (trimmed) uniqueTags.add(trimmed)
  }
  return [...uniqueTags]
}

// 解析标签 JSON 存储为业务数组。
const parseTags = (value: string | null): string[] => {
  try {
    const parsed = JSON.parse(value ?? "[]")
    return normalizeTags(parsed)
  } catch {
    return []
  }
}

const toNoteCard = (row: NoteCardRow): NoteCard => ({
  id: row.external_id,
  title: row.title,
  content: row.content,
  tags: parseTags(row.tags),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * 提供笔记卡片的持久化 CRUD 操作。
 */
export const createNoteCardService = (getConnection: () => Database.Database) => ({
  listNoteCards: (): NoteCard[] => {
    const rows = getConnection()
      .prepare("SELECT * FROM note_card ORDER BY updated_at DESC, id DESC")
      .all() as NoteCardRow[]

    return rows.map(toNoteCard)
  },

  createNoteCard: (input: CreateNoteCardInput): NoteCard => {
    const now = new Date().toISOString()
    const id = randomUUID()
    const tags = normalizeTags(input.tags)
    const title = typeof input.title === "string" ? input.title : ""
    const content = typeof input.content === "string" ? input.content : ""

    getConnection()
      .prepare(
        "INSERT INTO note_card (external_id, title, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, title, content, JSON.stringify(tags), now, now)

    return { id, title, content, tags, createdAt: now, updatedAt: now }
  },

  updateNoteCard: (id: string, input: UpdateNoteCardInput): NoteCard => {
    const updates: string[] = []
    const values: Array<string | number> = []

    if (input.title !== undefined) {
      updates.push("title = ?")
      values.push(input.title)
    }
    if (input.content !== undefined) {
      updates.push("content = ?")
      values.push(input.content)
    }
    if (input.tags !== undefined) {
      updates.push("tags = ?")
      values.push(JSON.stringify(normalizeTags(input.tags)))
    }
    if (updates.length === 0) {
      throw new Error("NO_UPDATES")
    }

    updates.push("updated_at = ?")
    values.push(new Date().toISOString(), id)
    getConnection()
      .prepare(`UPDATE note_card SET ${updates.join(", ")} WHERE external_id = ?`)
      .run(...values)

    const row = getConnection().prepare("SELECT * FROM note_card WHERE external_id = ?").get(id) as
      | NoteCardRow
      | undefined
    if (!row) throw new Error("NOTE_CARD_NOT_FOUND")

    return toNoteCard(row)
  },

  deleteNoteCard: (id: string): void => {
    getConnection().prepare("DELETE FROM note_card WHERE external_id = ?").run(id)
  },
})

// 生产环境使用的笔记卡片服务。
export const noteCardService = createNoteCardService(getDatabase)

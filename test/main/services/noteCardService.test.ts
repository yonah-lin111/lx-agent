import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runMigrations } from "@/db"
import { createNoteCardService } from "@/services/noteCardService"

// 测试使用的内存数据库。
let database: Database.Database

beforeEach(() => {
  database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  runMigrations(database)
})

afterEach(() => {
  database.close()
})

describe("noteCardService", () => {
  it("支持笔记卡片 CRUD", () => {
    const service = createNoteCardService(() => database)

    expect(service.listNoteCards()).toEqual([])

    const created = service.createNoteCard({
      title: "Plan",
      content: "# Roadmap",
      tags: ["plan", "plan", " work "],
    })
    expect(created).toMatchObject({ title: "Plan", content: "# Roadmap", tags: ["plan", "work"] })

    const updated = service.updateNoteCard(created.id, { title: "Roadmap" })
    expect(updated).toMatchObject({ title: "Roadmap", content: "# Roadmap" })

    service.deleteNoteCard(created.id)
    expect(service.listNoteCards()).toEqual([])
  })

  it("按更新时间倒序返回卡片", async () => {
    const service = createNoteCardService(() => database)
    const first = service.createNoteCard({ title: "A", content: "" })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = service.createNoteCard({ title: "B", content: "" })

    // 初始按创建时间倒序：B 在前。
    expect(service.listNoteCards().map((card) => card.id)).toEqual([second.id, first.id])

    await new Promise((resolve) => setTimeout(resolve, 5))
    service.updateNoteCard(first.id, { content: "updated" })

    // 更新后 A 排到最前。
    expect(service.listNoteCards().map((card) => card.id)).toEqual([first.id, second.id])
  })

  it("标签支持省略且被规范化去重", () => {
    const service = createNoteCardService(() => database)
    const card = service.createNoteCard({ title: "No tags", content: "x" })

    expect(card.tags).toEqual([])

    service.updateNoteCard(card.id, { tags: [" a ", "a", "", 42] as unknown as string[] })
    expect(service.listNoteCards()[0]?.tags).toEqual(["a"])
  })

  it("更新不存在的卡片时抛出异常", () => {
    const service = createNoteCardService(() => database)

    expect(() => service.updateNoteCard("missing", { title: "x" })).toThrow("NOTE_CARD_NOT_FOUND")
    expect(() => service.updateNoteCard("missing", {})).toThrow("NO_UPDATES")
  })
})

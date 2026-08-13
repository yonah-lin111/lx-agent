import type { Migration } from "./types"

/**
 * 移除视图级排序废弃的 sort_order 列。
 * 容错：迁移系统启用前个别旧库可能已内联删除该列，存在时再删。
 */
export const migration: Migration = {
  version: 2,
  name: "drop_project_item_sort_order",
  up: (database) => {
    const columns = database.prepare("PRAGMA table_info(project_item)").all() as Array<{
      name: string
    }>
    if (columns.some((column) => column.name === "sort_order")) {
      database.exec("ALTER TABLE project_item DROP COLUMN sort_order")
    }
  },
}

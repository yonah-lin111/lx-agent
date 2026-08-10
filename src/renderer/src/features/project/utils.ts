import type { MarkdownPage } from "@shared/project"
import { getMarkdownTemplateStatuses } from "@/features/markdown/commands/markdownBlockCommands"

// 最近打开条目列表的最大容量。
export const MAX_RECENT_ITEMS = 10

// 模板块统计结果：未完成、进行中与已完成数量。
export interface TemplateBlockCounts {
  todo: number
  inProgress: number
  done: number
}

/**
 * 规范化条目数据；条目数据必须是页面 JSON，空数据按单个空白页处理。
 */
export const parseMarkdownPages = (value: string): MarkdownPage[] => {
  if (value.trim() === "") {
    return [{ id: crypto.randomUUID(), name: "Page 1", content: "" }]
  }
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((page) => page && typeof page === "object")) {
    throw new Error("INVALID_ITEM_PAGES")
  }
  return parsed as MarkdownPage[]
}

/**
 * 记录最近打开的条目 id：不调整已有顺序（顺序由用户拖拽决定），
 * 新条目追加到末尾，超出容量移除最前面的条目。
 */
export const pushRecentItemId = (ids: readonly string[], itemId: string): string[] => {
  if (ids.includes(itemId)) return ids.slice(0, MAX_RECENT_ITEMS)
  const next = [...ids, itemId]
  return next.length > MAX_RECENT_ITEMS ? next.slice(next.length - MAX_RECENT_ITEMS) : next
}

/**
 * 统计条目数据中未完成、进行中与已完成的模板块数量；数据非法时按空内容处理。
 */
export const countTemplateBlocks = (itemData: string): TemplateBlockCounts => {
  let pages: MarkdownPage[]
  try {
    pages = parseMarkdownPages(itemData)
  } catch {
    pages = []
  }

  let todo = 0
  let inProgress = 0
  let done = 0
  for (const page of pages) {
    for (const status of getMarkdownTemplateStatuses(page.content)) {
      if (status === "todo") todo += 1
      else if (status === "in_progress") inProgress += 1
      else done += 1
    }
  }
  return { todo, inProgress, done }
}

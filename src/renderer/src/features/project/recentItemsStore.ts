import type { ProjectItemStatus } from "@shared/project"
import { create } from "zustand"
import { projectApi } from "@/features/project/api/projectApi"
import { countTemplateBlocks, pushRecentItemId } from "@/features/project/utils"

// localStorage 中保存最近打开条目 id 列表的键。
const RECENT_ITEMS_KEY = "project-navigation-recent-items"

// 最近条目数据：供头部 tag 栏与展开区最近卡片共用。
export interface RecentItemCard {
  id: string
  itemName: string
  projectName: string
  folderName: string | null
  status: ProjectItemStatus
  todo: number
  inProgress: number
  done: number
}

// 最近打开条目 id 列表状态。
interface RecentItemsState {
  ids: string[]
  push: (itemId: string) => void
  remove: (itemId: string) => void
  move: (fromId: string, toId: string) => void
  setIds: (ids: string[]) => void
  clear: () => void
}

// 读取最近打开的条目 id 列表。
const readRecentItemIds = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_ITEMS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

// 写入最近打开的条目 id 列表。
const writeRecentItemIds = (ids: string[]): void => {
  try {
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(ids))
  } catch {
    // 忽略可能存在的 Storage 写入异常。
  }
}

/**
 * 全局共享的最近打开条目 id 列表：头部 tag 栏与展开区最近卡片共用同一份数据，
 * 任一处的拖拽重排、移除与清理都会即时同步到另一处。
 */
export const useRecentItemsStore = create<RecentItemsState>((set) => ({
  ids: readRecentItemIds(),
  push: (itemId) =>
    set((state) => {
      const next = pushRecentItemId(state.ids, itemId)
      const isSame =
        next.length === state.ids.length && next.every((id, index) => id === state.ids[index])
      if (isSame) return state
      writeRecentItemIds(next)
      return { ids: next }
    }),
  remove: (itemId) =>
    set((state) => {
      const next = state.ids.filter((id) => id !== itemId)
      writeRecentItemIds(next)
      return { ids: next }
    }),
  move: (fromId, toId) =>
    set((state) => {
      const from = state.ids.indexOf(fromId)
      const to = state.ids.indexOf(toId)
      if (from === -1 || to === -1 || from === to) return state
      const next = [...state.ids]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      writeRecentItemIds(next)
      return { ids: next }
    }),
  setIds: (ids) =>
    set((state) => {
      const isSame =
        ids.length === state.ids.length && ids.every((id, index) => id === state.ids[index])
      if (isSame) return state
      writeRecentItemIds(ids)
      return { ids }
    }),
  clear: () =>
    set(() => {
      writeRecentItemIds([])
      return { ids: [] }
    }),
}))

// 解析最近打开条目为卡片数据；已删除条目被忽略并返回仍有效的 id 列表。
export const resolveRecentItemCards = async (
  ids: string[],
): Promise<{ cards: RecentItemCard[]; validIds: string[] }> => {
  const [projects, folders, items] = await Promise.all([
    projectApi.listProjects(),
    projectApi.listFolders(),
    projectApi.list(),
  ])
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const folderById = new Map(folders.map((folder) => [folder.id, folder]))
  const itemById = new Map(items.map((item) => [item.id, item]))
  const validIds: string[] = []
  const cards: RecentItemCard[] = []
  for (const id of ids) {
    const item = itemById.get(id)
    if (!item) {
      if (id.startsWith("temp-")) {
        const targetProjectId = id.slice("temp-".length)
        const targetProject = projectById.get(targetProjectId)
        if (targetProject) {
          validIds.push(id)
          let rawData = ""
          try {
            rawData = localStorage.getItem(`lx-agent-temp-prompt-${id}`) ?? ""
          } catch {
            rawData = ""
          }
          const counts = countTemplateBlocks(rawData)
          cards.push({
            id,
            itemName: "project.temporaryPrompt",
            projectName: targetProject.name,
            folderName: null,
            status: "todo",
            todo: counts.todo,
            inProgress: counts.inProgress,
            done: counts.done,
          })
        }
      }
      continue
    }
    validIds.push(id)
    const counts = countTemplateBlocks(item.itemData)
    const folder = item.projectFolderId ? folderById.get(item.projectFolderId) : undefined
    cards.push({
      id: item.id,
      itemName: item.name,
      projectName: projectById.get(item.projectId)?.name ?? "",
      folderName: folder?.name ?? null,
      status: item.status,
      todo: counts.todo,
      inProgress: counts.inProgress,
      done: counts.done,
    })
  }
  return { cards, validIds }
}

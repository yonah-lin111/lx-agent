import type { MarkdownPage, ProjectItemStatus } from "@shared/project"
import { useCallback, useEffect, useRef, useState } from "react"
import { getMarkdownTemplateStatuses } from "@/features/markdown/commands/markdownBlockCommands"
import { projectApi } from "@/features/project/api/projectApi"
import { parseMarkdownPages } from "@/features/project/utils"
import { useProjectItemsVersionStore } from "@/features/project-navigation/projectItemsStore"

// 自动保存延迟时间。
const AUTO_SAVE_DELAY = 800

// 将页面数据编码为持久化 JSON。
const serializePages = (pages: MarkdownPage[]): string => JSON.stringify(pages)

// 根据模板块状态推导条目状态：任一进行中则进行中；无进行中块时保持用户设置的已完成，否则待处理。
// 无已闭合模板块的内容不参与推导。
const deriveItemStatus = (pages: MarkdownPage[], current: ProjectItemStatus): ProjectItemStatus => {
  const statuses = pages.flatMap((page) => getMarkdownTemplateStatuses(page.content))
  if (statuses.length === 0) return current

  if (statuses.some((status) => status === "in_progress")) return "in_progress"
  return current === "completed" ? "completed" : "todo"
}

/**
 * 加载指定项目条目，并提供防抖自动保存和手动保存能力。
 */
export const useProjectEditor = (
  itemId: string | null,
): {
  content: string
  pages: MarkdownPage[]
  hasItem: boolean
  isLoading: boolean
  isSaved: boolean
  loadedItemId: string | null
  projectId: string | null
  worktreePath: string | null
  setWorktreePath: (path: string | null) => void
  save: () => void
  setContent: (content: string) => void
  setPages: (pages: MarkdownPage[]) => void
} => {
  const [content, setContentState] = useState("")
  const [pages, setPagesState] = useState<MarkdownPage[]>([])
  const [hasItem, setHasItem] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaved, setIsSaved] = useState(true)
  const [loadedItemId, setLoadedItemId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [worktreePath, setWorktreePathState] = useState<string | null>(null)
  const contentRef = useRef(content)
  const pagesRef = useRef(pages)
  const savedContentRef = useRef("")
  const saveRequestRef = useRef(0)
  const itemStatusRef = useRef<ProjectItemStatus>("todo")

  const setWorktreePath = useCallback((path: string | null): void => {
    setWorktreePathState(path)
  }, [])

  const setPages = useCallback((nextPages: MarkdownPage[]): void => {
    pagesRef.current = nextPages
    setPagesState(nextPages)
    const nextContent = serializePages(nextPages)
    contentRef.current = nextContent
    setContentState(nextContent)
    setIsSaved(nextContent === savedContentRef.current)
  }, [])

  const setContent = useCallback((nextContent: string): void => {
    if (pagesRef.current.length > 0) {
      const nextPages = pagesRef.current.map((page, index) =>
        index === 0 ? { ...page, content: nextContent } : page,
      )
      pagesRef.current = nextPages
      setPagesState(nextPages)
      const serializedPages = serializePages(nextPages)
      contentRef.current = serializedPages
      setContentState(serializedPages)
      setIsSaved(serializedPages === savedContentRef.current)
      return
    }
    contentRef.current = nextContent
    setContentState(nextContent)
    setIsSaved(nextContent === savedContentRef.current)
  }, [])

  useEffect(() => {
    let isCurrent = true
    saveRequestRef.current += 1

    const loadItem = async (): Promise<void> => {
      setIsLoading(true)
      setHasItem(false)
      setProjectId(null)
      setWorktreePathState(null)
      try {
        if (itemId && itemId.startsWith("temp-")) {
          const derivedProjectId = itemId.slice("temp-".length)
          const projects = await projectApi.listProjects()
          if (!isCurrent) return
          const targetProject = projects.find((p) => p.id === derivedProjectId)
          if (!targetProject) {
            setHasItem(false)
            return
          }
          let rawData = ""
          try {
            rawData = localStorage.getItem(`lx-agent-temp-prompt-${itemId}`) ?? ""
          } catch {
            rawData = ""
          }
          let localWorktree: string | null = null
          try {
            localWorktree = localStorage.getItem(`lx-agent-temp-worktree-${itemId}`) || null
          } catch {
            localWorktree = null
          }

          const nextPages = parseMarkdownPages(rawData)
          const nextContent = serializePages(nextPages)
          pagesRef.current = nextPages
          contentRef.current = nextContent
          savedContentRef.current = nextContent
          itemStatusRef.current = "todo"
          setPagesState(nextPages)
          setContentState(nextContent)
          setHasItem(true)
          setProjectId(derivedProjectId)
          setWorktreePathState(localWorktree)
          setIsSaved(true)
          setLoadedItemId(itemId)
          return
        }

        const item = itemId
          ? (await projectApi.list()).find((entry) => entry.id === itemId)
          : undefined
        if (!isCurrent) return
        const rawData = item?.itemData ?? ""
        const nextPages = parseMarkdownPages(rawData)
        const nextContent = serializePages(nextPages)
        pagesRef.current = nextPages
        contentRef.current = nextContent
        savedContentRef.current = nextContent
        itemStatusRef.current = item?.status ?? "todo"
        setPagesState(nextPages)
        setContentState(nextContent)
        setHasItem(item !== undefined)
        setProjectId(item?.projectId ?? null)
        setWorktreePathState(item?.worktreePath ?? null)
        setIsSaved(true)
        setLoadedItemId(itemId)
      } catch (error) {
        console.error("Failed to load item", error)
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    void loadItem()
    return () => {
      isCurrent = false
    }
  }, [itemId])

  const save = useCallback((): void => {
    if (
      !itemId ||
      isLoading ||
      loadedItemId !== itemId ||
      contentRef.current === savedContentRef.current
    )
      return
    const contentToSave = contentRef.current
    const requestId = saveRequestRef.current + 1
    saveRequestRef.current = requestId

    if (itemId.startsWith("temp-")) {
      try {
        localStorage.setItem(`lx-agent-temp-prompt-${itemId}`, contentToSave)
        savedContentRef.current = contentToSave
        setIsSaved(true)
      } catch (error) {
        console.error("Failed to save temp prompt", error)
        setIsSaved(false)
      }
      return
    }

    void projectApi
      .update(itemId, { itemData: contentToSave })
      .then(() => {
        if (saveRequestRef.current !== requestId || contentRef.current !== contentToSave) return
        savedContentRef.current = contentToSave
        setIsSaved(true)
        useProjectItemsVersionStore.getState().bump()
      })
      .catch((error: unknown) => {
        if (saveRequestRef.current !== requestId) return
        console.error("Failed to save item", error)
        setIsSaved(false)
      })
  }, [itemId, isLoading, loadedItemId])

  useEffect(() => {
    if (!itemId || isLoading || loadedItemId !== itemId || content === savedContentRef.current)
      return
    const timer = window.setTimeout(save, AUTO_SAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [content, itemId, isLoading, loadedItemId, save])

  // 模板块状态变化时同步推导条目状态并持久化，通知侧边栏刷新。
  useEffect(() => {
    if (!itemId || itemId.startsWith("temp-") || isLoading || loadedItemId !== itemId) return

    const derived = deriveItemStatus(pagesRef.current, itemStatusRef.current)
    if (derived === itemStatusRef.current) return

    const previousStatus = itemStatusRef.current
    itemStatusRef.current = derived
    void projectApi
      .update(itemId, { status: derived })
      .then(() => useProjectItemsVersionStore.getState().bump())
      .catch((error: unknown) => {
        itemStatusRef.current = previousStatus
        console.error("Failed to sync item status", error)
      })
  }, [content, itemId, isLoading, loadedItemId])

  return {
    content,
    pages,
    hasItem,
    isLoading,
    isSaved,
    loadedItemId,
    projectId,
    worktreePath,
    setWorktreePath,
    save,
    setContent,
    setPages,
  }
}

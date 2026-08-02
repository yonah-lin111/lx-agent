import type { MarkdownPage } from "@shared/project"
import { useCallback, useEffect, useRef, useState } from "react"
import { projectApi } from "@/features/project/api/projectApi"

// 自动保存延迟时间。
const AUTO_SAVE_DELAY = 800

// 规范化条目数据；条目数据必须是页面 JSON，空数据按单个空白页处理。
const parsePages = (value: string): MarkdownPage[] => {
  if (value.trim() === "") {
    return [{ id: crypto.randomUUID(), name: "Page 1", content: "" }]
  }
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((page) => page && typeof page === "object")) {
    throw new Error("INVALID_ITEM_PAGES")
  }
  return parsed as MarkdownPage[]
}

// 将页面数据编码为持久化 JSON。
const serializePages = (pages: MarkdownPage[]): string => JSON.stringify(pages)

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
  const contentRef = useRef(content)
  const pagesRef = useRef(pages)
  const savedContentRef = useRef("")
  const saveRequestRef = useRef(0)

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
      try {
        const item = itemId
          ? (await projectApi.list()).find((entry) => entry.id === itemId)
          : undefined
        if (!isCurrent) return
        const rawData = item?.itemData ?? ""
        const nextPages = parsePages(rawData)
        const nextContent = serializePages(nextPages)
        pagesRef.current = nextPages
        contentRef.current = nextContent
        savedContentRef.current = nextContent
        setPagesState(nextPages)
        setContentState(nextContent)
        setHasItem(item !== undefined)
        setProjectId(item?.projectId ?? null)
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
    void projectApi
      .update(itemId, { itemData: contentToSave })
      .then(() => {
        if (saveRequestRef.current !== requestId || contentRef.current !== contentToSave) return
        savedContentRef.current = contentToSave
        setIsSaved(true)
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

  return {
    content,
    pages,
    hasItem,
    isLoading,
    isSaved,
    loadedItemId,
    projectId,
    save,
    setContent,
    setPages,
  }
}

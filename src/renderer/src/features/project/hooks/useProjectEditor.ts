import type { MarkdownPage } from "@shared/project"
import { useCallback, useEffect, useRef, useState } from "react"
import { projectApi } from "@/features/project/api/projectApi"

// 自动保存延迟时间。
const AUTO_SAVE_DELAY = 800

// 规范化设计数据；设计数据必须是页面 JSON。
const parsePages = (value: string): MarkdownPage[] => {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((page) => page && typeof page === "object")) {
    throw new Error("INVALID_DESIGN_PAGES")
  }
  return parsed as MarkdownPage[]
}

// 将页面数据编码为持久化 JSON。
const serializePages = (pages: MarkdownPage[]): string => JSON.stringify(pages)

/**
 * 加载指定设计，并提供防抖自动保存和手动保存能力。
 */
export const useProjectEditor = (
  designId: string | null,
): {
  content: string
  pages: MarkdownPage[]
  hasDesign: boolean
  isLoading: boolean
  isSaved: boolean
  loadedDesignId: string | null
  projectId: string | null
  save: () => void
  setContent: (content: string) => void
  setPages: (pages: MarkdownPage[]) => void
} => {
  const [content, setContentState] = useState("")
  const [pages, setPagesState] = useState<MarkdownPage[]>([])
  const [hasDesign, setHasDesign] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaved, setIsSaved] = useState(true)
  const [loadedDesignId, setLoadedDesignId] = useState<string | null>(null)
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

    const loadDesign = async (): Promise<void> => {
      setIsLoading(true)
      setHasDesign(false)
      setProjectId(null)
      try {
        const design = designId
          ? (await projectApi.list()).find((item) => item.id === designId)
          : undefined
        if (!isCurrent) return
        const rawData = design?.designData ?? ""
        const nextPages = parsePages(rawData)
        const nextContent = serializePages(nextPages)
        pagesRef.current = nextPages
        contentRef.current = nextContent
        savedContentRef.current = nextContent
        setPagesState(nextPages)
        setContentState(nextContent)
        setHasDesign(design !== undefined)
        setProjectId(design?.projectId ?? null)
        setIsSaved(true)
        setLoadedDesignId(designId)
      } catch (error) {
        console.error("Failed to load design", error)
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    void loadDesign()
    return () => {
      isCurrent = false
    }
  }, [designId])

  const save = useCallback((): void => {
    if (
      !designId ||
      isLoading ||
      loadedDesignId !== designId ||
      contentRef.current === savedContentRef.current
    )
      return
    const contentToSave = contentRef.current
    const requestId = saveRequestRef.current + 1
    saveRequestRef.current = requestId
    void projectApi
      .update(designId, { designData: contentToSave })
      .then(() => {
        if (saveRequestRef.current !== requestId || contentRef.current !== contentToSave) return
        savedContentRef.current = contentToSave
        setIsSaved(true)
      })
      .catch((error: unknown) => {
        if (saveRequestRef.current !== requestId) return
        console.error("Failed to save design", error)
        setIsSaved(false)
      })
  }, [designId, isLoading, loadedDesignId])

  useEffect(() => {
    if (
      !designId ||
      isLoading ||
      loadedDesignId !== designId ||
      content === savedContentRef.current
    )
      return
    const timer = window.setTimeout(save, AUTO_SAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [content, designId, isLoading, loadedDesignId, save])

  return {
    content,
    pages,
    hasDesign,
    isLoading,
    isSaved,
    loadedDesignId,
    projectId,
    save,
    setContent,
    setPages,
  }
}

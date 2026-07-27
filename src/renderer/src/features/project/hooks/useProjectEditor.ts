import { useCallback, useEffect, useRef, useState } from "react"
import { projectApi } from "@/features/project/api/projectApi"

// 自动保存延迟时间。
const AUTO_SAVE_DELAY = 800

/**
 * 加载指定设计，并提供防抖自动保存和手动保存能力。
 */
export const useProjectEditor = (
  designId: string | null,
): {
  content: string
  hasDesign: boolean
  isLoading: boolean
  isSaved: boolean
  loadedDesignId: string | null
  projectId: string | null
  save: () => void
  setContent: (content: string) => void
} => {
  const [content, setContentState] = useState("")
  const [hasDesign, setHasDesign] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaved, setIsSaved] = useState(true)
  const [loadedDesignId, setLoadedDesignId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const contentRef = useRef(content)
  const savedContentRef = useRef(content)
  const saveRequestRef = useRef(0)

  const setContent = useCallback((nextContent: string): void => {
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
        const designData = design?.designData ?? ""
        contentRef.current = designData
        savedContentRef.current = designData
        setContentState(designData)
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
    ) {
      return
    }

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
    ) {
      return
    }

    const timer = window.setTimeout(save, AUTO_SAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [content, designId, isLoading, loadedDesignId, save])

  return { content, hasDesign, isLoading, isSaved, loadedDesignId, projectId, save, setContent }
}

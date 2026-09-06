import { type MutableRefObject, useEffect, useRef, useState } from "react"
import type { EditorView } from "@codemirror/view"
import { Transaction } from "@codemirror/state"
import type { MarkdownPage } from "@/features/markdown/types"

export interface UseMarkdownPagesParams {
  itemId?: string
  initialContent?: string
  pages?: MarkdownPage[]
  pageMode?: boolean
  editorViewRef: MutableRefObject<EditorView | null>
  scrollToBottom: () => void
  onPagesChange?: (pages: MarkdownPage[]) => void
}

export interface UseMarkdownPagesReturn {
  content: string
  setContent: React.Dispatch<React.SetStateAction<string>>
  activePageIndex: number
  setActivePageIndex: React.Dispatch<React.SetStateAction<number>>
  pageName: string
  setPageName: React.Dispatch<React.SetStateAction<string>>
  pagesRef: MutableRefObject<MarkdownPage[] | undefined>
  activePageIndexRef: MutableRefObject<number>
  pageModeRef: MutableRefObject<boolean>
  onPagesChangeRef: MutableRefObject<((pages: MarkdownPage[]) => void) | undefined>
  switchPageRef: MutableRefObject<(index: number) => void>
  createPageRef: MutableRefObject<() => void>
  switchPage: (index: number) => void
  createPage: () => void
  renamePage: (name: string) => void
  deletePage: () => void
  reorderPage: (fromIndex: number, toIndex: number) => void
}

export const useMarkdownPages = ({
  itemId,
  initialContent = "",
  pages,
  pageMode = false,
  editorViewRef,
  scrollToBottom,
  onPagesChange,
}: UseMarkdownPagesParams): UseMarkdownPagesReturn => {
  const pagesRef = useRef(pages)
  const activePageIndexRef = useRef(0)
  const onPagesChangeRef = useRef(onPagesChange)
  const pageModeRef = useRef(pageMode)

  pagesRef.current = pages
  onPagesChangeRef.current = onPagesChange
  pageModeRef.current = pageMode

  const [content, setContent] = useState(() => {
    if (pageMode && pages?.length) {
      let index = pages.length - 1
      if (itemId) {
        const saved = localStorage.getItem(`lx-md-active-page-${itemId}`)
        if (saved !== null) {
          const parsed = parseInt(saved, 10)
          if (parsed >= 0 && parsed < pages.length) {
            index = parsed
          }
        }
      }
      return pages[index]?.content ?? initialContent
    }
    return initialContent
  })

  const [activePageIndex, setActivePageIndex] = useState(() => {
    if (pageMode && pages?.length) {
      if (itemId) {
        const saved = localStorage.getItem(`lx-md-active-page-${itemId}`)
        if (saved !== null) {
          const parsed = parseInt(saved, 10)
          if (parsed >= 0 && parsed < pages.length) {
            return parsed
          }
        }
      }
      return pages.length - 1
    }
    return 0
  })

  const [pageName, setPageName] = useState("")
  activePageIndexRef.current = activePageIndex

  const activePage = pageMode ? pages?.[activePageIndex] : undefined

  useEffect(() => {
    if (!pageMode || !pages?.length) return
    const nextPage = pages[Math.min(activePageIndex, pages.length - 1)]
    if (!nextPage) return
    setContent(nextPage.content)
    setPageName(nextPage.name)
  }, [activePageIndex, pageMode, pages])

  useEffect(() => {
    if (!pageMode || !activePage || !editorViewRef.current) return
    const view = editorViewRef.current
    const nextContent = activePage.content
    if (view.state.doc.toString() !== nextContent) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: nextContent },
        selection: { anchor: nextContent.length },
        scrollIntoView: true,
        // 页面切换不进入撤销历史。
        annotations: [Transaction.addToHistory.of(false)],
      })
      scrollToBottom()
    }
  }, [activePage, pageMode, scrollToBottom, editorViewRef])

  const switchPage = (index: number): void => {
    if (!pages || index < 0 || index >= pages.length || index === activePageIndex) return
    setActivePageIndex(index)
    if (itemId) {
      localStorage.setItem(`lx-md-active-page-${itemId}`, index.toString())
    }
  }

  const createPage = (): void => {
    const nextPage = {
      id: crypto.randomUUID(),
      name: `Page ${(pages?.length ?? 0) + 1}`,
      content: "",
    }
    const nextPages = [...(pages ?? []), nextPage]
    onPagesChangeRef.current?.(nextPages)
    const nextIndex = nextPages.length - 1
    setActivePageIndex(nextIndex)
    if (itemId) {
      localStorage.setItem(`lx-md-active-page-${itemId}`, nextIndex.toString())
    }
  }

  const renamePage = (name: string): void => {
    setPageName(name)
    if (!pages || !activePage) return
    onPagesChangeRef.current?.(
      pages.map((page, index) => (index === activePageIndex ? { ...page, name } : page)),
    )
  }

  const deletePage = (): void => {
    if (!pages || pages.length <= 1) return
    const nextPages = pages.filter((_, index) => index !== activePageIndex)
    onPagesChangeRef.current?.(nextPages)
    const nextIndex = Math.min(activePageIndex, nextPages.length - 1)
    setActivePageIndex(nextIndex)
    if (itemId) {
      localStorage.setItem(`lx-md-active-page-${itemId}`, nextIndex.toString())
    }
  }

  const reorderPage = (fromIndex: number, toIndex: number): void => {
    if (
      !pages ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= pages.length ||
      toIndex >= pages.length
    )
      return
    const nextPages = [...pages]
    const [movedPage] = nextPages.splice(fromIndex, 1)
    nextPages.splice(toIndex, 0, movedPage)
    onPagesChangeRef.current?.(nextPages)

    let nextIndex = activePageIndex
    if (activePageIndex === fromIndex) {
      nextIndex = toIndex
    } else if (fromIndex < activePageIndex && activePageIndex <= toIndex) {
      nextIndex = activePageIndex - 1
    } else if (toIndex <= activePageIndex && activePageIndex < fromIndex) {
      nextIndex = activePageIndex + 1
    }
    setActivePageIndex(nextIndex)
    if (itemId) {
      localStorage.setItem(`lx-md-active-page-${itemId}`, nextIndex.toString())
    }
  }

  const switchPageRef = useRef(switchPage)
  const createPageRef = useRef(createPage)
  switchPageRef.current = switchPage
  createPageRef.current = createPage

  return {
    content,
    setContent,
    activePageIndex,
    setActivePageIndex,
    pageName,
    setPageName,
    pagesRef,
    activePageIndexRef,
    pageModeRef,
    onPagesChangeRef,
    switchPageRef,
    createPageRef,
    switchPage,
    createPage,
    renamePage,
    deletePage,
    reorderPage,
  }
}

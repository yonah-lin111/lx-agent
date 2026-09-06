import { history } from "@codemirror/commands"
import { type Compartment, Transaction } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import { useEffect, useRef, useState } from "react"
import type { MarkdownPage } from "@/features/markdown/types"

export interface UseMarkdownPagesOptions {
  itemId?: string
  pageMode?: boolean
  pages?: MarkdownPage[]
  initialContent?: string
  onChange?: (content: string) => void
  onPagesChange?: (pages: MarkdownPage[]) => void
  editorViewRef: React.RefObject<EditorView | null>
  historyCompartment?: Compartment
  scrollToBottom: () => void
  warning: (msg: string) => void
}

export interface UseMarkdownPagesResult {
  content: string
  setContent: React.Dispatch<React.SetStateAction<string>>
  activePageIndex: number
  pageName: string
  switchPage: (index: number) => void
  createPage: () => void
  renamePage: (name: string) => void
  deletePage: () => void
  reorderPage: (fromIndex: number, toIndex: number) => void
  handlePageKeyNavigation: (event: KeyboardEvent) => boolean
  handleDocContentChange: (nextContent: string) => void
}

/**
 * 管理 Markdown 多页面状态、持久化存储及键盘翻页切换。
 */
export const useMarkdownPages = ({
  itemId,
  pageMode = false,
  pages,
  initialContent = "",
  onChange,
  onPagesChange,
  editorViewRef,
  historyCompartment,
  scrollToBottom,
  warning,
}: UseMarkdownPagesOptions): UseMarkdownPagesResult => {
  const [content, setContent] = useState(() => {
    if (pageMode && pages?.length) {
      let index = pages.length - 1
      if (itemId) {
        const saved = localStorage.getItem(`lx-md-active-page-${itemId}`)
        if (saved !== null) {
          const parsed = Number.parseInt(saved, 10)
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
          const parsed = Number.parseInt(saved, 10)
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

  const pagesRef = useRef(pages)
  const activePageIndexRef = useRef(activePageIndex)
  const onPagesChangeRef = useRef(onPagesChange)
  const onChangeRef = useRef(onChange)
  const pageModeRef = useRef(pageMode)

  pagesRef.current = pages
  activePageIndexRef.current = activePageIndex
  onPagesChangeRef.current = onPagesChange
  onChangeRef.current = onChange
  pageModeRef.current = pageMode

  const activePage = pageMode ? pages?.[activePageIndex] : undefined
  const prevPageIdRef = useRef<string | undefined>(activePage?.id)
  const prevPropContentRef = useRef<string | undefined>(activePage?.content)
  const scrollToBottomRef = useRef(scrollToBottom)
  scrollToBottomRef.current = scrollToBottom

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
    const isPageSwitch = prevPageIdRef.current !== activePage.id
    prevPageIdRef.current = activePage.id

    if (isPageSwitch) {
      prevPropContentRef.current = nextContent
      if (historyCompartment) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: nextContent },
          selection: { anchor: nextContent.length },
          scrollIntoView: true,
          // 页面切换不进入撤销历史，并隔离/重置撤销栈。
          annotations: [Transaction.addToHistory.of(false)],
          effects: historyCompartment.reconfigure([]),
        })
        view.dispatch({
          effects: historyCompartment.reconfigure(history()),
        })
      } else {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: nextContent },
          selection: { anchor: nextContent.length },
          scrollIntoView: true,
          // 页面切换不进入撤销历史。
          annotations: [Transaction.addToHistory.of(false)],
        })
      }
      scrollToBottomRef.current()
    } else {
      const propChanged = prevPropContentRef.current !== nextContent
      prevPropContentRef.current = nextContent
      // 仅在外部传入的 page.content 发生实际改变且与编辑器当前内容不一致时同步
      if (propChanged && view.state.doc.toString() !== nextContent) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: nextContent },
          selection: { anchor: nextContent.length },
          scrollIntoView: true,
          annotations: [Transaction.addToHistory.of(false)],
        })
        scrollToBottomRef.current()
      }
    }
  }, [activePage, pageMode, editorViewRef, historyCompartment])

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

  const handlePageKeyNavigation = (event: KeyboardEvent): boolean => {
    const isModKey = event.metaKey || event.ctrlKey
    if (isModKey && event.altKey) {
      const key = event.key
      if (key !== "ArrowLeft" && key !== "ArrowRight") return false
      event.preventDefault()
      if (!pageModeRef.current || !pagesRef.current?.length) return false
      const currentIndex = activePageIndexRef.current

      if (key === "ArrowLeft") {
        switchPageRef.current(currentIndex - 1)
        return true
      }

      if (currentIndex < pagesRef.current.length - 1) {
        switchPageRef.current(currentIndex + 1)
        return true
      }

      const currentPage = pagesRef.current[currentIndex]
      if (currentPage && currentPage.content.trim() === "") {
        warning("当前页内容为空，请先输入内容再创建下一页")
        return true
      }
      createPageRef.current()
      return true
    }
    return false
  }

  const handleDocContentChange = (nextContent: string): void => {
    setContent(nextContent)
    const activeIndex = activePageIndexRef.current
    if (pageMode && pagesRef.current && pagesRef.current[activeIndex]) {
      onPagesChangeRef.current?.(
        pagesRef.current.map((page, index) =>
          index === activeIndex ? { ...page, content: nextContent } : page,
        ),
      )
    }
    onChangeRef.current?.(nextContent)
  }

  return {
    content,
    setContent,
    activePageIndex,
    pageName,
    switchPage,
    createPage,
    renamePage,
    deletePage,
    reorderPage,
    handlePageKeyNavigation,
    handleDocContentChange,
  }
}

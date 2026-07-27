import type { EditorView } from "@codemirror/view"
import type { RefObject } from "react"
import { useEffect, useLayoutEffect, useRef } from "react"
import {
  synchronizeEditorToPreview,
  synchronizePreviewToEditor,
} from "@/components/ui/LxMarkdown/extensions/markdownEditorExtensions"
import type { EditorScrollAnchor, MarkdownPreviewMode } from "@/components/ui/LxMarkdown/types"

/**
 * 记录编辑器当前可见行和相对偏移，供文档重排后恢复视觉位置。
 */
export const captureEditorScrollAnchor = (view: EditorView): EditorScrollAnchor => {
  const { scrollLeft, scrollTop } = view.scrollDOM
  const block = view.lineBlockAtHeight(scrollTop)
  return {
    left: scrollLeft,
    line: view.state.doc.lineAt(block.from).number,
    offset: scrollTop - block.top,
  }
}

/**
 * 在 CodeMirror 完成文档测量后恢复之前的滚动位置。
 */
export const restoreEditorScrollAnchor = (view: EditorView, anchor: EditorScrollAnchor): void => {
  view.requestMeasure({
    read: () => anchor,
    write: (scrollAnchor, measuredView) => {
      const line = measuredView.state.doc.line(
        Math.min(scrollAnchor.line, measuredView.state.doc.lines),
      )
      const block = measuredView.lineBlockAt(line.from)
      measuredView.scrollDOM.scrollTo({
        left: scrollAnchor.left,
        top: block.top + scrollAnchor.offset,
      })
    },
  })
}

/**
 * 管理编辑与预览区域模式切换时的滚动锚点恢复以及双栏同步滚动逻辑。
 */
export const useEditorScrollSync = ({
  editorViewRef,
  previewRef,
  previewMode,
  previewHtml,
}: {
  editorViewRef: RefObject<EditorView | null>
  previewRef: RefObject<HTMLElement | null>
  previewMode: MarkdownPreviewMode
  previewHtml: string
}) => {
  const editorScrollAnchorRef = useRef<EditorScrollAnchor | null>(null)

  /**
   * 在编辑模式切换前记录当前滚动锚点。
   */
  const captureScrollAnchor = (): void => {
    const view = editorViewRef.current
    if (view) {
      editorScrollAnchorRef.current = captureEditorScrollAnchor(view)
    }
  }

  useLayoutEffect(() => {
    const anchor = editorScrollAnchorRef.current
    const view = editorViewRef.current
    if (!anchor || !view) return

    view.requestMeasure({
      read: () => anchor,
      write: (scrollAnchor, measuredView) => {
        const line = measuredView.state.doc.line(
          Math.min(scrollAnchor.line, measuredView.state.doc.lines),
        )
        const block = measuredView.lineBlockAt(line.from)
        measuredView.scrollDOM.scrollTo({
          left: scrollAnchor.left,
          top: block.top + scrollAnchor.offset,
        })
        if (editorScrollAnchorRef.current === scrollAnchor) {
          editorScrollAnchorRef.current = null
        }
      },
    })
  }, [previewMode, editorViewRef])

  useEffect(() => {
    const editorScrollElement = editorViewRef.current?.scrollDOM
    const previewElement = previewRef.current
    if (!editorScrollElement || !previewElement) return

    if (previewMode === "preview") {
      const frame = requestAnimationFrame(() => {
        if (editorViewRef.current) {
          synchronizeEditorToPreview(editorViewRef.current, previewElement)
        }
      })
      return () => cancelAnimationFrame(frame)
    }
    if (previewMode !== "split") return

    let restoreListenerTimer: number | null = null

    const synchronize = (
      target: HTMLElement,
      targetListener: EventListener,
      synchronizeTarget: () => void,
    ): void => {
      target.removeEventListener("scroll", targetListener)
      synchronizeTarget()
      if (restoreListenerTimer !== null) window.clearTimeout(restoreListenerTimer)
      restoreListenerTimer = window.setTimeout(() => {
        target.addEventListener("scroll", targetListener)
        restoreListenerTimer = null
      }, 50)
    }

    const synchronizePreview = (): void =>
      synchronize(previewElement, synchronizeEditor, () => {
        if (editorViewRef.current) {
          synchronizeEditorToPreview(editorViewRef.current, previewElement)
        }
      })
    const synchronizeEditor = (): void =>
      synchronize(editorScrollElement, synchronizePreview, () => {
        if (editorViewRef.current) {
          synchronizePreviewToEditor(previewElement, editorViewRef.current)
        }
      })
    const previewContentElement = previewElement.querySelector(".markdown-preview-content")
    const previewContentObserver = new ResizeObserver(() => synchronizePreview())

    editorScrollElement.addEventListener("scroll", synchronizePreview)
    previewElement.addEventListener("scroll", synchronizeEditor)
    if (previewContentElement) previewContentObserver.observe(previewContentElement)
    synchronizePreview()

    return () => {
      editorScrollElement.removeEventListener("scroll", synchronizePreview)
      previewElement.removeEventListener("scroll", synchronizeEditor)
      previewContentObserver.disconnect()
      if (restoreListenerTimer !== null) window.clearTimeout(restoreListenerTimer)
    }
  }, [previewHtml, previewMode, editorViewRef, previewRef])

  return { captureScrollAnchor }
}

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { agentApi } from "@/features/agent/api/agentApi"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { buildAnnotationReviewMessage } from "@/features/agent/utils/designReviewComposer"
import { generateElementSelector } from "@/features/agent/utils/designSynthesizer"
import { useTranslation } from "@/i18n"
import type { DesignAnnotation } from "@/pages/front-design/types"
import { readAnnotationEditorTheme } from "@/pages/front-design/utils/annotationEditorTheme"
import {
  ANNOTATION_LAYER_ID,
  type AnnotationLayer,
  type AnnotationLayerLabels,
  createAnnotationLayer,
} from "@/pages/front-design/utils/annotationOverlay"
import { useAppThemeValue } from "@/stores/themeStore"

// ESC 双击退出窗口：两次 ESC 间隔在此窗口内且无选中元素时才退出批注模式。
const DOUBLE_ESCAPE_WINDOW_MS = 500

export interface UseDesignAnnotationsOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  html: string
  activeDesignId: string | null
  sessionId: string | null
  title: string
  parentId?: string | null
  mode?: "tailwindcss" | "css"
  isStreaming: boolean
}

export interface UseDesignAnnotationsResult {
  isInspectorActive: boolean
  setIsInspectorActive: React.Dispatch<React.SetStateAction<boolean>>
  // iframe 每次加载完成后调用：重建批注图层并挂载快捷键监听。
  attachIframeRuntime: () => void
  annotations: DesignAnnotation[]
  removeAnnotation: (id: string) => void
  clearAnnotations: () => void
  sendAnnotations: (ids?: string[]) => Promise<void>
  editAnnotation: (id: string) => void
  highlightAnnotation: (id: string | null) => void
}

// 批注编号按清单顺序重排，保证气泡号与清单号一致。
export const normalizeAnnotationIndexes = (annotations: DesignAnnotation[]): DesignAnnotation[] =>
  annotations.map((item, position) => ({ ...item, index: position + 1 }))

/**
 * 画布批注域：批注模式开关、快捷键、元素点选、气泡编辑与批量回流 Agent。
 */
export const useDesignAnnotations = ({
  iframeRef,
  html,
  activeDesignId,
  sessionId,
  title,
  parentId,
  mode,
  isStreaming,
}: UseDesignAnnotationsOptions): UseDesignAnnotationsResult => {
  const { t } = useTranslation()
  const { success: successToast, info: infoToast } = useLxToast()
  const appTheme = useAppThemeValue()
  // 浮层样式取自应用主题（像素主题下自动直角/浮雕/马赛克底纹）。
  const editorTheme = useMemo(() => readAnnotationEditorTheme(), [appTheme])
  const editorThemeRef = useRef(editorTheme)
  editorThemeRef.current = editorTheme

  const [isInspectorActive, setIsInspectorActive] = useState<boolean>(false)
  const [annotations, setAnnotations] = useState<DesignAnnotation[]>([])
  // iframe 文档重建信号：加载完成或切换设计后重建图层与监听。
  const [runtimeEpoch, setRuntimeEpoch] = useState<number>(0)

  const layerRef = useRef<AnnotationLayer | null>(null)
  const annotationsRef = useRef<DesignAnnotation[]>(annotations)
  annotationsRef.current = annotations
  const designMetaRef = useRef({ activeDesignId, sessionId, title, parentId, mode, isStreaming })
  designMetaRef.current = { activeDesignId, sessionId, title, parentId, mode, isStreaming }
  const canRenderRef = useRef<boolean>(false)
  // t 与 toast 每次渲染都会变身份，用 ref 持有避免图层被反复重建。
  const tRef = useRef(t)
  tRef.current = t
  const toastRef = useRef(successToast)
  toastRef.current = successToast
  const infoToastRef = useRef(infoToast)
  infoToastRef.current = infoToast
  // 上一次 ESC 的按下时间：用于「双击 ESC 退出批注模式」。
  const lastEscapeAtRef = useRef<number>(0)

  const canRender = Boolean(html && activeDesignId && !isStreaming)
  canRenderRef.current = canRender

  const labels = useMemo<AnnotationLayerLabels>(
    () => ({
      placeholder: t("frontDesign.reviewPlaceholder"),
      confirm: t("frontDesign.reviewConfirm"),
      remove: t("frontDesign.reviewDelete"),
      emptyHint: t("frontDesign.reviewEmptyComment"),
      close: t("frontDesign.reviewClose"),
      styleLabels: {
        padding: t("frontDesign.inspectStylePadding"),
        margin: t("frontDesign.inspectStyleMargin"),
        font: t("frontDesign.inspectStyleFont"),
        color: t("frontDesign.inspectStyleColor"),
        background: t("frontDesign.inspectStyleBackground"),
        radius: t("frontDesign.inspectStyleRadius"),
        border: t("frontDesign.inspectStyleBorder"),
      },
    }),
    [t],
  )
  const labelsRef = useRef(labels)
  labelsRef.current = labels

  // 提交批注：同一元素已有批注时原地更新，避免重复编号。
  const handleSubmit = useCallback((selector: string, description: string, comment: string) => {
    setAnnotations((prev) => {
      const existingIndex = prev.findIndex((item) => item.selector === selector)
      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = { ...next[existingIndex], comment }
        return normalizeAnnotationIndexes(next)
      }
      return normalizeAnnotationIndexes([
        ...prev,
        {
          id: `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          selector,
          description,
          comment,
          index: prev.length + 1,
          createdAt: Date.now(),
        },
      ])
    })
    toastRef.current(tRef.current("frontDesign.elementSelectedToast", { name: description }))
  }, [])

  // ESC 规则：编辑器优先关闭 → 有选中元素则解除选中 → 无选中时双击 ESC 才退出批注模式。
  const handleEscape = useCallback((): void => {
    const layer = layerRef.current
    if (layer?.isEditorOpen()) {
      layer.closeEditor()
      lastEscapeAtRef.current = 0
      return
    }
    if (layer?.hasSelection()) {
      layer.clearSelection()
      lastEscapeAtRef.current = 0
      return
    }

    const now = Date.now()
    if (now - lastEscapeAtRef.current <= DOUBLE_ESCAPE_WINDOW_MS) {
      lastEscapeAtRef.current = 0
      setIsInspectorActive(false)
      return
    }
    // 首次按下只提示，不足一次双击不退出模式。
    lastEscapeAtRef.current = now
    infoToastRef.current(tRef.current("frontDesign.inspectExitHint"))
  }, [])

  const handleRemove = useCallback((selector: string) => {
    setAnnotations((prev) =>
      normalizeAnnotationIndexes(prev.filter((item) => item.selector !== selector)),
    )
  }, [])

  // 图层懒重建：iframe 文档被替换或 body 被重写后旧图层会脱离预览，必须在当前文档上重建。
  const ensureLayer = useCallback((): AnnotationLayer | null => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return null

    const existing = layerRef.current
    if (existing?.isAttachedTo(doc)) return existing

    // 旧图层连同其 ResizeObserver 一并销毁，避免继续观察已废弃文档。
    existing?.destroy()

    const layer = createAnnotationLayer(
      doc,
      {
        onSubmit: (selector, description, comment) => handleSubmit(selector, description, comment),
        onRemove: (selector) => handleRemove(selector),
      },
      editorThemeRef.current,
    )
    layerRef.current = layer
    return layer
  }, [iframeRef, handleSubmit, handleRemove])

  // 应用主题切换后刷新浮层样式（含已打开的输入框）。
  useEffect(() => {
    layerRef.current?.applyTheme(editorTheme)
  }, [editorTheme])

  // 页面卸载时销毁图层，释放 ResizeObserver。
  useEffect(() => {
    return () => {
      layerRef.current?.destroy()
      layerRef.current = null
    }
  }, [])

  // 画布清空、无激活设计或 Agent 流式生成时自动退出批注模式
  useEffect(() => {
    if (!html || !activeDesignId || isStreaming) {
      setIsInspectorActive(false)
    }
  }, [html, activeDesignId, isStreaming])

  // 退出批注模式时解除选中态，避免残留无法清除的选中框。
  useEffect(() => {
    if (!isInspectorActive) {
      lastEscapeAtRef.current = 0
      layerRef.current?.clearSelection()
    }
  }, [isInspectorActive])

  // 建立批注图层并回填钉选气泡
  useEffect(() => {
    if (!canRender) return
    ensureLayer()?.render(annotationsRef.current, labelsRef.current)
  }, [canRender, runtimeEpoch, activeDesignId, iframeRef, ensureLayer])

  // 批注或设计内容变化时重排气泡位置（流式生成期间跳过）
  useEffect(() => {
    if (!canRender) return
    ensureLayer()?.render(annotations, labelsRef.current)
  }, [annotations, html, canRender, runtimeEpoch, ensureLayer])

  // 批注模式交互：悬停高亮、点击新建批注、ESC 退出
  useEffect(() => {
    if (!isInspectorActive || !canRender) return
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return

    // 十字光标提示批注模式生效；设计稿内容更新会重置 body 内联样式，故在移动中自愈。
    const previousCursor = doc.body.style.cursor
    const ensureCursor = (): void => {
      if (doc.body.style.cursor !== "crosshair") {
        doc.body.style.cursor = "crosshair"
      }
    }
    ensureCursor()

    const handleMouseMove = (event: MouseEvent): void => {
      const layer = ensureLayer()
      if (!layer) return
      ensureCursor()

      const target = event.target as HTMLElement | null
      if (
        !target ||
        target === doc.body ||
        target === doc.documentElement ||
        target.closest(`#${ANNOTATION_LAYER_ID}`)
      ) {
        layer.showHover(null)
        return
      }
      layer.showHover(target)
    }

    const handleMouseLeave = (): void => {
      ensureLayer()?.showHover(null)
    }

    const handleClick = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null
      // 图层内部（钉选气泡 / 批注编辑器）由图层自身处理，不拦截也不打开新批注。
      if (!target || target.closest(`#${ANNOTATION_LAYER_ID}`)) return

      event.preventDefault()
      event.stopPropagation()

      const layer = ensureLayer()
      if (!layer) return

      // 点击画布空白：解除选中态并关闭输入框。
      if (target === doc.body || target === doc.documentElement) {
        layer.clearSelection()
        layer.closeEditor()
        return
      }

      const { selector, description, injectedAttr } = generateElementSelector(target)

      // 动态挂载 data-design-id 后同步刷回 frontDesignStore，保证选择器 100% 精确命中。
      // 序列化前摘除批注图层，避免浮层 DOM 被写进设计稿。
      const designId = designMetaRef.current.activeDesignId
      if (injectedAttr && designId) {
        const layerElement = doc.getElementById(ANNOTATION_LAYER_ID)
        layerElement?.remove()
        let fullHtml = doc.documentElement.outerHTML
        if (!/<!doctype\s+html/i.test(fullHtml)) {
          fullHtml = `<!DOCTYPE html>\n${fullHtml}`
        }
        if (layerElement) {
          doc.body.appendChild(layerElement)
        }
        frontDesignStore.registerDesign({
          id: designId,
          parentId: designMetaRef.current.parentId,
          title: designMetaRef.current.title,
          html: fullHtml,
          sessionId: designMetaRef.current.sessionId,
          mode: designMetaRef.current.mode,
        })
      }

      layer.openEditor(
        {
          selector,
          description,
          comment: "",
          isNew: true,
          anchor: target,
          // 点击点兜底：目标在点击瞬间被折叠 / 隐藏时，输入框仍贴在用户点击的位置。
          anchorPoint: {
            left: event.clientX - doc.body.getBoundingClientRect().left,
            top: event.clientY - doc.body.getBoundingClientRect().top,
          },
        },
        labelsRef.current,
      )
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      ensureLayer()
      handleEscape()
    }

    doc.addEventListener("mousemove", handleMouseMove, true)
    doc.addEventListener("mouseleave", handleMouseLeave, true)
    doc.addEventListener("click", handleClick, true)
    doc.addEventListener("keydown", handleKeyDown, true)

    return () => {
      doc.removeEventListener("mousemove", handleMouseMove, true)
      doc.removeEventListener("mouseleave", handleMouseLeave, true)
      doc.removeEventListener("click", handleClick, true)
      doc.removeEventListener("keydown", handleKeyDown, true)
      doc.body.style.cursor = previousCursor
      layerRef.current?.showHover(null)
    }
  }, [
    isInspectorActive,
    canRender,
    runtimeEpoch,
    iframeRef,
    activeDesignId,
    ensureLayer,
    handleEscape,
  ])

  // 主窗口 ESC（焦点在应用侧时同样生效）：与画布内 ESC 共用同一套规则。
  useEffect(() => {
    if (!isInspectorActive) return
    const handleWindowKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      handleEscape()
    }
    window.addEventListener("keydown", handleWindowKeyDown)
    return () => window.removeEventListener("keydown", handleWindowKeyDown)
  }, [isInspectorActive, handleEscape])

  // Shift + Alt 快捷键切换批注模式（Toggle，ESC 退出）
  const handleShortcutKeyDown = useCallback((event: KeyboardEvent) => {
    const isShiftOrAlt = event.key === "Shift" || event.key === "Alt"
    if (!isShiftOrAlt || !event.shiftKey || !event.altKey) return
    if (designMetaRef.current.isStreaming || !canRenderRef.current) return

    const target =
      (event.target as HTMLElement | null) || (document.activeElement as HTMLElement | null)
    if (target) {
      const tagName = target.tagName?.toLowerCase()
      if (tagName === "input" || tagName === "textarea" || target.isContentEditable) {
        return
      }
    }
    setIsInspectorActive((prev) => !prev)
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", handleShortcutKeyDown)
    return () => window.removeEventListener("keydown", handleShortcutKeyDown)
  }, [handleShortcutKeyDown])

  // 跨作用域将 Shift + Alt 监听挂载到 iframe 内部文档
  const attachIframeRuntime = useCallback(() => {
    const iframe = iframeRef.current
    if (iframe) {
      try {
        const doc = iframe.contentDocument
        if (doc) {
          doc.removeEventListener("keydown", handleShortcutKeyDown, true)
          doc.addEventListener("keydown", handleShortcutKeyDown, true)
        }
      } catch {
        // 跨域防御
      }
    }
    setRuntimeEpoch((epoch) => epoch + 1)
  }, [iframeRef, handleShortcutKeyDown])

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => normalizeAnnotationIndexes(prev.filter((item) => item.id !== id)))
  }, [])

  const clearAnnotations = useCallback(() => {
    setAnnotations([])
    layerRef.current?.closeEditor()
  }, [])

  const sendAnnotations = useCallback(async (ids?: string[]) => {
    const designId = designMetaRef.current.activeDesignId
    if (!designId) return

    const source = annotationsRef.current
    const targets = ids ? source.filter((item) => ids.includes(item.id)) : source
    if (targets.length === 0) return

    const message = buildAnnotationReviewMessage({
      designId,
      annotations: targets,
      header: tRef.current("frontDesign.reviewMessageHeader", { count: targets.length }),
    })
    if (!message) return

    const sessionId = designMetaRef.current.sessionId
    let targetTabId = agentTabStore.getActiveTabId()
    if (sessionId) {
      const targetTab = agentTabStore.findTabBySessionId(sessionId)
      if (targetTab) {
        targetTabId = targetTab.id
      }
    }

    await agentApi
      .setCollaborationMode("design", sessionId ?? undefined, targetTabId)
      .catch(() => {})
    agentTabStore.insertPromptToActiveTab(message)

    const sentIds = new Set(targets.map((item) => item.id))
    setAnnotations((prev) =>
      normalizeAnnotationIndexes(prev.filter((item) => !sentIds.has(item.id))),
    )
    toastRef.current(tRef.current("frontDesign.reviewSentToast", { count: targets.length }))
  }, [])

  const editAnnotation = useCallback(
    (id: string) => {
      const annotation = annotationsRef.current.find((item) => item.id === id)
      const layer = layerRef.current
      if (!annotation || !layer) return

      const doc = iframeRef.current?.contentDocument
      const anchor = (doc?.querySelector(annotation.selector) as HTMLElement | null) ?? null
      layer.openEditor(
        {
          selector: annotation.selector,
          description: annotation.description,
          comment: annotation.comment,
          isNew: false,
          anchor,
        },
        labelsRef.current,
      )
    },
    [iframeRef],
  )

  const highlightAnnotation = useCallback((id: string | null) => {
    const layer = layerRef.current
    if (!layer) return
    if (!id) {
      layer.highlight(null)
      return
    }
    const annotation = annotationsRef.current.find((item) => item.id === id)
    layer.highlight(annotation?.selector ?? null)
  }, [])

  return {
    isInspectorActive,
    setIsInspectorActive,
    attachIframeRuntime,
    annotations,
    removeAnnotation,
    clearAnnotations,
    sendAnnotations,
    editAnnotation,
    highlightAnnotation,
  }
}

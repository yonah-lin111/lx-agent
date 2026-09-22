// 画布批注浮层：在 iframe 文档内注入钉选气泡、高亮框与批注输入浮层。
// 浮层属于预览沙箱的一部分，无法使用应用 CSS Token（与 sandbox guard 同级），配色沿用画布强调色常量。

import type { DesignAnnotation } from "@/pages/front-design/types"

// 批注图层容器 id：useDesignPreview 在增量更新 body 时会保留该节点。
export const ANNOTATION_LAYER_ID = "lx-design-annotation-layer"

const PIN_SIZE = 18
const EDITOR_WIDTH = 240
const EDITOR_ESTIMATED_HEIGHT = 168
// 画布浮层强调色（与工具栏批注按钮同色系）。
const ACCENT_COLOR = "#ec4899"
const SURFACE_COLOR = "#18181b"
const BORDER_COLOR = "#3f3f46"
const TEXT_COLOR = "#fafafa"
const MUTED_COLOR = "#a1a1aa"

// 浮层文案，由父层 t() 注入。
export interface AnnotationLayerLabels {
  placeholder: string
  confirm: string
  remove: string
  emptyHint: string
  close: string
}

export interface AnnotationEditorRequest {
  selector: string
  description: string
  comment: string
  // 新建批注为 true，编辑已有批注为 false。
  isNew: boolean
  anchor: HTMLElement | null
}

export interface AnnotationLayerCallbacks {
  onSubmit: (selector: string, description: string, comment: string, isNew: boolean) => void
  onRemove: (selector: string) => void
}

export interface AnnotationLayer {
  render: (annotations: DesignAnnotation[], labels: AnnotationLayerLabels) => void
  openEditor: (request: AnnotationEditorRequest, labels: AnnotationLayerLabels) => void
  closeEditor: () => void
  isEditorOpen: () => boolean
  showHover: (element: HTMLElement | null) => void
  highlight: (selector: string | null) => void
  // 图层是否仍挂在该文档上：iframe 文档被替换或 body 被重建后必须返回 false。
  isAttachedTo: (target: Document) => boolean
  destroy: () => void
}

interface LayerPosition {
  left: number
  top: number
  width: number
  height: number
}

type ResizeObserverCtor = new (callback: () => void) => ResizeObserver

/**
 * 创建批注图层：容器挂载在 body，钉选气泡与编辑器按文档坐标绝对定位，滚动天然跟随；
 * 目标元素尺寸变化（内容增高、响应式重排）通过 ResizeObserver 实时重排标记与编辑器。
 */
export const createAnnotationLayer = (
  doc: Document,
  callbacks: AnnotationLayerCallbacks,
): AnnotationLayer => {
  // 文档坐标换算：body 外边距在预览中被强制归零，absolute 定位原点即文档原点。
  const toLayerPosition = (element: Element): LayerPosition => {
    const rect = element.getBoundingClientRect()
    const bodyRect = doc.body.getBoundingClientRect()
    return {
      left: rect.left - bodyRect.left,
      top: rect.top - bodyRect.top,
      width: rect.width,
      height: rect.height,
    }
  }

  const container = doc.createElement("div")
  container.id = ANNOTATION_LAYER_ID
  container.style.position = "absolute"
  container.style.top = "0"
  container.style.left = "0"
  container.style.width = "100%"
  container.style.minHeight = "100%"
  container.style.pointerEvents = "none"
  container.style.zIndex = "2147483646"

  const highlightBox = doc.createElement("div")
  highlightBox.setAttribute("data-annotation-highlight", "true")
  highlightBox.style.position = "absolute"
  highlightBox.style.display = "none"
  highlightBox.style.border = `2px solid ${ACCENT_COLOR}`
  highlightBox.style.backgroundColor = "rgba(236, 72, 153, 0.12)"
  highlightBox.style.borderRadius = "4px"
  highlightBox.style.boxSizing = "border-box"
  highlightBox.style.pointerEvents = "none"
  container.appendChild(highlightBox)

  const pinContainer = doc.createElement("div")
  pinContainer.setAttribute("data-annotation-pins", "true")
  pinContainer.style.position = "absolute"
  pinContainer.style.top = "0"
  pinContainer.style.left = "0"
  pinContainer.style.pointerEvents = "none"
  container.appendChild(pinContainer)

  let editorElement: HTMLElement | null = null
  let editorTextarea: HTMLTextAreaElement | null = null
  let editorHint: HTMLElement | null = null
  let editorSizeLabel: HTMLElement | null = null
  let activeRequest: AnnotationEditorRequest | null = null
  // 图层是否已销毁：销毁后不再观察任何元素。
  let destroyed = false
  // 高亮框当前跟踪的元素（悬停或面板选中）。
  let highlightTarget: Element | null = null
  // 钉选气泡与其跟踪的元素。
  let pinTargets: Array<{ pin: HTMLElement; target: Element }> = []
  // 最近一次渲染使用的文案，供钉选气泡直接唤起编辑器复用。
  let currentLabels: AnnotationLayerLabels = {
    placeholder: "",
    confirm: "",
    remove: "",
    emptyHint: "",
    close: "",
  }

  const showHighlightAt = (position: LayerPosition): void => {
    highlightBox.style.display = "block"
    highlightBox.style.left = `${position.left}px`
    highlightBox.style.top = `${position.top}px`
    highlightBox.style.width = `${position.width}px`
    highlightBox.style.height = `${position.height}px`
  }

  const positionPins = (): void => {
    for (const { pin, target } of pinTargets) {
      const position = toLayerPosition(target)
      pin.style.left = `${position.left}px`
      pin.style.top = `${position.top}px`
    }
  }

  // 编辑器跟随锚点元素，元信息中的尺寸同步刷新。
  const positionEditor = (): void => {
    if (!editorElement || !activeRequest) return

    // body 被重建后原锚点已脱离文档：按选择器重新定位，避免尺寸信息与位置失效。
    if (activeRequest.anchor && !activeRequest.anchor.isConnected) {
      const refreshed = doc.querySelector(activeRequest.selector)
      if (refreshed instanceof HTMLElement) {
        activeRequest.anchor = refreshed
      }
    }

    const anchor = activeRequest.anchor
    if (!anchor) return

    const position = toLayerPosition(anchor)
    if (editorSizeLabel) {
      editorSizeLabel.textContent = `${Math.round(position.width)}×${Math.round(position.height)}`
    }

    const viewportHeight = doc.documentElement.clientHeight || 0
    const editorTop =
      position.top + position.height + 8 + EDITOR_ESTIMATED_HEIGHT > viewportHeight
        ? Math.max(8, position.top - EDITOR_ESTIMATED_HEIGHT - 8)
        : position.top + position.height + 8
    const viewportWidth = doc.documentElement.clientWidth || 0
    editorElement.style.left = `${Math.min(position.left, Math.max(0, viewportWidth - EDITOR_WIDTH - 8))}px`
    editorElement.style.top = `${editorTop}px`
  }

  // 全量重排：目标尺寸变化后统一校正高亮框、气泡与编辑器。
  const syncPositions = (): void => {
    if (highlightTarget) showHighlightAt(toLayerPosition(highlightTarget))
    positionPins()
    positionEditor()
  }

  const ResizeObserverImpl: ResizeObserverCtor | undefined =
    (doc.defaultView as unknown as { ResizeObserver?: ResizeObserverCtor } | null)
      ?.ResizeObserver ??
    (globalThis as unknown as { ResizeObserver?: ResizeObserverCtor }).ResizeObserver

  const resizeObserver = ResizeObserverImpl ? new ResizeObserverImpl(() => syncPositions()) : null

  // 观察当前所有被标记的元素与文档根节点，尺寸变化时触发重排。
  const observeTargets = (): void => {
    if (!resizeObserver || destroyed) return
    resizeObserver.disconnect()

    const targets = new Set<Element>()
    if (highlightTarget) targets.add(highlightTarget)
    for (const entry of pinTargets) targets.add(entry.target)
    if (activeRequest?.anchor) targets.add(activeRequest.anchor)
    for (const target of targets) resizeObserver.observe(target)

    if (doc.body) resizeObserver.observe(doc.body)
    if (doc.documentElement) resizeObserver.observe(doc.documentElement)
  }

  // 编辑器打开期间选中框锁定在锚点元素上，悬停与面板 hover 不再改变它。
  const isHighlightLocked = (): boolean => Boolean(editorElement)

  const setHighlightTarget = (element: Element | null): void => {
    highlightTarget = element
    if (!element) {
      highlightBox.style.display = "none"
      observeTargets()
      return
    }
    showHighlightAt(toLayerPosition(element))
    observeTargets()
  }

  const buildButton = (
    label: string,
    action: "remove" | "confirm" | "close",
    onClick: () => void,
    options: { strong?: boolean; icon?: boolean } = {},
  ): HTMLButtonElement => {
    const button = doc.createElement("button")
    button.type = "button"
    button.setAttribute("data-annotation-action", action)
    button.textContent = label
    button.style.padding = options.icon ? "0" : "3px 8px"
    button.style.width = options.icon ? "16px" : "auto"
    button.style.height = options.icon ? "16px" : "auto"
    button.style.lineHeight = options.icon ? "14px" : "normal"
    button.style.fontSize = options.icon ? "14px" : "11px"
    button.style.fontFamily = "inherit"
    button.style.borderRadius = "4px"
    button.style.border = options.icon
      ? "none"
      : `1px solid ${options.strong ? ACCENT_COLOR : BORDER_COLOR}`
    button.style.backgroundColor = options.icon
      ? "transparent"
      : options.strong
        ? ACCENT_COLOR
        : "transparent"
    button.style.color = options.strong ? "#ffffff" : MUTED_COLOR
    button.style.cursor = "pointer"
    button.addEventListener("click", (event) => {
      event.stopPropagation()
      onClick()
    })
    return button
  }

  const closeEditor = (): void => {
    if (editorElement?.parentNode) {
      editorElement.parentNode.removeChild(editorElement)
    }
    editorElement = null
    editorTextarea = null
    editorHint = null
    editorSizeLabel = null
    activeRequest = null
    // 关闭后解除锁定，一并收起选中框。
    setHighlightTarget(null)
  }

  const confirmEditor = (): void => {
    const request = activeRequest
    const textarea = editorTextarea
    if (!request || !textarea) return

    const comment = textarea.value.trim()
    if (!comment) {
      textarea.style.borderColor = "#f43f5e"
      if (editorHint) editorHint.style.visibility = "visible"
      return
    }
    callbacks.onSubmit(request.selector, request.description, comment, request.isNew)
    closeEditor()
  }

  const mountEditor = (request: AnnotationEditorRequest, labels: AnnotationLayerLabels): void => {
    closeEditor()
    activeRequest = request

    const editor = doc.createElement("div")
    editor.setAttribute("data-annotation-editor", "true")
    editor.style.position = "absolute"
    editor.style.width = `${EDITOR_WIDTH}px`
    editor.style.pointerEvents = "auto"
    editor.style.fontFamily = "ui-sans-serif, system-ui, sans-serif"

    // 输入框上方：元素基本信息（描述 + 实时尺寸）与关闭按钮。
    const meta = doc.createElement("div")
    meta.setAttribute("data-annotation-editor-meta", "true")
    meta.style.display = "flex"
    meta.style.alignItems = "center"
    meta.style.justifyContent = "space-between"
    meta.style.gap = "6px"
    meta.style.marginBottom = "4px"

    const info = doc.createElement("span")
    info.setAttribute("data-annotation-editor-info", "true")
    info.style.display = "flex"
    info.style.alignItems = "center"
    info.style.gap = "4px"
    info.style.minWidth = "0"
    info.style.padding = "1px 6px"
    info.style.fontSize = "11px"
    info.style.fontFamily = "ui-monospace, monospace"
    info.style.color = ACCENT_COLOR
    info.style.backgroundColor = "rgba(236, 72, 153, 0.14)"
    info.style.border = "1px solid rgba(236, 72, 153, 0.35)"
    info.style.borderRadius = "4px"

    const infoName = doc.createElement("span")
    infoName.textContent = request.description || request.selector
    infoName.style.overflow = "hidden"
    infoName.style.textOverflow = "ellipsis"
    infoName.style.whiteSpace = "nowrap"
    info.appendChild(infoName)

    const infoSize = doc.createElement("span")
    infoSize.setAttribute("data-annotation-editor-size", "true")
    infoSize.style.color = "rgba(236, 72, 153, 0.75)"
    info.appendChild(infoSize)
    meta.appendChild(info)

    const closeButton = buildButton(
      "×",
      "close",
      () => {
        closeEditor()
      },
      { icon: true },
    )
    closeButton.setAttribute("aria-label", labels.close)
    closeButton.style.color = MUTED_COLOR
    closeButton.style.fontSize = "14px"
    meta.appendChild(closeButton)
    editor.appendChild(meta)

    // 输入框本体。
    const box = doc.createElement("div")
    box.setAttribute("data-annotation-editor-box", "true")
    box.style.padding = "8px"
    box.style.boxSizing = "border-box"
    box.style.backgroundColor = SURFACE_COLOR
    box.style.border = `1px solid ${ACCENT_COLOR}`
    box.style.borderRadius = "6px"
    box.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.35)"

    const textarea = doc.createElement("textarea")
    textarea.value = request.comment
    textarea.placeholder = labels.placeholder
    textarea.style.width = "100%"
    textarea.style.height = "56px"
    textarea.style.resize = "vertical"
    textarea.style.boxSizing = "border-box"
    textarea.style.padding = "4px 6px"
    textarea.style.fontSize = "12px"
    textarea.style.fontFamily = "inherit"
    textarea.style.color = TEXT_COLOR
    textarea.style.backgroundColor = "#09090b"
    textarea.style.border = `1px solid ${BORDER_COLOR}`
    textarea.style.borderRadius = "4px"
    textarea.style.outline = "none"
    box.appendChild(textarea)

    const hint = doc.createElement("div")
    hint.textContent = labels.emptyHint
    hint.style.fontSize = "10px"
    hint.style.color = "#fb7185"
    hint.style.marginTop = "4px"
    hint.style.visibility = "hidden"
    box.appendChild(hint)

    const actions = doc.createElement("div")
    actions.style.display = "flex"
    actions.style.justifyContent = "flex-end"
    actions.style.gap = "6px"
    actions.style.marginTop = "6px"
    if (!request.isNew) {
      actions.appendChild(
        buildButton(labels.remove, "remove", () => {
          callbacks.onRemove(request.selector)
          closeEditor()
        }),
      )
    }
    actions.appendChild(buildButton(labels.confirm, "confirm", confirmEditor, { strong: true }))
    box.appendChild(actions)
    editor.appendChild(box)

    textarea.addEventListener("input", () => {
      textarea.style.borderColor = BORDER_COLOR
      hint.style.visibility = "hidden"
    })
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        closeEditor()
        return
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        confirmEditor()
      }
    })
    editor.addEventListener("click", (event) => event.stopPropagation())

    container.appendChild(editor)
    editorElement = editor
    editorTextarea = textarea
    editorHint = hint
    editorSizeLabel = infoSize
    // 选中框锁定在锚点元素上，输入过程中保持可见。
    setHighlightTarget(request.anchor)
    positionEditor()
    observeTargets()
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  }

  const renderPins = (annotations: DesignAnnotation[], labels: AnnotationLayerLabels): void => {
    currentLabels = labels
    pinContainer.textContent = ""
    pinTargets = []

    for (const annotation of annotations) {
      const target = doc.querySelector(annotation.selector)
      if (!target) continue

      const position = toLayerPosition(target)
      const pin = doc.createElement("div")
      pin.setAttribute("data-annotation-pin", annotation.id)
      pin.textContent = String(annotation.index)
      pin.style.position = "absolute"
      pin.style.left = `${position.left}px`
      pin.style.top = `${position.top}px`
      pin.style.width = `${PIN_SIZE}px`
      pin.style.height = `${PIN_SIZE}px`
      pin.style.transform = "translate(-50%, -50%)"
      pin.style.borderRadius = "9999px"
      pin.style.backgroundColor = ACCENT_COLOR
      pin.style.color = "#ffffff"
      pin.style.fontSize = "10px"
      pin.style.fontWeight = "600"
      pin.style.fontFamily = "ui-monospace, monospace"
      pin.style.display = "flex"
      pin.style.alignItems = "center"
      pin.style.justifyContent = "center"
      pin.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.35)"
      pin.style.cursor = "pointer"
      pin.style.pointerEvents = "auto"
      pin.style.userSelect = "none"
      pin.addEventListener("mouseenter", () => showHighlightAt(toLayerPosition(target)))
      pin.addEventListener("mouseleave", () => {
        highlightBox.style.display = "none"
      })
      pin.addEventListener("click", (event) => {
        event.stopPropagation()
        mountEditor(
          {
            selector: annotation.selector,
            description: annotation.description,
            comment: annotation.comment,
            isNew: false,
            anchor: target as HTMLElement,
          },
          currentLabels,
        )
      })

      pinContainer.appendChild(pin)
      pinTargets.push({ pin, target })
    }

    observeTargets()
  }

  if (doc.body) doc.body.appendChild(container)

  return {
    render: (annotations: DesignAnnotation[], labels: AnnotationLayerLabels): void => {
      renderPins(annotations, labels)
    },
    openEditor: (request: AnnotationEditorRequest, labels: AnnotationLayerLabels): void => {
      currentLabels = labels
      mountEditor(request, labels)
    },
    closeEditor,
    isEditorOpen: (): boolean => Boolean(editorElement),
    showHover: (element: HTMLElement | null): void => {
      if (isHighlightLocked()) return
      if (!element || element === doc.body || element === doc.documentElement) {
        setHighlightTarget(null)
        return
      }
      setHighlightTarget(element)
    },
    highlight: (selector: string | null): void => {
      if (isHighlightLocked()) return
      if (!selector) {
        setHighlightTarget(null)
        return
      }
      setHighlightTarget(doc.querySelector(selector))
    },
    isAttachedTo: (target: Document): boolean =>
      target === doc && (doc.body?.contains(container) ?? false),
    destroy: (): void => {
      destroyed = true
      closeEditor()
      resizeObserver?.disconnect()
      pinTargets = []
      highlightTarget = null
      if (container.parentNode) container.parentNode.removeChild(container)
    },
  }
}

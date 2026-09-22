// 画布批注浮层：在 iframe 文档内注入钉选气泡、高亮框与批注输入浮层。
// 浮层属于预览沙箱的一部分，无法使用应用 CSS Token（与 sandbox guard 同级），配色沿用画布强调色常量。

import type { DesignAnnotation } from "@/pages/front-design/types"

// 批注图层容器 id：useDesignPreview 在增量更新 body 时会保留该节点。
export const ANNOTATION_LAYER_ID = "lx-design-annotation-layer"

const PIN_SIZE = 18
const EDITOR_WIDTH = 240
const EDITOR_ESTIMATED_HEIGHT = 168
// 悬停 / 批注标记（气泡）强调色。
const ACCENT_COLOR = "#ec4899"
// 选中态强调色：与悬停区分，点击元素后出现并常驻。
const SELECTION_COLOR = "#38bdf8"
const SELECTION_FILL = "rgba(56, 189, 248, 0.14)"
const HOVER_FILL = "rgba(236, 72, 153, 0.12)"
const SURFACE_COLOR = "#18181b"
const BORDER_COLOR = "#3f3f46"
const TEXT_COLOR = "#fafafa"
const MUTED_COLOR = "#a1a1aa"

// 选中框形态：hover = 悬停/预览（粉色瞬时），selection = 选中常驻（蓝色）。
export type AnnotationBoxMode = "hover" | "selection"

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
  // 点击点（画布坐标）：锚点已折叠 / 隐藏时用于兜底定位，避免浮层贴到左上角。
  anchorPoint?: { left: number; top: number }
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
  // 解除选中态与预览态（点击画布空白时调用）。
  clearSelection: () => void
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

// 尺寸退化（元素被折叠、隐藏或已脱离文档）时不能按该坐标定位，否则浮层会挤到左上角。
const isDegeneratePosition = (position: LayerPosition): boolean =>
  position.width <= 0 && position.height <= 0

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
  highlightBox.setAttribute("data-annotation-highlight-state", "hover")
  highlightBox.style.position = "absolute"
  highlightBox.style.display = "none"
  highlightBox.style.border = `2px solid ${ACCENT_COLOR}`
  highlightBox.style.backgroundColor = HOVER_FILL
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
  // 编辑器是否已按有效锚点定位过：定位过之后退化只保留原位，未定位过才用点击点兜底。
  let editorPositioned = false
  // 图层是否已销毁：销毁后不再观察任何元素。
  let destroyed = false
  // 选中态：点击元素后常驻，直到点击空白或选中其他元素。
  let selectionTarget: Element | null = null
  let selectionSelector: string | null = null
  // 悬停态：仅在无选中态时参与选中框显示。
  let hoverTarget: Element | null = null
  // 面板预览态（面板条目 / 气泡 hover）：优先显示，清除后回落到选中态。
  let previewTarget: Element | null = null
  let previewSelector: string | null = null
  // 钉选气泡与其跟踪的元素（含选择器，用于 body 重建后重新绑定）。
  let pinTargets: Array<{ pin: HTMLElement; target: Element; selector: string }> = []
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

  // 元素脱离文档后按选择器重新绑定；无法重绑时返回 null。
  const reResolveTarget = (element: Element | null, selector: string): Element | null => {
    if (element?.isConnected) return element
    return doc.querySelector(selector)
  }

  const positionPins = (): void => {
    for (const entry of pinTargets) {
      const target = reResolveTarget(entry.target, entry.selector)
      if (!target) continue
      entry.target = target

      const position = toLayerPosition(target)
      // 目标折叠或隐藏时保留气泡原位，避免全部挤到左上角。
      if (isDegeneratePosition(position)) continue
      entry.pin.style.left = `${position.left}px`
      entry.pin.style.top = `${position.top}px`
    }
  }

  // 编辑器跟随锚点元素，元信息中的尺寸同步刷新。
  const positionEditor = (): void => {
    if (!editorElement || !activeRequest) return

    // body 被重建后原锚点已脱离文档：按选择器重新定位，避免尺寸信息与位置失效。
    const anchor = reResolveTarget(activeRequest.anchor, activeRequest.selector)
    activeRequest.anchor = (anchor as HTMLElement | null) ?? null

    // 编辑器打开期间选中态跟随重新绑定后的锚点。
    if (anchor) {
      selectionTarget = anchor
      selectionSelector = activeRequest.selector
    }

    const position = anchor ? toLayerPosition(anchor) : null
    if (position && !isDegeneratePosition(position)) {
      if (editorSizeLabel) {
        editorSizeLabel.textContent = `${Math.round(position.width)}×${Math.round(position.height)}`
      }

      const viewportHeight = doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 0
      const viewportWidth = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0
      const editorTop =
        viewportHeight > 0 &&
        position.top + position.height + 8 + EDITOR_ESTIMATED_HEIGHT > viewportHeight
          ? Math.max(8, position.top - EDITOR_ESTIMATED_HEIGHT - 8)
          : position.top + position.height + 8
      const editorLeft =
        viewportWidth > 0
          ? Math.min(position.left, Math.max(0, viewportWidth - EDITOR_WIDTH - 8))
          : position.left

      editorElement.style.left = `${editorLeft}px`
      editorElement.style.top = `${editorTop}px`
      editorPositioned = true
      return
    }

    // 锚点被折叠 / 隐藏 / 不可解析：尺寸标记不可用。
    if (editorSizeLabel) {
      editorSizeLabel.textContent = "--"
    }
    if (!editorPositioned && activeRequest.anchorPoint) {
      // 首帧就退化时用点击点兜底，避免输入框落到左上角。
      editorElement.style.left = `${activeRequest.anchorPoint.left}px`
      editorElement.style.top = `${activeRequest.anchorPoint.top}px`
      editorPositioned = true
    }
  }

  // 全量重排：目标尺寸变化后统一校正选中框、气泡与编辑器。
  const syncPositions = (): void => {
    renderBox()
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
    const box = resolveBox()
    if (box) targets.add(box.target)
    for (const entry of pinTargets) targets.add(entry.target)
    if (activeRequest?.anchor) targets.add(activeRequest.anchor)
    for (const target of targets) resizeObserver.observe(target)

    if (doc.body) resizeObserver.observe(doc.body)
    if (doc.documentElement) resizeObserver.observe(doc.documentElement)
  }

  // 选中框当前应显示的目标与形态：面板预览 > 选中态 > 悬停态。
  const resolveBox = (): { target: Element; mode: AnnotationBoxMode } | null => {
    if (previewSelector) {
      previewTarget = reResolveTarget(previewTarget, previewSelector)
      if (previewTarget) return { target: previewTarget, mode: "hover" }
    }
    if (selectionSelector) {
      selectionTarget = reResolveTarget(selectionTarget, selectionSelector)
      if (selectionTarget) return { target: selectionTarget, mode: "selection" }
    }
    return hoverTarget?.isConnected ? { target: hoverTarget, mode: "hover" } : null
  }

  // 选中框配色：选中态用独立颜色与悬停区分。
  const applyBoxStyle = (mode: AnnotationBoxMode): void => {
    highlightBox.setAttribute("data-annotation-highlight-state", mode)
    if (mode === "selection") {
      highlightBox.style.border = `2px solid ${SELECTION_COLOR}`
      highlightBox.style.backgroundColor = SELECTION_FILL
      return
    }
    highlightBox.style.border = `2px solid ${ACCENT_COLOR}`
    highlightBox.style.backgroundColor = HOVER_FILL
  }

  // 绘制选中框：无目标或无面积时隐藏（避免只剩一个边框点）。
  const renderBox = (): void => {
    const box = resolveBox()
    if (!box) {
      highlightBox.style.display = "none"
      return
    }
    const position = toLayerPosition(box.target)
    if (isDegeneratePosition(position)) {
      highlightBox.style.display = "none"
      return
    }
    applyBoxStyle(box.mode)
    showHighlightAt(position)
  }

  // 解除选中态与预览态，选中框随之隐藏。
  const clearSelection = (): void => {
    selectionTarget = null
    selectionSelector = null
    previewTarget = null
    previewSelector = null
    renderBox()
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
      : `1px solid ${options.strong ? SELECTION_COLOR : BORDER_COLOR}`
    button.style.backgroundColor = options.icon
      ? "transparent"
      : options.strong
        ? SELECTION_COLOR
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
    editorPositioned = false
    // 选中框保持显示：仅「点击空白」或「选中其他元素」才会解除。
    observeTargets()
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
    info.style.color = SELECTION_COLOR
    info.style.backgroundColor = SELECTION_FILL
    info.style.border = "1px solid rgba(56, 189, 248, 0.35)"
    info.style.borderRadius = "4px"

    const infoName = doc.createElement("span")
    infoName.textContent = request.description || request.selector
    infoName.style.overflow = "hidden"
    infoName.style.textOverflow = "ellipsis"
    infoName.style.whiteSpace = "nowrap"
    info.appendChild(infoName)

    const infoSize = doc.createElement("span")
    infoSize.setAttribute("data-annotation-editor-size", "true")
    infoSize.style.color = "rgba(56, 189, 248, 0.8)"
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
    box.style.border = `1px solid ${SELECTION_COLOR}`
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
    // 进入选中态：选中框常驻在该元素上，关闭输入框后依然保留。
    selectionTarget = request.anchor
    selectionSelector = request.selector
    previewTarget = null
    previewSelector = null
    renderBox()
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
      pin.addEventListener("mouseenter", () => {
        // 气泡悬停作为预览态：优先显示该元素，移出后回落到选中态。
        previewSelector = annotation.selector
        previewTarget = target
        renderBox()
      })
      pin.addEventListener("mouseleave", () => {
        previewSelector = null
        previewTarget = null
        renderBox()
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
      pinTargets.push({ pin, target, selector: annotation.selector })
    }

    positionPins()
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
      hoverTarget =
        !element || element === doc.body || element === doc.documentElement ? null : element
      // 已有选中态时悬停不改变选中框。
      if (selectionSelector) return
      renderBox()
    },
    highlight: (selector: string | null): void => {
      previewSelector = selector
      previewTarget = null
      renderBox()
      observeTargets()
    },
    clearSelection,
    isAttachedTo: (target: Document): boolean =>
      target === doc && (doc.body?.contains(container) ?? false),
    destroy: (): void => {
      destroyed = true
      closeEditor()
      resizeObserver?.disconnect()
      pinTargets = []
      selectionTarget = null
      selectionSelector = null
      hoverTarget = null
      previewTarget = null
      previewSelector = null
      if (container.parentNode) container.parentNode.removeChild(container)
    },
  }
}

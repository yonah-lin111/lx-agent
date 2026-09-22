// 画布批注浮层：在 iframe 文档内注入钉选气泡、高亮框与批注输入浮层。
// 浮层属于预览沙箱的一部分，无法使用应用 CSS Token（与 sandbox guard 同级），配色沿用画布强调色常量。

import type { DesignAnnotation } from "@/pages/front-design/types"
import {
  type AnnotationEditorTheme,
  FALLBACK_EDITOR_THEME,
} from "@/pages/front-design/utils/annotationEditorTheme"
import type { ElementStyleKey, ElementStyleSummary } from "@/pages/front-design/utils/elementStyles"
import { summarizeElementStyles } from "@/pages/front-design/utils/elementStyles"

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

// 浮层文案，由父层 t() 注入。
export interface AnnotationLayerLabels {
  placeholder: string
  confirm: string
  remove: string
  emptyHint: string
  close: string
  // 元素样式摘要行标签。
  styleLabels: Record<ElementStyleKey, string>
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
  // 当前是否存在选中元素。
  hasSelection: () => boolean
  // 解除选中态与预览态（点击画布空白时调用）。
  clearSelection: () => void
  // 应用主题变化时刷新浮层样式。
  applyTheme: (theme: AnnotationEditorTheme) => void
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

// 生成浮层样式表：输入框几何与配色全部取自应用主题（像素主题下自动获得直角/浮雕/马赛克底纹）。
const buildEditorStyle = (theme: AnnotationEditorTheme): string => `
#${ANNOTATION_LAYER_ID} .lx-ann-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
#${ANNOTATION_LAYER_ID} .lx-ann-info { display: flex; align-items: center; gap: 4px; min-width: 0; padding: 1px 6px; font-family: ${theme.chipFontFamily}; color: ${SELECTION_COLOR}; background-color: ${SELECTION_FILL}; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: ${theme.borderRadius}; }
#${ANNOTATION_LAYER_ID} .lx-ann-size { color: rgba(56, 189, 248, 0.8); }
#${ANNOTATION_LAYER_ID} .lx-ann-styles { display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px; padding: 4px 6px; border: 1px solid rgba(56, 189, 248, 0.18); border-radius: ${theme.borderRadius}; background-color: rgba(0, 0, 0, 0.28); }
#${ANNOTATION_LAYER_ID} .lx-ann-style-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
#${ANNOTATION_LAYER_ID} .lx-ann-style-label { flex-shrink: 0; width: 40px; color: ${theme.mutedColor}; }
#${ANNOTATION_LAYER_ID} .lx-ann-style-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${theme.color}; font-family: ${theme.chipFontFamily}; }
#${ANNOTATION_LAYER_ID} .lx-ann-style-swatch { flex-shrink: 0; width: 9px; height: 9px; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 2px; }
#${ANNOTATION_LAYER_ID} .lx-ann-box { box-sizing: border-box; padding: 8px 10px; border: ${theme.borderWidth} ${theme.borderStyle} ${theme.borderColor}; border-radius: ${theme.borderRadius}; background-color: ${theme.backgroundColor}; font-family: ${theme.fontFamily}; box-shadow: ${theme.boxShadow}; transition: border-color 150ms ease, box-shadow 150ms ease; }
${theme.backgroundImage ? `#${ANNOTATION_LAYER_ID} .lx-ann-box { background-image: ${theme.backgroundImage}; background-repeat: ${theme.backgroundRepeat}; image-rendering: ${theme.imageRendering}; }` : ""}
#${ANNOTATION_LAYER_ID} .lx-ann-box:focus-within { border-color: ${theme.borderColorStrong}; box-shadow: ${theme.boxShadow}, 0 0 0 1px rgba(255, 255, 255, 0.06); }
#${ANNOTATION_LAYER_ID} .lx-ann-box--invalid { border-color: #f43f5e !important; }
#${ANNOTATION_LAYER_ID} .lx-ann-textarea { width: 100%; height: 52px; resize: none; box-sizing: border-box; padding: 0; border: none; outline: none; background: transparent; color: ${theme.color}; font-family: inherit; }
#${ANNOTATION_LAYER_ID} .lx-ann-textarea::placeholder { color: ${theme.placeholderColor}; }
#${ANNOTATION_LAYER_ID} .lx-ann-hint { margin-top: 4px; color: #fb7185; }
#${ANNOTATION_LAYER_ID} .lx-ann-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding-top: 4px; }
#${ANNOTATION_LAYER_ID} .lx-ann-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: ${theme.buttonBorderWidth} solid ${theme.buttonBorderColor}; border-radius: ${theme.buttonRadius}; background: transparent; color: ${theme.mutedColor}; cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
#${ANNOTATION_LAYER_ID} .lx-ann-btn:hover { background: rgba(255, 255, 255, 0.1); color: ${theme.color}; }
#${ANNOTATION_LAYER_ID} .lx-ann-btn--danger { color: #fda4af; }
#${ANNOTATION_LAYER_ID} .lx-ann-btn--danger:hover { background: rgba(244, 63, 94, 0.14); color: #fb7185; }
#${ANNOTATION_LAYER_ID} .lx-ann-btn--primary { background-color: #ffffff; color: #000000; box-shadow: ${theme.buttonShadow}; }
#${ANNOTATION_LAYER_ID} .lx-ann-btn--primary:hover { background-color: rgba(255, 255, 255, 0.9); color: #000000; }
`

/**
 * 创建批注图层：容器挂载在 body，钉选气泡与编辑器按文档坐标绝对定位，滚动天然跟随；
 * 目标元素尺寸变化（内容增高、响应式重排）通过 ResizeObserver 实时重排标记与编辑器。
 */
export const createAnnotationLayer = (
  doc: Document,
  callbacks: AnnotationLayerCallbacks,
  theme: AnnotationEditorTheme = FALLBACK_EDITOR_THEME,
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

  // 双框：粉色悬停/预览框始终跟随鼠标，蓝色选中框常驻在选中元素上。
  const createBox = (attribute: string, border: string, fill: string): HTMLElement => {
    const box = doc.createElement("div")
    box.setAttribute(attribute, "true")
    box.style.position = "absolute"
    box.style.display = "none"
    box.style.border = border
    box.style.backgroundColor = fill
    box.style.borderRadius = "4px"
    box.style.boxSizing = "border-box"
    box.style.pointerEvents = "none"
    container.appendChild(box)
    return box
  }

  // 浮层样式表：内联样式无法覆盖 ::placeholder / :focus-within / :hover，且主题值需要整体替换。
  const styleElement = doc.createElement("style")
  const applyThemeStyles = (): void => {
    styleElement.textContent = buildEditorStyle(currentTheme)
  }
  let currentTheme = theme
  applyThemeStyles()
  container.appendChild(styleElement)

  const hoverBox = createBox("data-annotation-hover", `2px solid ${ACCENT_COLOR}`, HOVER_FILL)
  const selectionBox = createBox(
    "data-annotation-highlight",
    `2px solid ${SELECTION_COLOR}`,
    SELECTION_FILL,
  )

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
  let editorBox: HTMLElement | null = null
  // 样式摘要块与其对应的锚点元素（锚点被重建后需要刷新）。
  let editorStylesBlock: HTMLElement | null = null
  let styledAnchor: Element | null = null
  let activeRequest: AnnotationEditorRequest | null = null
  // 编辑器是否已按有效锚点定位过：定位过之后退化只保留原位，未定位过才用点击点兜底。
  let editorPositioned = false
  // 图层是否已销毁：销毁后不再观察任何元素。
  let destroyed = false
  // 选中态（蓝色选中框）：点击元素后常驻，直到点击空白或选中其他元素。
  let selectionTarget: Element | null = null
  let selectionSelector: string | null = null
  // 悬停态（粉色悬停框）：始终跟随鼠标。
  let hoverTarget: Element | null = null
  // 面板预览态（面板条目 / 气泡 hover）：复用悬停框显示。
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
    styleLabels: {
      padding: "",
      margin: "",
      font: "",
      color: "",
      background: "",
      radius: "",
      border: "",
    },
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

      // 锚点被 body 重建替换后，样式摘要跟随新元素刷新。
      if (anchor && anchor !== styledAnchor) {
        mountStylesBlock(anchor, currentLabels.styleLabels)
      }

      const viewportHeight = doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 0
      const viewportWidth = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0
      // 优先使用实测高度（含样式摘要块），取不到时回退估算值。
      const editorHeight = editorElement.offsetHeight || EDITOR_ESTIMATED_HEIGHT
      const editorTop =
        viewportHeight > 0 && position.top + position.height + 8 + editorHeight > viewportHeight
          ? Math.max(8, position.top - editorHeight - 8)
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
    renderBoxes()
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
    const hoverBoxTarget = resolveHoverTarget()
    if (hoverBoxTarget) targets.add(hoverBoxTarget)
    const selectionBoxTarget = resolveSelectionTarget()
    if (selectionBoxTarget) targets.add(selectionBoxTarget)
    for (const entry of pinTargets) targets.add(entry.target)
    if (activeRequest?.anchor) targets.add(activeRequest.anchor)
    for (const target of targets) resizeObserver.observe(target)

    if (doc.body) resizeObserver.observe(doc.body)
    if (doc.documentElement) resizeObserver.observe(doc.documentElement)
  }

  // 选中框目标：点击后常驻，直到被清除或元素不可解析。
  const resolveSelectionTarget = (): Element | null => {
    if (!selectionSelector) return null
    selectionTarget = reResolveTarget(selectionTarget, selectionSelector)
    return selectionTarget
  }

  // 悬停框目标：面板 / 气泡预览优先，其次是鼠标悬停的元素。
  const resolveHoverTarget = (): Element | null => {
    if (previewSelector) {
      previewTarget = reResolveTarget(previewTarget, previewSelector)
      if (previewTarget) return previewTarget
    }
    return hoverTarget?.isConnected ? hoverTarget : null
  }

  // 绘制单个框：无目标或无面积时隐藏（避免只剩一个边框点）。
  const positionBox = (box: HTMLElement, target: Element | null): void => {
    if (!target) {
      box.style.display = "none"
      return
    }
    const position = toLayerPosition(target)
    if (isDegeneratePosition(position)) {
      box.style.display = "none"
      return
    }
    box.style.display = "block"
    box.style.left = `${position.left}px`
    box.style.top = `${position.top}px`
    box.style.width = `${position.width}px`
    box.style.height = `${position.height}px`
  }

  const renderBoxes = (): void => {
    positionBox(hoverBox, resolveHoverTarget())
    positionBox(selectionBox, resolveSelectionTarget())
  }

  // 解除选中态与预览态，蓝色选中框随之隐藏。
  const clearSelection = (): void => {
    selectionTarget = null
    selectionSelector = null
    previewTarget = null
    previewSelector = null
    renderBoxes()
    observeTargets()
  }

  // lucide 图标 path：iframe 内无法使用 React 组件，沿用 lucide 同源 path 数据构建。
  const ICON_PATHS = {
    check: ["M20 6 9 17l-5-5"],
    close: ["M18 6 6 18", "m6 6 12 12"],
    trash: [
      "M10 11v6",
      "M14 11v6",
      "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
      "M3 6h18",
      "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
    ],
  } as const

  const SVG_NS = "http://www.w3.org/2000/svg"

  const buildIcon = (paths: readonly string[], size: number): SVGSVGElement => {
    const svg = doc.createElementNS(SVG_NS, "svg")
    svg.setAttribute("viewBox", "0 0 24 24")
    svg.setAttribute("width", String(size))
    svg.setAttribute("height", String(size))
    svg.setAttribute("fill", "none")
    svg.setAttribute("stroke", "currentColor")
    svg.setAttribute("stroke-width", "2")
    svg.setAttribute("stroke-linecap", "round")
    svg.setAttribute("stroke-linejoin", "round")
    for (const d of paths) {
      const path = doc.createElementNS(SVG_NS, "path")
      path.setAttribute("d", d)
      svg.appendChild(path)
    }
    return svg
  }

  // 圆形图标按钮：对齐 AgentInput 底栏（主操作白底黑图标，次要操作幽灵态）。
  const buildIconButton = (
    action: "remove" | "confirm" | "close",
    iconPaths: readonly string[],
    label: string,
    variant: "ghost" | "danger" | "primary",
    size: number,
    onClick: () => void,
  ): HTMLButtonElement => {
    const button = doc.createElement("button")
    button.type = "button"
    button.setAttribute("data-annotation-action", action)
    button.setAttribute("aria-label", label)
    button.className = `lx-ann-btn${variant === "ghost" ? "" : ` lx-ann-btn--${variant}`}`
    button.appendChild(buildIcon(iconPaths, size))
    button.addEventListener("click", (event) => {
      event.stopPropagation()
      onClick()
    })
    return button
  }

  // 样式摘要行顺序：间距 → 字体 → 颜色 → 圆角 → 边框。
  const STYLE_ROW_ORDER: ElementStyleKey[] = [
    "padding",
    "margin",
    "font",
    "color",
    "background",
    "radius",
    "border",
  ]

  // 构建元素样式摘要块：无有效行时返回 null。
  const buildStylesBlock = (
    anchor: Element | null,
    styleLabels: Record<ElementStyleKey, string>,
  ): HTMLElement | null => {
    if (!anchor) return null
    const summary: ElementStyleSummary = summarizeElementStyles(anchor)
    const rows = STYLE_ROW_ORDER.filter((key) => summary[key])
    if (rows.length === 0) return null

    const block = doc.createElement("div")
    block.setAttribute("data-annotation-editor-styles", "true")
    block.className = "lx-ann-styles"
    block.style.fontSize = "10px"

    for (const key of rows) {
      const row = doc.createElement("div")
      row.className = "lx-ann-style-row"

      // 颜色 / 背景行附色块，直观区分取色来源。
      if (key === "color" || key === "background") {
        const swatch = doc.createElement("span")
        swatch.className = "lx-ann-style-swatch"
        swatch.style.backgroundColor = summary[key] ?? "transparent"
        row.appendChild(swatch)
      }

      const label = doc.createElement("span")
      label.className = "lx-ann-style-label"
      label.textContent = styleLabels[key]

      const value = doc.createElement("span")
      value.className = "lx-ann-style-value"
      value.textContent = summary[key] ?? ""

      row.appendChild(label)
      row.appendChild(value)
      block.appendChild(row)
    }

    return block
  }

  // 挂载 / 刷新样式摘要块：插在 meta 行与输入框之间。
  const mountStylesBlock = (
    anchor: Element | null,
    styleLabels: Record<ElementStyleKey, string>,
  ): void => {
    if (!editorElement) return
    editorStylesBlock?.remove()
    editorStylesBlock = null
    styledAnchor = anchor
    const block = buildStylesBlock(anchor, styleLabels)
    if (!block) return
    editorStylesBlock = block
    editorElement.insertBefore(block, editorBox)
  }

  const closeEditor = (): void => {
    if (editorElement?.parentNode) {
      editorElement.parentNode.removeChild(editorElement)
    }
    editorElement = null
    editorTextarea = null
    editorHint = null
    editorSizeLabel = null
    editorBox = null
    editorStylesBlock = null
    styledAnchor = null
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
      editorBox?.classList.add("lx-ann-box--invalid")
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

    // 输入框上方：元素基本信息（描述 + 实时尺寸）。
    const meta = doc.createElement("div")
    meta.setAttribute("data-annotation-editor-meta", "true")
    meta.className = "lx-ann-meta"

    const info = doc.createElement("span")
    info.setAttribute("data-annotation-editor-info", "true")
    info.className = "lx-ann-info"
    info.style.fontSize = "11px"

    const infoName = doc.createElement("span")
    infoName.textContent = request.description || request.selector
    infoName.style.overflow = "hidden"
    infoName.style.textOverflow = "ellipsis"
    infoName.style.whiteSpace = "nowrap"
    info.appendChild(infoName)

    const infoSize = doc.createElement("span")
    infoSize.setAttribute("data-annotation-editor-size", "true")
    infoSize.className = "lx-ann-size"
    info.appendChild(infoSize)
    meta.appendChild(info)
    editor.appendChild(meta)

    // 输入框本体：对齐 AgentInput 底栏（深色圆角容器 + 无边框文本区 + 底部圆形操作按钮）。
    const box = doc.createElement("div")
    box.setAttribute("data-annotation-editor-box", "true")
    box.className = "lx-ann-box"

    const textarea = doc.createElement("textarea")
    textarea.className = "lx-ann-textarea"
    textarea.value = request.comment
    textarea.placeholder = labels.placeholder
    textarea.style.fontSize = "12px"
    textarea.style.lineHeight = "18px"
    box.appendChild(textarea)

    const hint = doc.createElement("div")
    hint.setAttribute("data-annotation-editor-hint", "true")
    hint.className = "lx-ann-hint"
    hint.style.fontSize = "10px"
    hint.textContent = labels.emptyHint
    hint.style.visibility = "hidden"
    box.appendChild(hint)

    // 底部操作行：删除 → 关闭 → 确认。
    const actions = doc.createElement("div")
    actions.className = "lx-ann-actions"
    if (!request.isNew) {
      actions.appendChild(
        buildIconButton("remove", ICON_PATHS.trash, labels.remove, "danger", 14, () => {
          callbacks.onRemove(request.selector)
          closeEditor()
        }),
      )
    }
    actions.appendChild(
      buildIconButton("close", ICON_PATHS.close, labels.close, "ghost", 14, () => {
        closeEditor()
      }),
    )
    actions.appendChild(
      buildIconButton("confirm", ICON_PATHS.check, labels.confirm, "primary", 15, confirmEditor),
    )
    box.appendChild(actions)
    editor.appendChild(box)

    textarea.addEventListener("input", () => {
      box.classList.remove("lx-ann-box--invalid")
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
    editorBox = box
    currentLabels = labels
    // 元素样式摘要：让批注有具体数值依据（间距 / 字体 / 颜色 / 圆角 / 边框）。
    mountStylesBlock(request.anchor, labels.styleLabels)
    // 进入选中态：选中框常驻在该元素上，关闭输入框后依然保留。
    selectionTarget = request.anchor
    selectionSelector = request.selector
    previewTarget = null
    previewSelector = null
    renderBoxes()
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
        renderBoxes()
      })
      pin.addEventListener("mouseleave", () => {
        previewSelector = null
        previewTarget = null
        renderBoxes()
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
      // 悬停框始终跟手，与常驻的选中框互不干扰。
      hoverTarget =
        !element || element === doc.body || element === doc.documentElement ? null : element
      renderBoxes()
    },
    highlight: (selector: string | null): void => {
      previewSelector = selector
      previewTarget = null
      renderBoxes()
      observeTargets()
    },
    hasSelection: (): boolean => Boolean(selectionSelector),
    clearSelection,
    applyTheme: (next: AnnotationEditorTheme): void => {
      currentTheme = next
      applyThemeStyles()
    },
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

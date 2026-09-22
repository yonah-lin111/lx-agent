// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import type { DesignAnnotation } from "@/pages/front-design/types"
import { FALLBACK_EDITOR_THEME } from "@/pages/front-design/utils/annotationEditorTheme"
import {
  ANNOTATION_LAYER_ID,
  type AnnotationLayerLabels,
  createAnnotationLayer,
} from "@/pages/front-design/utils/annotationOverlay"

// ResizeObserver 桩：记录实例并允许手动触发回调。
class MockResizeObserver {
  static instances: MockResizeObserver[] = []

  callback: () => void
  observed = new Set<Element>()

  constructor(callback: () => void) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.observed.add(target)
  }

  unobserve(target: Element): void {
    this.observed.delete(target)
  }

  disconnect(): void {
    this.observed.clear()
  }

  trigger(): void {
    this.callback()
  }
}

const LABELS: AnnotationLayerLabels = {
  placeholder: "写下修改意见",
  confirm: "确认",
  remove: "删除",
  emptyHint: "批注内容不能为空",
  close: "关闭输入框",
  styleLabels: {
    padding: "内边距",
    margin: "外边距",
    font: "字体",
    color: "文字色",
    background: "背景色",
    radius: "圆角",
    border: "边框",
  },
}

// 合成文档没有 defaultView，无法走 testing-library 的 fireEvent，直接派发原生事件。
const dispatchClick = (element: Element): void => {
  element.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }))
}

const dispatchKey = (element: Element, key: string): void => {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
}

const dispatchInput = (textarea: HTMLTextAreaElement, value: string): void => {
  textarea.value = value
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

const createDoc = (body: string): Document => {
  const doc = document.implementation.createHTMLDocument("preview")
  doc.body.innerHTML = body
  return doc
}

const stubRect = (
  element: Element,
  rect: { left: number; top: number; width: number; height: number },
): void => {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => rect,
    }) as DOMRect
}

const createAnnotation = (overrides: Partial<DesignAnnotation> = {}): DesignAnnotation => ({
  id: "a1",
  selector: "#target",
  description: "button#target",
  comment: "改为高对比色",
  index: 1,
  createdAt: 0,
  ...overrides,
})

const setup = (body = "<main><button id='target'>Buy</button></main>") => {
  const doc = createDoc(body)
  const callbacks = { onSubmit: vi.fn(), onRemove: vi.fn() }
  const layer = createAnnotationLayer(doc, callbacks)
  return { doc, callbacks, layer }
}

describe("批注图层", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    MockResizeObserver.instances = []
  })

  it("图层归属判定：仅在同一文档且仍在 body 内时才可复用", () => {
    const { doc, layer } = setup()
    const otherDoc = createDoc("<main></main>")

    expect(layer.isAttachedTo(doc)).toBe(true)
    // iframe 文档被替换（srcDoc 加载）后必须重建，否则浮层会落在僵尸文档里
    expect(layer.isAttachedTo(otherDoc)).toBe(false)

    doc.body.innerHTML = "<main></main>"
    expect(layer.isAttachedTo(doc)).toBe(false)
  })

  it("渲染编号气泡，选择器无法命中时跳过", () => {
    const { doc, layer } = setup()
    layer.render(
      [createAnnotation(), createAnnotation({ id: "a2", selector: "#missing", index: 2 })],
      LABELS,
    )

    const pins = doc.querySelectorAll("[data-annotation-pin]")
    expect(pins).toHaveLength(1)
    expect(pins[0].textContent).toBe("1")
  })

  it("空内容确认被拒绝并提示，填写后提交并关闭编辑器", () => {
    const { doc, callbacks, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement

    layer.openEditor(
      {
        selector: "#target",
        description: "button#target",
        comment: "",
        isNew: true,
        anchor: target,
      },
      LABELS,
    )
    const editor = doc.querySelector("[data-annotation-editor]") as HTMLElement
    expect(editor).not.toBeNull()

    const box = editor.querySelector("[data-annotation-editor-box]") as HTMLElement
    const hint = editor.querySelector("[data-annotation-editor-hint]") as HTMLElement
    const confirm = editor.querySelector('[data-annotation-action="confirm"]') as Element
    dispatchClick(confirm)
    expect(callbacks.onSubmit).not.toHaveBeenCalled()
    expect(box.classList.contains("lx-ann-box--invalid")).toBe(true)
    expect(hint.style.visibility).toBe("visible")

    const textarea = editor.querySelector("textarea") as HTMLTextAreaElement
    dispatchInput(textarea, "改为高对比色")
    expect(box.classList.contains("lx-ann-box--invalid")).toBe(false)
    expect(hint.style.visibility).toBe("hidden")
    dispatchClick(confirm)

    expect(callbacks.onSubmit).toHaveBeenCalledWith(
      "#target",
      "button#target",
      "改为高对比色",
      true,
    )
    expect(doc.querySelector("[data-annotation-editor]")).toBeNull()
    expect(layer.isEditorOpen()).toBe(false)
  })

  it("输入框上方展示元素信息与尺寸，支持关闭按钮退出", () => {
    const { doc, callbacks, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement
    stubRect(target, { left: 24, top: 40, width: 120, height: 36 })

    layer.openEditor(
      {
        selector: "#target",
        description: "button#target",
        comment: "草稿",
        isNew: true,
        anchor: target,
      },
      LABELS,
    )

    const meta = doc.querySelector("[data-annotation-editor-meta]") as HTMLElement
    const box = doc.querySelector("[data-annotation-editor-box]") as HTMLElement
    expect(meta.querySelector("[data-annotation-editor-info]")?.textContent).toBe(
      "button#target120×36",
    )
    // 基本信息在输入框上方
    expect(meta.compareDocumentPosition(box)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    // 容器样式对齐 AgentInput 底栏（主题值集中在注入样式表中）
    const styleText = (doc.querySelector("#lx-design-annotation-layer style") as HTMLStyleElement)
      ?.textContent
    expect(box.className).toContain("lx-ann-box")
    // 信息条、样式摘要与输入框共用同一实体表面（实心主题底色，避免被设计稿穿透）
    const infoChip = meta.querySelector("[data-annotation-editor-info]") as HTMLElement
    expect(infoChip.classList.contains("lx-ann-surface")).toBe(true)
    expect(box.classList.contains("lx-ann-surface")).toBe(true)
    expect(styleText).toContain("background-color: #2a2a2a")
    expect(styleText).toContain("border-radius: 6px")

    // 关闭按钮位于输入框底部（文本区之后），不再位于信息栏
    expect(meta.querySelector('[data-annotation-action="close"]')).toBeNull()
    const close = box.querySelector('[data-annotation-action="close"]') as Element
    expect(close.getAttribute("aria-label")).toBe("关闭输入框")
    const textareaElement = box.querySelector("textarea") as Element
    expect(textareaElement.compareDocumentPosition(close)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    // 主操作按钮为白底黑图标（对齐发送按钮）
    const confirmButton = box.querySelector('[data-annotation-action="confirm"]') as Element
    expect(confirmButton.className).toContain("lx-ann-btn--primary")
    dispatchClick(close)

    expect(layer.isEditorOpen()).toBe(false)
    expect(doc.querySelector("[data-annotation-editor]")).toBeNull()
    expect(callbacks.onSubmit).not.toHaveBeenCalled()
  })

  it("批注编辑器展示元素样式摘要，空值行跳过且色块与颜色值同源", () => {
    const { doc, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement
    stubRect(target, { left: 24, top: 40, width: 120, height: 36 })

    // 合成文档没有 defaultView：注入仅提供计算样式的假视图。
    const fakeStyle = {
      paddingTop: "8px",
      paddingRight: "16px",
      paddingBottom: "8px",
      paddingLeft: "16px",
      marginTop: "0px",
      marginRight: "0px",
      marginBottom: "0px",
      marginLeft: "0px",
      fontSize: "14px",
      lineHeight: "20px",
      fontWeight: "700",
      color: "rgb(17, 24, 39)",
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderTopWidth: "1px",
      borderTopStyle: "solid",
      borderTopColor: "rgb(229, 231, 235)",
      borderTopLeftRadius: "8px",
    }
    Object.defineProperty(doc, "defaultView", {
      value: { getComputedStyle: () => fakeStyle },
      configurable: true,
    })

    layer.openEditor(
      {
        selector: "#target",
        description: "button#target",
        comment: "",
        isNew: true,
        anchor: target,
      },
      LABELS,
    )

    const editor = doc.querySelector("[data-annotation-editor]") as HTMLElement
    const block = editor.querySelector("[data-annotation-editor-styles]") as HTMLElement
    expect(block).not.toBeNull()
    expect(block.classList.contains("lx-ann-surface")).toBe(true)

    const labels = Array.from(block.querySelectorAll(".lx-ann-style-label")).map(
      (node) => node.textContent,
    )
    const values = Array.from(block.querySelectorAll(".lx-ann-style-value")).map(
      (node) => node.textContent,
    )
    expect(labels).toEqual(["内边距", "字体", "文字色", "圆角", "边框"])
    expect(values).toEqual(["8px 16px", "14px/20px 700", "#111827", "8px", "1px solid #e5e7eb"])
    // 背景透明被跳过；色块只挂在颜色行上且与显示值同源
    expect(labels).not.toContain("背景色")
    expect(labels).not.toContain("外边距")
    const swatch = block.querySelector(".lx-ann-style-swatch") as HTMLElement
    expect(swatch.style.backgroundColor).toBe("rgb(17, 24, 39)")
  })

  it("Enter 确认、 ESC 取消，编辑态提供删除", () => {
    const { doc, callbacks, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement

    layer.openEditor(
      {
        selector: "#target",
        description: "button#target",
        comment: "旧批注",
        isNew: false,
        anchor: target,
      },
      LABELS,
    )
    const editor = doc.querySelector("[data-annotation-editor]") as HTMLElement

    dispatchClick(editor.querySelector('[data-annotation-action="remove"]') as Element)
    expect(callbacks.onRemove).toHaveBeenCalledWith("#target")
    expect(layer.isEditorOpen()).toBe(false)

    layer.openEditor(
      {
        selector: "#target",
        description: "button#target",
        comment: "",
        isNew: true,
        anchor: target,
      },
      LABELS,
    )
    const reopened = doc.querySelector("[data-annotation-editor]") as HTMLElement
    const textarea = reopened.querySelector("textarea") as HTMLTextAreaElement
    dispatchKey(textarea, "Escape")
    expect(layer.isEditorOpen()).toBe(false)

    dispatchKey(textarea, "Enter")
    expect(callbacks.onSubmit).not.toHaveBeenCalled()
  })

  it("目标尺寸变化时选中框、气泡与输入框尺寸自适应重排", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver)
    const { doc, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement
    let rect = { left: 10, top: 20, width: 100, height: 40 }
    stubRect(target, rect)

    layer.render([createAnnotation()], LABELS)
    layer.highlight("#target")

    const hoverBox = doc.querySelector("[data-annotation-hover]") as HTMLElement
    const pin = doc.querySelector("[data-annotation-pin]") as HTMLElement
    expect(hoverBox.style.height).toBe("40px")
    expect(pin.style.top).toBe("20px")

    // 容器高度变化（内容增多 / 响应式重排）后由 ResizeObserver 触发重排
    rect = { left: 10, top: 20, width: 100, height: 260 }
    stubRect(target, rect)
    MockResizeObserver.instances.at(-1)?.trigger()

    expect(hoverBox.style.height).toBe("260px")
    expect(pin.style.top).toBe("20px")

    // 选中后：选中框与输入框尺寸信息同步刷新
    layer.openEditor(
      {
        selector: "#target",
        description: "button#target",
        comment: "",
        isNew: true,
        anchor: target,
      },
      LABELS,
    )
    const selectionBox = doc.querySelector("[data-annotation-highlight]") as HTMLElement
    expect(selectionBox.style.height).toBe("260px")
    expect(doc.querySelector("[data-annotation-editor-size]")?.textContent).toBe("100×260")
  })

  it("选中元素后选中框常驻，仅在点击空白或选中其他元素时消失", () => {
    const { doc, layer } = setup(
      "<main><button id='target'>Buy</button><span id='other'>Other</span></main>",
    )
    const target = doc.getElementById("target") as HTMLElement
    const other = doc.getElementById("other") as HTMLElement
    stubRect(target, { left: 10, top: 20, width: 100, height: 40 })
    stubRect(other, { left: 200, top: 300, width: 50, height: 20 })

    layer.openEditor(
      {
        selector: "#target",
        description: "button#target",
        comment: "",
        isNew: true,
        anchor: target,
      },
      LABELS,
    )

    const highlight = doc.querySelector("[data-annotation-highlight]") as HTMLElement
    expect(highlight.style.display).toBe("block")
    expect(highlight.style.left).toBe("10px")
    expect(highlight.style.height).toBe("40px")

    // 悬停其它元素：粉色悬停框跟手，蓝色选中框不动
    layer.showHover(other)
    const hoverBox = doc.querySelector("[data-annotation-hover]") as HTMLElement
    expect(hoverBox.style.display).toBe("block")
    expect(hoverBox.style.left).toBe("200px")
    expect(highlight.style.display).toBe("block")
    expect(highlight.style.left).toBe("10px")
    expect(highlight.style.height).toBe("40px")

    layer.showHover(null)
    expect(hoverBox.style.display).toBe("none")
    expect(highlight.style.left).toBe("10px")

    // 关闭输入框后选中框仍常驻
    layer.closeEditor()
    expect(highlight.style.display).toBe("block")
    expect(highlight.style.left).toBe("10px")

    // 选中其他元素：选中框移动到新元素
    layer.openEditor(
      {
        selector: "#other",
        description: "span#other",
        comment: "",
        isNew: true,
        anchor: other,
      },
      LABELS,
    )
    expect(highlight.style.left).toBe("200px")
    expect(highlight.style.top).toBe("300px")
    // 输入框同步移动到新选择的位置
    const editor = doc.querySelector("[data-annotation-editor]") as HTMLElement
    expect(editor.style.left).toBe("200px")
    expect(editor.style.top).toBe("328px")

    // 点击空白：解除选中，选中框消失
    layer.clearSelection()
    expect(highlight.style.display).toBe("none")
  })

  it("悬停框与选中框使用不同配色且可同时显示", () => {
    const { doc, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement
    stubRect(target, { left: 10, top: 20, width: 100, height: 40 })

    const hoverBox = doc.querySelector("[data-annotation-hover]") as HTMLElement
    const selectionBox = doc.querySelector("[data-annotation-highlight]") as HTMLElement
    expect(/ec4899|rgb\(236,\s*72,\s*153\)/i.test(hoverBox.style.border)).toBe(true)
    expect(/38bdf8|rgb\(56,\s*189,\s*248\)/i.test(selectionBox.style.border)).toBe(true)

    // 选中后用鼠标划过其他元素：两框同时显示，互不干扰
    layer.openEditor(
      {
        selector: "#target",
        description: "button#target",
        comment: "",
        isNew: true,
        anchor: target,
      },
      LABELS,
    )
    layer.showHover(target)
    expect(selectionBox.style.display).toBe("block")
    expect(selectionBox.style.left).toBe("10px")
    expect(hoverBox.style.display).toBe("block")

    // 关闭输入框后选中框保持常驻
    layer.closeEditor()
    expect(selectionBox.style.display).toBe("block")
    expect(selectionBox.style.left).toBe("10px")
  })

  it("面板预览显示在悬停框上，不影响选中框", () => {
    const { doc, layer } = setup(
      "<main><button id='target'>Buy</button><span id='other'>Other</span></main>",
    )
    const target = doc.getElementById("target") as HTMLElement
    const other = doc.getElementById("other") as HTMLElement
    stubRect(target, { left: 10, top: 20, width: 100, height: 40 })
    stubRect(other, { left: 200, top: 300, width: 50, height: 20 })

    layer.openEditor(
      {
        selector: "#target",
        description: "button#target",
        comment: "",
        isNew: true,
        anchor: target,
      },
      LABELS,
    )
    layer.closeEditor()

    const hoverBox = doc.querySelector("[data-annotation-hover]") as HTMLElement
    const selectionBox = doc.querySelector("[data-annotation-highlight]") as HTMLElement

    layer.highlight("#other")
    expect(hoverBox.style.left).toBe("200px")
    expect(selectionBox.style.left).toBe("10px")

    layer.highlight(null)
    expect(hoverBox.style.display).toBe("none")
    expect(selectionBox.style.left).toBe("10px")
    expect(selectionBox.style.display).toBe("block")
  })

  it("锚点脱离文档后按选择器重新绑定气泡与输入框", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver)
    const { doc, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement
    stubRect(target, { left: 10, top: 20, width: 100, height: 40 })

    layer.render([createAnnotation()], LABELS)
    layer.openEditor(
      {
        selector: "#target",
        description: "button#target",
        comment: "",
        isNew: true,
        anchor: target,
      },
      LABELS,
    )

    const container = doc.getElementById(ANNOTATION_LAYER_ID) as HTMLElement
    const pin = doc.querySelector("[data-annotation-pin]") as HTMLElement
    expect(pin.style.top).toBe("20px")

    // body 被重建：旧节点全部替换（useDesignPreview 会保留并回挂批注图层）
    doc.body.innerHTML = "<main><button id='target'>Buy</button></main>"
    doc.body.appendChild(container)
    stubRect(doc.getElementById("target") as HTMLElement, {
      left: 30,
      top: 200,
      width: 120,
      height: 48,
    })
    MockResizeObserver.instances.at(-1)?.trigger()

    expect(pin.style.left).toBe("30px")
    expect(pin.style.top).toBe("200px")
    expect(doc.querySelector("[data-annotation-editor-size]")?.textContent).toBe("120×48")
  })

  it("锚点完全不可解析时输入框保留位置并标记尺寸不可用", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver)
    const { doc, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement
    stubRect(target, { left: 24, top: 40, width: 120, height: 36 })

    layer.openEditor(
      {
        selector: "#target",
        description: "button#target",
        comment: "",
        isNew: true,
        anchor: target,
      },
      LABELS,
    )

    const container = doc.getElementById(ANNOTATION_LAYER_ID) as HTMLElement
    const editor = doc.querySelector("[data-annotation-editor]") as HTMLElement
    const editorLeft = editor.style.left
    const editorTop = editor.style.top
    expect(doc.querySelector("[data-annotation-editor-size]")?.textContent).toBe("120×36")

    doc.body.innerHTML = "<main><span>gone</span></main>"
    doc.body.appendChild(container)
    MockResizeObserver.instances.at(-1)?.trigger()

    // 不把输入框挪到左上角，只把尺寸标记为不可用
    expect(editor.style.left).toBe(editorLeft)
    expect(editor.style.top).toBe(editorTop)
    expect(doc.querySelector("[data-annotation-editor-size]")?.textContent).toBe("--")
  })

  it("目标尺寸退化为 0×0 时气泡保留原位", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver)
    const { doc, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement
    stubRect(target, { left: 10, top: 20, width: 100, height: 40 })

    layer.render([createAnnotation()], LABELS)
    const pin = doc.querySelector("[data-annotation-pin]") as HTMLElement
    expect(pin.style.top).toBe("20px")

    stubRect(target, { left: 0, top: 0, width: 0, height: 0 })
    MockResizeObserver.instances.at(-1)?.trigger()

    expect(pin.style.left).toBe("10px")
    expect(pin.style.top).toBe("20px")
  })

  it("首帧锚点退化时输入框用点击点兜底，不贴左上角", () => {
    const { doc, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement
    stubRect(target, { left: 0, top: 0, width: 0, height: 0 })

    layer.openEditor(
      {
        selector: "#target",
        description: "p",
        comment: "",
        isNew: true,
        anchor: target,
        anchorPoint: { left: 320, top: 180 },
      },
      LABELS,
    )

    const editor = doc.querySelector("[data-annotation-editor]") as HTMLElement
    expect(editor.style.left).toBe("320px")
    expect(editor.style.top).toBe("180px")
    expect(doc.querySelector("[data-annotation-editor-size]")?.textContent).toBe("--")
  })

  it("输入框样式随主题变化：像素主题直角+浮雕+马赛克，切回默认主题恢复", () => {
    const doc = createDoc("<main><button id='target'>Buy</button></main>")
    const callbacks = { onSubmit: vi.fn(), onRemove: vi.fn() }
    const layer = createAnnotationLayer(doc, callbacks, {
      ...FALLBACK_EDITOR_THEME,
      borderWidth: "2px",
      borderColor: "rgb(0, 0, 0)",
      borderRadius: "0px",
      backgroundColor: "rgb(34, 34, 50)",
      backgroundImage: "url(mosaic.svg)",
      imageRendering: "pixelated",
      buttonBorderWidth: "2px",
      buttonBorderColor: "rgb(0, 0, 0)",
      buttonRadius: "0px",
    })

    const styleElement = doc.querySelector("#lx-design-annotation-layer style") as HTMLStyleElement
    const pixelStyle = styleElement.textContent ?? ""
    expect(pixelStyle).toContain("border-radius: 0px")
    expect(pixelStyle).toContain("background-image: url(mosaic.svg)")
    expect(pixelStyle).toContain("image-rendering: pixelated")
    expect(pixelStyle).toContain("border: 2px solid rgb(0, 0, 0)")

    layer.applyTheme(FALLBACK_EDITOR_THEME)
    const defaultStyle = styleElement.textContent ?? ""
    expect(defaultStyle).toContain("border-radius: 6px")
    expect(defaultStyle).not.toContain("background-image")
  })

  it("悬停框按悬停目标切换显示，无面积元素不画框", () => {
    const { doc, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement
    stubRect(target, { left: 12, top: 34, width: 80, height: 24 })
    const hoverBox = doc.querySelector("[data-annotation-hover]") as HTMLElement

    layer.showHover(target)
    expect(hoverBox.style.display).toBe("block")
    expect(hoverBox.style.left).toBe("12px")

    layer.showHover(null)
    expect(hoverBox.style.display).toBe("none")

    // 空标签 / 被隐藏元素没有可框选区域
    stubRect(target, { left: 0, top: 0, width: 0, height: 0 })
    layer.showHover(target)
    expect(hoverBox.style.display).toBe("none")
  })

  it("图层容器挂在 body 且不拦截指针事件", () => {
    const { doc } = setup()
    const container = doc.getElementById(ANNOTATION_LAYER_ID) as HTMLElement
    expect(container).not.toBeNull()
    expect(container.parentElement).toBe(doc.body)
    expect(container.style.pointerEvents).toBe("none")
  })

  it("销毁后断开关联并移除容器", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver)
    const { doc, layer } = setup()
    layer.render([createAnnotation()], LABELS)

    const observer = MockResizeObserver.instances.at(-1)
    expect(observer?.observed.size).toBeGreaterThan(0)

    layer.destroy()

    expect(observer?.observed.size).toBe(0)
    expect(doc.getElementById(ANNOTATION_LAYER_ID)).toBeNull()
  })
})

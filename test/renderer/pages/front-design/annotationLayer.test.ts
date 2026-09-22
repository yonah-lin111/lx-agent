// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import type { DesignAnnotation } from "@/pages/front-design/types"
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

    const confirm = editor.querySelector('[data-annotation-action="confirm"]') as Element
    dispatchClick(confirm)
    expect(callbacks.onSubmit).not.toHaveBeenCalled()
    expect(editor.querySelector("textarea")?.style.borderColor).toBe("rgb(244, 63, 94)")

    const textarea = editor.querySelector("textarea") as HTMLTextAreaElement
    dispatchInput(textarea, "改为高对比色")
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

    const close = meta.querySelector('[data-annotation-action="close"]') as Element
    expect(close.getAttribute("aria-label")).toBe("关闭输入框")
    dispatchClick(close)

    expect(layer.isEditorOpen()).toBe(false)
    expect(doc.querySelector("[data-annotation-editor]")).toBeNull()
    expect(callbacks.onSubmit).not.toHaveBeenCalled()
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

  it("目标尺寸变化时高亮框、气泡与输入框尺寸自适应重排", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver)
    const { doc, layer } = setup()
    const target = doc.getElementById("target") as HTMLElement
    let rect = { left: 10, top: 20, width: 100, height: 40 }
    stubRect(target, rect)

    layer.render([createAnnotation()], LABELS)
    layer.highlight("#target")

    const highlight = doc.querySelector("[data-annotation-highlight]") as HTMLElement
    const pin = doc.querySelector("[data-annotation-pin]") as HTMLElement
    expect(highlight.style.height).toBe("40px")
    expect(pin.style.top).toBe("20px")

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
    expect(doc.querySelector("[data-annotation-editor-size]")?.textContent).toBe("100×40")

    // 容器高度变化（内容增多 / 响应式重排）后由 ResizeObserver 触发重排
    rect = { left: 10, top: 20, width: 100, height: 260 }
    stubRect(target, rect)
    MockResizeObserver.instances.at(-1)?.trigger()

    expect(highlight.style.height).toBe("260px")
    expect(doc.querySelector("[data-annotation-editor-size]")?.textContent).toBe("100×260")
  })

  it("选中元素后选中框保持显示，直到关闭输入框", () => {
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

    // 悬停其它元素、移出画布或面板 hover 都不改变已锁定的选中框
    layer.showHover(other)
    layer.showHover(null)
    layer.highlight("#other")
    expect(highlight.style.display).toBe("block")
    expect(highlight.style.left).toBe("10px")
    expect(highlight.style.height).toBe("40px")

    layer.closeEditor()
    expect(highlight.style.display).toBe("none")
  })

  it("悬停与选中高亮按选择器切换显示", () => {
    const { doc, layer } = setup()
    const highlight = doc.querySelector("[data-annotation-highlight]") as HTMLElement

    layer.highlight("#target")
    expect(highlight.style.display).toBe("block")

    layer.highlight("#missing")
    expect(highlight.style.display).toBe("none")

    layer.showHover(doc.getElementById("target") as HTMLElement)
    expect(highlight.style.display).toBe("block")

    layer.showHover(null)
    expect(highlight.style.display).toBe("none")
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

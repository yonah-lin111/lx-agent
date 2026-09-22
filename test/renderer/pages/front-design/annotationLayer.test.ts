// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest"
import type { DesignAnnotation } from "@/pages/front-design/types"
import {
  ANNOTATION_LAYER_ID,
  type AnnotationLayerLabels,
  createAnnotationLayer,
} from "@/pages/front-design/utils/annotationOverlay"

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

const LABELS: AnnotationLayerLabels = {
  placeholder: "写下修改意见",
  confirm: "确认",
  cancel: "取消",
  remove: "删除",
  emptyHint: "批注内容不能为空",
}

const createDoc = (body: string): Document => {
  const doc = document.implementation.createHTMLDocument("preview")
  doc.body.innerHTML = body
  return doc
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
})

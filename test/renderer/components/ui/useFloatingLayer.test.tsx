// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type React from "react"
import { useContext, useEffect, useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  TooltipLayerContext,
  useFloatingLayer,
  useLayerPresence,
} from "@/components/ui/useFloatingLayer"

// 模拟嵌套 portal 浮层：注册 body 下的节点。
const NestedLayerProbe = (): null => {
  const layer = useContext(TooltipLayerContext)

  useEffect(() => {
    if (!layer) return
    const node = document.createElement("div")
    node.textContent = "nested-layer"
    document.body.appendChild(node)
    layer.register(node)
    return () => {
      layer.unregister(node)
      node.remove()
    }
  }, [layer])

  return null
}

interface ProbeProps {
  isOpen: boolean
  onClose: () => void
  closeOnOutsideClick?: boolean
  closeOnScroll?: boolean
  withAnchor?: boolean
  withNestedLayer?: boolean
  onExited?: () => void
}

// 以真实 DOM 节点驱动通用浮层逻辑的最小宿主组件。
const Probe = ({
  isOpen,
  onClose,
  closeOnOutsideClick,
  closeOnScroll,
  withAnchor = true,
  withNestedLayer = false,
  onExited,
}: ProbeProps): React.JSX.Element => {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const { shouldRender, isAnimatingOut } = useLayerPresence(isOpen, onExited)
  const { layerContextValue } = useFloatingLayer({
    isOpen,
    active: shouldRender,
    rootRef,
    insideRefs: [triggerRef],
    anchorRef: withAnchor ? anchorRef : undefined,
    onClose,
    closeOnOutsideClick,
    closeOnScroll,
  })

  return (
    <div>
      <div data-testid="trigger" ref={triggerRef} />
      <div data-testid="scroll-container">
        <div data-testid="anchor" ref={anchorRef} />
      </div>
      {shouldRender && (
        <div data-animating={isAnimatingOut ? "true" : undefined} data-testid="root" ref={rootRef}>
          <TooltipLayerContext.Provider value={layerContextValue}>
            {withNestedLayer ? <NestedLayerProbe /> : null}
          </TooltipLayerContext.Provider>
        </div>
      )}
    </div>
  )
}

describe("useFloatingLayer 关闭语义", () => {
  afterEach(cleanup)

  it("外部 pointerdown 关闭；根节点、触发元素与注册的嵌套浮层内部不关闭", () => {
    const onClose = vi.fn()
    render(<Probe isOpen={true} onClose={onClose} withNestedLayer={true} />)

    fireEvent.pointerDown(screen.getByTestId("root"))
    fireEvent.pointerDown(screen.getByTestId("trigger"))
    fireEvent.pointerDown(screen.getByText("nested-layer"))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("closeOnOutsideClick=false 时外部 pointerdown 不关闭", () => {
    const onClose = vi.fn()
    render(<Probe isOpen={true} onClose={onClose} closeOnOutsideClick={false} />)

    fireEvent.pointerDown(document.body)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("Esc 关闭", () => {
    const onClose = vi.fn()
    render(<Probe isOpen={true} onClose={onClose} />)

    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: "Enter" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("锚点所在容器滚动与页面级滚动关闭；无关容器滚动与浮层内部滚动不关闭", () => {
    const unrelatedContainer = document.createElement("div")
    document.body.appendChild(unrelatedContainer)

    const onClose = vi.fn()
    render(<Probe isOpen={true} onClose={onClose} />)

    fireEvent.scroll(screen.getByTestId("root"))
    fireEvent.scroll(unrelatedContainer)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.scroll(screen.getByTestId("scroll-container"))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.scroll(document)
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.scroll(document.documentElement)
    expect(onClose).toHaveBeenCalledTimes(3)

    unrelatedContainer.remove()
  })

  it("未提供锚点时任意外部滚动都关闭", () => {
    const unrelatedContainer = document.createElement("div")
    document.body.appendChild(unrelatedContainer)

    const onClose = vi.fn()
    render(<Probe isOpen={true} onClose={onClose} withAnchor={false} />)

    fireEvent.scroll(unrelatedContainer)
    expect(onClose).toHaveBeenCalledTimes(1)

    unrelatedContainer.remove()
  })

  it("closeOnScroll=false 时滚动不关闭", () => {
    const onClose = vi.fn()
    render(<Probe isOpen={true} onClose={onClose} closeOnScroll={false} />)

    fireEvent.scroll(document)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("关闭时先播放退场动画，120ms 后才卸载并触发 onExited", () => {
    vi.useFakeTimers()
    try {
      const onClose = vi.fn()
      const onExited = vi.fn()
      const { rerender } = render(<Probe isOpen={true} onClose={onClose} onExited={onExited} />)
      expect(screen.getByTestId("root")).not.toBeNull()

      rerender(<Probe isOpen={false} onClose={onClose} onExited={onExited} />)
      expect(screen.getByTestId("root").dataset.animating).toBe("true")
      expect(onExited).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(120)
      })
      expect(onExited).toHaveBeenCalledTimes(1)
      expect(screen.queryByTestId("root")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("useFloatingLayer 关监听仅在打开时生效", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("浮层关闭后外部 pointerdown 不再触发 onClose", () => {
    const onClose = vi.fn()
    const { rerender } = render(<Probe isOpen={true} onClose={onClose} />)

    rerender(<Probe isOpen={false} onClose={onClose} />)
    fireEvent.pointerDown(document.body)
    expect(onClose).not.toHaveBeenCalled()
  })
})

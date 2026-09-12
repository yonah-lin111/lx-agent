// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useContext, useEffect } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LxMenu, LxMenuItem } from "@/components/ui/LxMenu/LxMenu"
import { TooltipLayerContext } from "@/components/ui/LxTooltip"

// 模拟菜单内的嵌套 portal 浮层（如二级子菜单）：向菜单层注册 body 下节点。
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

describe("LxMenu adaptive width", () => {
  afterEach(cleanup)

  it("默认 width='auto' 时渲染 max-content 并设置 min-width: 140px 与 max-width: 280px", () => {
    render(
      <LxMenu isOpen={true} x={100} y={100} ariaLabel="Test Menu" onClose={vi.fn()}>
        <LxMenuItem>Item 1</LxMenuItem>
      </LxMenu>,
    )

    const menu = screen.getByRole("menu")
    expect(menu).not.toBeNull()
    expect(menu.style.width).toBe("max-content")
    expect(menu.style.minWidth).toBe("140px")
    expect(menu.style.maxWidth).toBe("280px")
  })

  it("显式传入数字 width 时应用固定数值宽度", () => {
    render(
      <LxMenu isOpen={true} x={100} y={100} width={220} ariaLabel="Fixed Menu" onClose={vi.fn()}>
        <LxMenuItem>Item 1</LxMenuItem>
      </LxMenu>,
    )

    const menu = screen.getByRole("menu")
    expect(menu.style.width).toBe("220px")
  })

  it("支持自定义 minWidth 与 maxWidth", () => {
    render(
      <LxMenu
        isOpen={true}
        x={100}
        y={100}
        minWidth={160}
        maxWidth={320}
        ariaLabel="Custom Range Menu"
        onClose={vi.fn()}
      >
        <LxMenuItem>Item 1</LxMenuItem>
      </LxMenu>,
    )

    const menu = screen.getByRole("menu")
    expect(menu.style.minWidth).toBe("160px")
    expect(menu.style.maxWidth).toBe("320px")
  })

  it("LxMenuItem 的文本包裹在 truncate 和 whitespace-nowrap 的容器中", () => {
    render(
      <LxMenu isOpen={true} x={100} y={100} ariaLabel="Item Style Menu" onClose={vi.fn()}>
        <LxMenuItem>Copy Project Path</LxMenuItem>
      </LxMenu>,
    )

    const itemText = screen.getByText("Copy Project Path")
    expect(itemText.className).toContain("whitespace-nowrap")
    expect(itemText.className).toContain("truncate")
  })

  it("LxMenuItem 支持在右侧渲染 trailing 快捷键或状态标识", () => {
    render(
      <LxMenu isOpen={true} x={100} y={100} ariaLabel="Trailing Menu" onClose={vi.fn()}>
        <LxMenuItem trailing="Shift + Alt + C">Copy Project Path</LxMenuItem>
      </LxMenu>,
    )

    const trailingEl = screen.getByText("Shift + Alt + C")
    expect(trailingEl).not.toBeNull()
    expect(trailingEl.className).toContain("ml-auto")
  })
})

describe("LxMenu nested layers", () => {
  afterEach(cleanup)

  it("点击菜单内注册的嵌套浮层节点不触发 onClose，点击外部仍关闭", () => {
    const onClose = vi.fn()
    render(
      <LxMenu isOpen={true} x={100} y={100} ariaLabel="Nested Layer Menu" onClose={onClose}>
        <NestedLayerProbe />
      </LxMenu>,
    )

    fireEvent.mouseDown(screen.getByText("nested-layer"))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

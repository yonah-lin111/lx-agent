// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LxNavItem } from "@/components/ui/LxNavItem"

describe("LxNavItem", () => {
  afterEach(cleanup)

  it("尺寸档位对齐 LxTag 容器度量", () => {
    const small = render(<LxNavItem size="small">item</LxNavItem>)
    const smallClassName = small.container.querySelector(".lx-nav-item")?.className ?? ""
    expect(smallClassName).toContain("h-6")
    expect(smallClassName).toContain("text-xs")

    const middle = render(<LxNavItem>item</LxNavItem>)
    const middleClassName = middle.container.querySelector(".lx-nav-item")?.className ?? ""
    expect(middleClassName).toContain("h-7")
    expect(middleClassName).toContain("px-2.5")

    const large = render(<LxNavItem size="large">item</LxNavItem>)
    const largeClassName = large.container.querySelector(".lx-nav-item")?.className ?? ""
    expect(largeClassName).toContain("h-8")
    expect(largeClassName).toContain("text-sm")
  })

  it("渲染前后缀插槽与 children", () => {
    const { container } = render(
      <LxNavItem prefix={<span data-testid="prefix" />} suffix={<span data-testid="suffix" />}>
        Label
      </LxNavItem>,
    )

    expect(container.querySelector('[data-testid="prefix"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="suffix"]')).not.toBeNull()
    expect(screen.getByText("Label")).toBeDefined()
  })

  it("depth 为正时按层级缩进，0 或缺省不缩进", () => {
    const flat = render(<LxNavItem>flat</LxNavItem>)
    expect(flat.container.querySelector<HTMLElement>(".lx-nav-item")?.style.marginLeft).toBe("")

    const levelOne = render(<LxNavItem depth={1}>one</LxNavItem>)
    expect(levelOne.container.querySelector<HTMLElement>(".lx-nav-item")?.style.marginLeft).toBe(
      "10px",
    )

    const levelTwo = render(<LxNavItem depth={2}>two</LxNavItem>)
    expect(levelTwo.container.querySelector<HTMLElement>(".lx-nav-item")?.style.marginLeft).toBe(
      "22px",
    )
  })

  it("点击与 Enter/Space 均触发 onClick", () => {
    const onClick = vi.fn()
    const { container } = render(<LxNavItem onClick={onClick}>item</LxNavItem>)
    const row = container.querySelector<HTMLElement>(".lx-nav-item")!

    fireEvent.click(row)
    expect(onClick).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(row, { key: "Enter" })
    fireEvent.keyDown(row, { key: " " })
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it("hoverable=false 时不带基础 hover 背景", () => {
    const { container } = render(<LxNavItem hoverable={false}>item</LxNavItem>)
    expect(container.querySelector(".lx-nav-item")?.className).not.toContain("hover:bg-white/10")
  })

  it("透传 data-*/aria-* 与自定义 className", () => {
    const { container } = render(
      <LxNavItem className="text-white/70" data-item-level="prompt" aria-current="page">
        item
      </LxNavItem>,
    )
    const row = container.querySelector<HTMLElement>(".lx-nav-item")
    expect(row?.dataset.itemLevel).toBe("prompt")
    expect(row?.getAttribute("aria-current")).toBe("page")
    expect(row?.className).toContain("text-white/70")
  })
})

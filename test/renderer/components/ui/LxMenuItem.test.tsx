// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LxMenuItem } from "@/components/ui/LxMenuItem"

describe("LxMenuItem", () => {
  afterEach(cleanup)

  it("尺寸档位由垂直内边距驱动，默认 medium", () => {
    const medium = render(<LxMenuItem>item</LxMenuItem>)
    const mediumItem = medium.container.querySelector<HTMLElement>(".lx-menu-item")
    expect(mediumItem?.classList.contains("py-1.5")).toBe(true)
    expect(mediumItem?.classList.contains("px-2.5")).toBe(true)
    expect(mediumItem?.classList.contains("text-sm")).toBe(true)
    expect(mediumItem?.className).toContain("rounded-[6px]")

    const small = render(<LxMenuItem size="small">item</LxMenuItem>)
    const smallItem = small.container.querySelector<HTMLElement>(".lx-menu-item")
    expect(smallItem?.classList.contains("py-1")).toBe(true)
    expect(smallItem?.classList.contains("text-xs")).toBe(true)
    expect(smallItem?.classList.contains("py-1.5")).toBe(false)

    const large = render(<LxMenuItem size="large">item</LxMenuItem>)
    const largeItem = large.container.querySelector<HTMLElement>(".lx-menu-item")
    expect(largeItem?.classList.contains("py-2")).toBe(true)
    expect(largeItem?.classList.contains("px-3")).toBe(true)
    expect(largeItem?.classList.contains("text-sm")).toBe(true)
  })

  it("文字对齐只作用于文字区，默认左对齐", () => {
    const left = render(<LxMenuItem>left-label</LxMenuItem>)
    expect(screen.getByText("left-label").className).toContain("text-left")
    expect(left.container.querySelector(".lx-menu-item")?.className).not.toContain("text-center")

    render(<LxMenuItem align="center">center-label</LxMenuItem>)
    expect(screen.getByText("center-label").className).toContain("text-center")

    render(<LxMenuItem align="right">right-label</LxMenuItem>)
    expect(screen.getByText("right-label").className).toContain("text-right")
  })

  it("渲染前后图标槽，槽内 svg 尺寸随档位强制", () => {
    render(
      <LxMenuItem leading={<svg data-testid="leading" />} trailing={<svg data-testid="trailing" />}>
        item
      </LxMenuItem>,
    )
    expect(screen.getByTestId("leading").parentElement?.className).toContain("h-4")
    expect(screen.getByTestId("leading").parentElement?.className).toContain("[&>svg]:h-4")
    expect(screen.getByTestId("trailing").parentElement?.className).toContain("ml-auto")
    expect(screen.getByTestId("trailing").parentElement?.className).toContain("[&>svg]:h-4")

    const small = render(
      <LxMenuItem size="small" leading={<svg data-testid="leading-small" />}>
        item
      </LxMenuItem>,
    )
    const smallLeadingSlot = small.container.querySelector<SVGElement>(
      '[data-testid="leading-small"]',
    )?.parentElement
    expect(smallLeadingSlot?.className).toContain("[&>svg]:h-3.5")
  })

  it("active 内置选中高亮并输出 data-active 标记", () => {
    const active = render(<LxMenuItem active>item</LxMenuItem>)
    const activeEl = active.container.querySelector(".lx-menu-item")
    expect(activeEl?.getAttribute("data-active")).toBe("true")
    expect(activeEl?.className).toContain("bg-white/10")
    expect(activeEl?.className).toContain("font-medium")

    const idle = render(<LxMenuItem>item</LxMenuItem>)
    const idleEl = idle.container.querySelector(".lx-menu-item")
    expect(idleEl?.getAttribute("data-active")).toBeNull()
    expect(idleEl?.className).toContain("hover:bg-white/5")
  })

  it("menuRole 决定 ARIA 角色与选中语义", () => {
    const menuitem = render(<LxMenuItem active>item</LxMenuItem>)
    const menuitemEl = menuitem.container.querySelector(".lx-menu-item")
    expect(menuitemEl?.getAttribute("role")).toBe("menuitem")
    expect(menuitemEl?.getAttribute("aria-selected")).toBeNull()

    const option = render(
      <LxMenuItem active menuRole="option">
        item
      </LxMenuItem>,
    )
    const optionEl = option.container.querySelector(".lx-menu-item")
    expect(optionEl?.getAttribute("role")).toBe("option")
    expect(optionEl?.getAttribute("aria-selected")).toBe("true")

    const radio = render(
      <LxMenuItem active menuRole="menuitemradio">
        item
      </LxMenuItem>,
    )
    const radioEl = radio.container.querySelector(".lx-menu-item")
    expect(radioEl?.getAttribute("role")).toBe("menuitemradio")
    expect(radioEl?.getAttribute("aria-checked")).toBe("true")
  })

  it("danger 区分未确认态与确认态颜色", () => {
    const idle = render(<LxMenuItem danger>item</LxMenuItem>)
    expect(idle.container.querySelector(".lx-menu-item")?.className).toContain("text-rose-400/80")

    const confirming = render(
      <LxMenuItem danger active>
        item
      </LxMenuItem>,
    )
    expect(confirming.container.querySelector(".lx-menu-item")?.className).toContain("bg-rose-600")
  })

  it("点击触发 onClick，禁用态不触发", () => {
    const onClick = vi.fn()
    const { container, rerender } = render(<LxMenuItem onClick={onClick}>item</LxMenuItem>)
    const item = container.querySelector<HTMLElement>(".lx-menu-item")!

    fireEvent.click(item)
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <LxMenuItem disabled onClick={onClick}>
        item
      </LxMenuItem>,
    )
    fireEvent.click(container.querySelector<HTMLElement>(".lx-menu-item")!)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("透传 className、data-* 与可访问名称", () => {
    const { container } = render(
      <LxMenuItem aria-label="row" className="custom-class" data-unimported="true">
        item
      </LxMenuItem>,
    )
    const item = container.querySelector<HTMLElement>(".lx-menu-item")
    expect(item?.className).toContain("custom-class")
    expect(item?.getAttribute("data-unimported")).toBe("true")
    expect(item?.getAttribute("aria-label")).toBe("row")
  })
})

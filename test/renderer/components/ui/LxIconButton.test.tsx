// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LxIconButton } from "@/components/ui/LxIconButton"

describe("LxIconButton", () => {
  afterEach(cleanup)

  it("textClass 覆盖默认基础文本色", () => {
    const { container } = render(<LxIconButton aria-label="jobs" textClass="text-sky-300" />)
    const button = container.querySelector("button")
    expect(button?.className).toContain("text-sky-300")
    expect(button?.className).not.toContain("text-white/45")
  })

  it("缺省基础文本色仍为 text-white/45", () => {
    const { container } = render(<LxIconButton aria-label="default" />)
    expect(container.querySelector("button")?.className).toContain("text-white/45")
  })

  it("variant 默认 solid，ghost 标记供主题跳过强制浮雕", () => {
    const solid = render(<LxIconButton aria-label="solid" />)
    expect(solid.container.querySelector("button")?.getAttribute("data-variant")).toBe("solid")

    const ghost = render(<LxIconButton aria-label="ghost" variant="ghost" />)
    expect(ghost.container.querySelector("button")?.getAttribute("data-variant")).toBe("ghost")
  })

  it("highlightBgClass/highlightTextClass 覆盖 highlighted 态样式", () => {
    const { container } = render(
      <LxIconButton
        aria-label="filter"
        highlighted
        hoverBgClass="hover:bg-cyan-500/20"
        hoverTextClass="hover:text-cyan-300"
        highlightBgClass="bg-cyan-500/20"
        highlightTextClass="text-cyan-300"
      />,
    )
    const className = container.querySelector("button")?.className ?? ""
    expect(className).toContain("bg-cyan-500/20")
    expect(className).toContain("text-cyan-300")
    expect(className).not.toContain("bg-white/5")
  })

  it("highlighted 未提供覆盖色时保留默认 bg-white/5 text-white", () => {
    const { container } = render(<LxIconButton aria-label="highlighted" highlighted />)
    const className = container.querySelector("button")?.className ?? ""
    expect(className).toContain("bg-white/5")
    expect(className).toContain("text-white")
  })

  it("带文字按钮按尺寸档位设置字号：small=xs，medium/large=sm", () => {
    const small = render(
      <LxIconButton icon={<span />} iconOnly={false} size="small" aria-label="font-small">
        label
      </LxIconButton>,
    )
    expect(small.container.querySelector("button")?.className).toContain("text-xs")

    const medium = render(
      <LxIconButton icon={<span />} iconOnly={false} size="medium" aria-label="font-medium">
        label
      </LxIconButton>,
    )
    expect(medium.container.querySelector("button")?.className).toContain("text-sm")

    const large = render(
      <LxIconButton icon={<span />} iconOnly={false} size="large" aria-label="font-large">
        label
      </LxIconButton>,
    )
    expect(large.container.querySelector("button")?.className).toContain("text-sm")
  })

  it("suffix 直出渲染：自定义 icon 组不额外包裹容器", () => {
    const { container } = render(
      <LxIconButton
        icon={<span data-testid="leading" />}
        iconOnly={false}
        suffix={
          <>
            <span data-testid="pin" />
            <span data-testid="copy" />
          </>
        }
      >
        label
      </LxIconButton>,
    )
    const button = container.querySelector("button")
    const pin = button?.querySelector('[data-testid="pin"]')
    expect(pin).not.toBeNull()
    expect(pin?.parentElement).toBe(button)
    expect(button?.querySelector('[data-testid="copy"]')).not.toBeNull()
    expect(button?.querySelector('[data-testid="leading"]')).not.toBeNull()
  })

  it("suffix 存在时按自适应文字按钮渲染，不再套用 iconOnly 固定尺寸", () => {
    const { container } = render(
      <LxIconButton size="small" iconOnly suffix={<span data-testid="suffix" />}>
        label
      </LxIconButton>,
    )
    const className = container.querySelector("button")?.className ?? ""
    expect(className).toContain("text-xs")
    expect(className).not.toContain("w-6")
  })

  it("onClose 渲染关闭入口：直接关闭不触发主 onClick，且带 ghost 标记跳过主题浮雕", () => {
    const onClick = vi.fn()
    const onClose = vi.fn()
    const { container } = render(
      <LxIconButton iconOnly={false} onClick={onClick} onClose={onClose} confirmClose={false}>
        label
      </LxIconButton>,
    )
    const closeIcon = container.querySelector('[role="button"]') as HTMLElement
    expect(closeIcon).not.toBeNull()
    expect(closeIcon.getAttribute("data-variant")).toBe("ghost")
    fireEvent.click(closeIcon)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("confirmClose 默认二次确认：点击关闭先弹确认，确认后才执行关闭", () => {
    const onClose = vi.fn()
    const { container } = render(
      <LxIconButton iconOnly={false} onClose={onClose} closeTooltipContent="确认移除该标签">
        label
      </LxIconButton>,
    )
    fireEvent.click(container.querySelector('[role="button"]') as HTMLElement)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText("确认移除该标签")).not.toBeNull()

    fireEvent.click(screen.getByLabelText(/confirm|确认/i))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

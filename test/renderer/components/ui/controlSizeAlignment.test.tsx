// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { LxSelect } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"

// 统一高度阶梯：small/medium/large 与 LxIconButton 的 h-6/h-7/h-8 一致。
const HEIGHT_STEPS = [
  { size: "small", height: "h-6" },
  { size: "medium", height: "h-7" },
  { size: "large", height: "h-8" },
] as const

// LxInput 尺寸枚举映射到统一阶梯。
const INPUT_HEIGHT_STEPS = [
  { size: "xs", height: "h-6" },
  { size: "sm", height: "h-7" },
  { size: "lg", height: "h-8" },
] as const

// LxTag 的中间档名为 default，映射到统一阶梯的 medium（h-7）。
const TAG_HEIGHT_STEPS = [
  { size: "small", height: "h-6" },
  { size: "default", height: "h-7" },
  { size: "large", height: "h-8" },
] as const

// LxNavItem 与 LxTag 共用 small/default/large 三档命名。
const NAV_ITEM_HEIGHT_STEPS = [
  { size: "small", height: "h-6" },
  { size: "default", height: "h-7" },
  { size: "large", height: "h-8" },
] as const

describe("控件尺寸阶梯对齐", () => {
  afterEach(cleanup)

  it("LxIconButton 以 h-6/h-7/h-8 作为高度基准", () => {
    for (const { size, height } of HEIGHT_STEPS) {
      const { container } = render(<LxIconButton size={size} />)
      expect(container.querySelector("button")?.className).toContain(height)
    }
  })

  it.each(HEIGHT_STEPS)("LxSelect $size 触发按钮高度为 $height", ({ size, height }) => {
    const { container } = render(
      <LxSelect value="a" onChange={() => {}} options={[{ value: "a", label: "A" }]} size={size} />,
    )
    expect(container.querySelector(".lx-select-trigger")?.className).toContain(height)
  })

  it.each(INPUT_HEIGHT_STEPS)("LxInput $size 单行高度为 $height", ({ size, height }) => {
    const { container } = render(<LxInput size={size} aria-label="size-check" />)
    expect(container.querySelector(".lx-input")?.className).toContain(height)
  })

  it.each(TAG_HEIGHT_STEPS)("LxTag $size 高度为 $height", ({ size, height }) => {
    const { container } = render(<LxTag size={size}>tag</LxTag>)
    expect(container.querySelector(".lx-tag")?.className).toContain(height)
  })

  it.each(NAV_ITEM_HEIGHT_STEPS)("LxNavItem $size 高度为 $height", ({ size, height }) => {
    const { container } = render(<LxNavItem size={size}>item</LxNavItem>)
    expect(container.querySelector(".lx-nav-item")?.className).toContain(height)
  })

  it("LxInput 默认尺寸为 sm（h-7），多行输入保持内容撑高", () => {
    const singleLine = render(<LxInput aria-label="default-size" />)
    expect(singleLine.container.querySelector(".lx-input")?.className).toContain("h-7")

    const multiline = render(<LxInput multiline aria-label="multiline-size" />)
    const multilineClassName = multiline.container.querySelector(".lx-input")?.className ?? ""
    expect(multilineClassName).not.toMatch(/\bh-[678]\b/)
    expect(multilineClassName).toContain("py-1.5")
  })

  it("LxTag 内部尺度对齐控件档位：文字字号与关闭图标逐档递增", () => {
    const small = render(<LxTag size="small">tag</LxTag>)
    expect(small.container.querySelector(".lx-tag")?.className).toContain("text-xs")

    const middle = render(<LxTag size="default">tag</LxTag>)
    expect(middle.container.querySelector(".lx-tag")?.className).toContain("text-xs")

    const large = render(<LxTag size="large">tag</LxTag>)
    expect(large.container.querySelector(".lx-tag")?.className).toContain("text-sm")

    const closableSmall = render(
      <LxTag size="small" onClose={() => {}} confirmClose={false}>
        tag
      </LxTag>,
    )
    expect(closableSmall.container.querySelector(".lx-tag svg")?.getAttribute("class")).toContain(
      "h-3",
    )

    const closableLarge = render(
      <LxTag size="large" onClose={() => {}} confirmClose={false}>
        tag
      </LxTag>,
    )
    expect(closableLarge.container.querySelector(".lx-tag svg")?.getAttribute("class")).toContain(
      "h-3.5",
    )
  })
})

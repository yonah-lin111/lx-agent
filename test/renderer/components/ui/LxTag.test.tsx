// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { LxTag } from "@/components/ui/LxTag"

describe("LxTag", () => {
  afterEach(cleanup)

  it("textClass 覆盖色板默认文字色", () => {
    const { container } = render(<LxTag textClass="text-white">tag</LxTag>)
    const tag = container.querySelector(".lx-tag")
    expect(tag?.className).toContain("text-white")
    expect(tag?.className).not.toContain("text-white/45")
  })

  it("bgClass 自带文字色时不再注入色板文字色", () => {
    const { container } = render(
      <LxTag bgClass="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">tag</LxTag>,
    )
    const tag = container.querySelector(".lx-tag")
    expect(tag?.className).toContain("text-emerald-300")
    expect(tag?.className).not.toContain("text-white/45")
  })

  it("children 省略时渲染纯图标标签", () => {
    const { container } = render(<LxTag prefix={<span data-testid="prefix" />} />)
    const tag = container.querySelector(".lx-tag")
    expect(tag).not.toBeNull()
    expect(tag?.querySelector('[data-testid="prefix"]')).not.toBeNull()
    expect(tag?.querySelector(".truncate")).toBeNull()
  })

  it("default 选中态对齐 LxIconButton 高亮：bg-white/5 + text-white 且无高亮边框", () => {
    const { container } = render(<LxTag highlighted>tag</LxTag>)
    const tag = container.querySelector(".lx-tag")
    const className = tag?.className ?? ""
    expect(tag?.getAttribute("data-highlighted")).toBe("true")
    expect(className).toContain("bg-white/5")
    expect(className).toContain("text-white")
    expect(className).not.toContain("bg-white/10")
    expect(className).not.toContain("text-white/90")
    expect(className).not.toContain("text-white/45")
    expect(className).not.toContain("border-white/15")
  })

  it("ghost 变体不渲染边框、底色与 hover", () => {
    const { container } = render(
      <LxTag variant="ghost" color="sky">
        Build
      </LxTag>,
    )
    const className = container.querySelector(".lx-tag")?.className ?? ""
    expect(className).toContain("text-sky-400/80")
    expect(className).not.toContain("border")
    expect(className).not.toContain("bg-sky")
    expect(className).not.toContain("hover:")
    expect(container.querySelector(".lx-tag")?.getAttribute("data-variant")).toBe("ghost")
  })

  it("可点击标签也不渲染 hover 变色", () => {
    const { container } = render(<LxTag onClick={() => {}}>Action</LxTag>)
    const className = container.querySelector(".lx-tag")?.className ?? ""
    expect(className).toContain("cursor-pointer")
    expect(className).not.toContain("hover:")
  })

  it("标签文字可选中复制（无 select-none 限制）", () => {
    const { container } = render(<LxTag>copyable</LxTag>)
    expect(container.querySelector(".lx-tag")?.className).not.toContain("select-none")
  })
})

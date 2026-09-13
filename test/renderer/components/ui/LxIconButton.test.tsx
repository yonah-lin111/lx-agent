// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

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
})

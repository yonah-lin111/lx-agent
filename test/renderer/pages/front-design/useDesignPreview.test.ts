// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { syncElementAttributes } from "@/pages/front-design/hooks/useDesignPreview"

describe("syncElementAttributes", () => {
  it("双向同步属性：新增、覆盖与移除", () => {
    const target = document.createElement("body")
    target.setAttribute("class", "p-4")
    target.setAttribute("data-stale", "1")
    const source = document.createElement("body")
    source.setAttribute("class", "min-h-screen flex items-center justify-center")
    source.setAttribute("lang", "zh-CN")

    syncElementAttributes(target, source)

    expect(target.getAttribute("class")).toBe("min-h-screen flex items-center justify-center")
    expect(target.getAttribute("lang")).toBe("zh-CN")
    expect(target.hasAttribute("data-stale")).toBe(false)
  })
})

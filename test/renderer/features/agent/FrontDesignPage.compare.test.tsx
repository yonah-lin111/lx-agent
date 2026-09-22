// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { FrontDesignPage } from "@/pages/front-design/FrontDesignPage"

// mock LxTooltip，使其在测试环境中直接展开 click.content，便于驱动下拉面板。
vi.mock("@/components/ui/LxTooltip", () => {
  return {
    LxTooltip: ({ children, click, content }: any) => {
      return (
        <div data-testid="lx-tooltip-wrapper">
          {children}
          {click?.content && <div data-testid="tooltip-click-content">{click.content}</div>}
          {content && <div data-testid="tooltip-hover-content">{content}</div>}
        </div>
      )
    },
  }
})

describe("FrontDesignPage 版本对照接线", () => {
  beforeEach(() => {
    cleanup()
    frontDesignStore.clear()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    frontDesignStore.clear()
    localStorage.clear()
  })

  it("开启版本对照后出现第二个只读 iframe（默认前一版），关闭后移除", () => {
    frontDesignStore.registerDesign({
      id: "v1",
      version: 1,
      title: "V1",
      html: "<div>V1 content</div>",
      mode: "css",
      updatedAt: 1,
    })
    frontDesignStore.registerDesign({
      id: "v2",
      parentId: "v1",
      version: 2,
      title: "V2",
      html: "<div>V2 content</div>",
      mode: "css",
      updatedAt: 2,
      autoActivate: true,
    })

    const { container } = render(<FrontDesignPage />)
    expect(container.querySelectorAll("iframe")).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: /版本对照|Version compare/ }))

    const iframes = container.querySelectorAll("iframe")
    expect(iframes).toHaveLength(2)
    expect(iframes[1].getAttribute("srcdoc")).toContain("V1 content")

    fireEvent.click(screen.getByLabelText(/关闭对照|Close compare/))
    expect(container.querySelectorAll("iframe")).toHaveLength(1)
  })

  it("仅一个版本时对照开关禁用", () => {
    frontDesignStore.registerDesign({
      id: "only",
      version: 1,
      title: "Only",
      html: "<div>Only</div>",
      mode: "css",
      updatedAt: 1,
    })

    render(<FrontDesignPage />)
    const compareButton = screen.getByRole("button", { name: /版本对照|Version compare/ })
    expect((compareButton as HTMLButtonElement).disabled).toBe(true)
  })
})

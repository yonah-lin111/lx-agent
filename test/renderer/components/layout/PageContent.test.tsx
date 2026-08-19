// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PageContent } from "@/components/layout/PageContent"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

describe("PageContent", () => {
  afterEach(() => {
    cleanup()
  })

  it("展开态正常渲染子元素，且不展示折叠/展开图标", () => {
    render(
      <PageContent isCollapsed={false}>
        <div data-testid="page-child">页面主内容</div>
      </PageContent>,
    )

    expect(screen.getByTestId("page-child")).not.toBeNull()
    expect(screen.queryByLabelText("展开页面内容")).toBeNull()
    expect(screen.queryByText("页面内容已折叠")).toBeNull()
  })

  it("折叠态渲染 32px 紧凑条与展开图标，不渲染子内容", () => {
    const onExpand = vi.fn()
    render(
      <PageContent isCollapsed={true} onExpand={onExpand}>
        <div data-testid="page-child">页面主内容</div>
      </PageContent>,
    )

    expect(screen.queryByTestId("page-child")).toBeNull()
    expect(screen.getByText("页面内容已折叠")).not.toBeNull()

    const expandBtn = screen.getByLabelText("展开页面内容")
    expect(expandBtn).not.toBeNull()

    fireEvent.click(expandBtn)
    expect(onExpand).toHaveBeenCalledTimes(1)
  })
})

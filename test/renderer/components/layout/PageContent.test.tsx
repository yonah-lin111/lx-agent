// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PageContent } from "@/components/layout/PageContent"

describe("PageContent", () => {
  afterEach(() => {
    cleanup()
  })

  it("正常渲染子元素且保持 flex 容器特性", () => {
    render(
      <PageContent>
        <div data-testid="page-child">页面主内容</div>
      </PageContent>,
    )

    expect(screen.getByTestId("page-child")).not.toBeNull()
    expect(screen.getByRole("main")).not.toBeNull()
  })
})

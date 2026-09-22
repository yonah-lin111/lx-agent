// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { FrontDesignItem } from "@/features/agent/hooks/frontDesignStore"
import { FrontDesignComparePane } from "@/pages/front-design/components/FrontDesignComparePane"

vi.mock("@/components/ui/LxTooltip", () => ({
  LxTooltip: ({
    children,
    click,
  }: {
    children: React.ReactNode
    click?: { content: React.ReactNode }
  }) => (
    <>
      {children}
      {click?.content}
    </>
  ),
}))

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    compileTailwind: vi.fn(async () => ""),
  },
}))

const item = (id: string, version: number): FrontDesignItem => ({
  id,
  version,
  title: id,
  html: `<div data-version="${id}">${id}</div>`,
  mode: "css",
  updatedAt: version,
})

const defaultProps = {
  design: item("v2", 2),
  options: [item("v1", 1), item("v3", 3)],
  viewportWidthClass: "max-w-full",
  isDesktop: true,
  effectiveMode: "dark" as const,
  onSelectVersion: vi.fn(),
  onClose: vi.fn(),
}

describe("FrontDesignComparePane", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("渲染对照标题、当前版本徽标与选中版本 HTML 的只读 iframe", () => {
    const { container } = render(<FrontDesignComparePane {...defaultProps} />)

    expect(screen.getByText(/版本对照|Version compare/)).not.toBeNull()
    expect(screen.getByText("v2")).not.toBeNull()

    const iframe = container.querySelector("iframe")
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute("srcdoc")).toContain('data-version="v2"')
  })

  it("版本下拉列出候选版本并排除主画布版本，点击回调选中 id", () => {
    render(<FrontDesignComparePane {...defaultProps} />)

    expect(screen.getByText("v1")).not.toBeNull()
    expect(screen.getByText("v3")).not.toBeNull()

    fireEvent.click(screen.getByText("v1"))
    expect(defaultProps.onSelectVersion).toHaveBeenCalledWith("v1")
  })

  it("点击关闭按钮触发 onClose", () => {
    render(<FrontDesignComparePane {...defaultProps} />)

    fireEvent.click(screen.getByLabelText(/关闭对照|Close compare/))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })
})

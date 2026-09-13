// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MarkdownStatusBar } from "@/features/markdown/components/MarkdownStatusBar"

// GitStatusBar 装载项目列表与默认路径，mock 掉避免未捕获 Promise。
vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    listProjects: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    getDefaultPath: vi.fn().mockResolvedValue(""),
  },
}))

describe("MarkdownStatusBar 标签容器不裁剪", () => {
  afterEach(cleanup)

  it("右侧标签容器不使用 overflow-hidden，标签上下边框完整显示", () => {
    const { container } = render(<MarkdownStatusBar />)

    const statusBar = container.firstElementChild as HTMLElement
    const tagsContainer = statusBar.children[1] as HTMLElement
    expect(tagsContainer.classList.contains("overflow-hidden")).toBe(false)
  })
})

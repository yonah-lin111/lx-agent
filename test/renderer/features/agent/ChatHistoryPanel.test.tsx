// @vitest-environment jsdom

import type { AgentSessionSummary } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChatHistoryPanel } from "@/features/agent"
import { agentApi } from "@/features/agent/api/agentApi"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    renameSession: vi.fn(() => Promise.resolve()),
  },
}))

// jsdom 未实现 ResizeObserver / requestAnimationFrame，用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)
vi.stubGlobal("requestAnimationFrame", (() => 0) as typeof requestAnimationFrame)

// 构造会话摘要。
const createSession = (overrides: Partial<AgentSessionSummary>): AgentSessionSummary => ({
  id: "s1",
  title: "Alpha session",
  cwd: "/tmp/alpha",
  projectId: "p1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

const sessions: AgentSessionSummary[] = [
  createSession({ id: "s1", title: "Alpha session", projectId: "p1" }),
  createSession({ id: "s2", title: "Beta session", projectId: null }),
]

type PanelProps = React.ComponentProps<typeof ChatHistoryPanel>

// 渲染历史面板（可覆盖属性）。
const renderPanel = (props: Partial<PanelProps> = {}): ReturnType<typeof render> =>
  render(
    <ChatHistoryPanel
      sessions={sessions}
      currentSessionId={null}
      projects={[{ id: "p1", name: "Project One" }]}
      onRestore={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />,
  )

// 点击指定会话行右侧的更多按钮展开菜单。
const openMoreMenu = (title: string): void => {
  const row = screen.getByText(title).closest(".lx-nav-item")
  fireEvent.click(row?.querySelector("button") as HTMLElement)
}

describe("ChatHistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(cleanup)

  it("会话项渲染为二级 LxNavItem，当前会话标记 aria-current", () => {
    const { container } = renderPanel({ currentSessionId: "s1" })
    const rows = container.querySelectorAll(".lx-nav-item")
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.getAttribute("data-item-level")).toBe("2")
    }
    const currentRow = screen.getByText("Alpha session").closest(".lx-nav-item")
    expect(currentRow?.getAttribute("aria-current")).toBe("page")
    expect(
      screen.getByText("Beta session").closest(".lx-nav-item")?.getAttribute("aria-current"),
    ).toBeNull()
  })

  it("点击非当前会话触发恢复，当前会话不触发", () => {
    const onRestore = vi.fn()
    renderPanel({ currentSessionId: "s1", onRestore })
    fireEvent.click(screen.getByText("Alpha session"))
    expect(onRestore).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText("Beta session"))
    expect(onRestore).toHaveBeenCalledWith("s2")
  })

  it("按标题搜索过滤会话列表", () => {
    renderPanel()
    fireEvent.change(screen.getByPlaceholderText("Search history sessions..."), {
      target: { value: "beta" },
    })
    expect(screen.queryByText("Alpha session")).toBeNull()
    expect(screen.getByText("Beta session")).not.toBeNull()
  })

  it("Current Project tag 只保留当前项目会话", () => {
    renderPanel({ currentProjectId: "p1" })
    fireEvent.click(screen.getByText("Current Project"))
    expect(screen.getByText("Alpha session")).not.toBeNull()
    expect(screen.queryByText("Beta session")).toBeNull()
  })

  it("Project tag 展开项目选择器并清空未选项目的列表", () => {
    renderPanel()
    expect(screen.queryByText("Select project")).toBeNull()
    fireEvent.click(screen.getByText("Project"))
    expect(screen.getByText("Select project")).not.toBeNull()
    expect(screen.queryByText("Alpha session")).toBeNull()
    expect(screen.queryByText("Beta session")).toBeNull()
  })

  it("更多菜单展示导出/重命名/删除入口", () => {
    renderPanel()
    openMoreMenu("Alpha session")
    expect(screen.getByText("Export Session...")).not.toBeNull()
    expect(screen.getByText("Rename")).not.toBeNull()
    expect(screen.getByText("Delete")).not.toBeNull()
  })

  it("删除需二次确认后才触发 onDelete", () => {
    const onDelete = vi.fn()
    renderPanel({ onDelete })
    openMoreMenu("Alpha session")
    fireEvent.click(screen.getByText("Delete"))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText("Confirm Delete"))
    expect(onDelete).toHaveBeenCalledWith("s1")
  })

  it("重命名进入行内编辑并在提交时写入 agentApi", async () => {
    renderPanel()
    openMoreMenu("Alpha session")
    fireEvent.click(screen.getByText("Rename"))
    const input = screen.getByLabelText("Edit Session Title")
    fireEvent.change(input, { target: { value: "Renamed Alpha" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => {
      expect(agentApi.renameSession).toHaveBeenCalledWith("s1", "Renamed Alpha")
    })
  })

  it("行内编辑按 Escape 取消，不写入 agentApi", () => {
    renderPanel()
    openMoreMenu("Alpha session")
    fireEvent.click(screen.getByText("Rename"))
    fireEvent.keyDown(screen.getByLabelText("Edit Session Title"), { key: "Escape" })
    expect(screen.queryByLabelText("Edit Session Title")).toBeNull()
    expect(agentApi.renameSession).not.toHaveBeenCalled()
  })
})

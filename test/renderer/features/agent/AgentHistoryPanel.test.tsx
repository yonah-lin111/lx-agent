// @vitest-environment jsdom

import type { AgentSessionSummary } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentHistoryPanel } from "@/features/agent"

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

type PanelProps = React.ComponentProps<typeof AgentHistoryPanel>

// 渲染面板（默认打开，可覆盖属性）。
const renderPanel = (props: Partial<PanelProps> = {}): ReturnType<typeof render> =>
  render(
    <AgentHistoryPanel
      isOpen
      onClose={vi.fn()}
      sessions={sessions}
      currentSessionId={null}
      projects={[{ id: "p1", name: "Project One" }]}
      onRestore={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />,
  )

describe("AgentHistoryPanel", () => {
  afterEach(cleanup)

  it("关闭态保持挂载但 inert 且上移收起", () => {
    const { container } = renderPanel({ isOpen: false })
    const dialog = container.querySelector<HTMLElement>(".agent-history-panel-dialog")
    expect(dialog).not.toBeNull()
    expect(dialog?.hasAttribute("inert")).toBe(true)
    expect(dialog?.style.transform).toBe("translateY(-100%)")
    expect(dialog?.style.pointerEvents).toBe("none")
  })

  it("打开态渲染标题、搜索框与全部会话", () => {
    const { container } = renderPanel()
    const dialog = container.querySelector<HTMLElement>(".agent-history-panel-dialog")
    expect(dialog?.hasAttribute("inert")).toBe(false)
    expect(dialog?.style.transform).toBe("translateY(0)")
    expect(screen.getByRole("dialog", { name: "Chat History" })).not.toBeNull()
    expect(screen.getByPlaceholderText("Search history sessions...")).not.toBeNull()
    expect(screen.getByText("Alpha session")).not.toBeNull()
    expect(screen.getByText("Beta session")).not.toBeNull()
  })

  it("按标题搜索过滤会话列表", () => {
    renderPanel()
    fireEvent.change(screen.getByPlaceholderText("Search history sessions..."), {
      target: { value: "beta" },
    })
    expect(screen.queryByText("Alpha session")).toBeNull()
    expect(screen.getByText("Beta session")).not.toBeNull()
  })

  it("重新打开面板时重置搜索筛选", () => {
    const view = renderPanel()
    fireEvent.change(screen.getByPlaceholderText("Search history sessions..."), {
      target: { value: "beta" },
    })
    expect(screen.queryByText("Alpha session")).toBeNull()
    const props: PanelProps = {
      isOpen: false,
      onClose: vi.fn(),
      sessions,
      currentSessionId: null,
      projects: [{ id: "p1", name: "Project One" }],
      onRestore: vi.fn(),
      onDelete: vi.fn(),
    }
    view.rerender(<AgentHistoryPanel {...props} />)
    view.rerender(<AgentHistoryPanel {...props} isOpen />)
    expect(screen.getByText("Alpha session")).not.toBeNull()
    expect(screen.getByText("Beta session")).not.toBeNull()
  })

  it("Current Project tag 只保留当前项目会话", () => {
    renderPanel({ currentProjectId: "p1" })
    fireEvent.click(screen.getByText("Current Project"))
    expect(screen.getByText("Alpha session")).not.toBeNull()
    expect(screen.queryByText("Beta session")).toBeNull()
  })

  it("点击非当前会话触发恢复，当前会话项禁用并标记", () => {
    const onRestore = vi.fn()
    const { container } = renderPanel({ currentSessionId: "s1", onRestore })
    const currentRows = container.querySelectorAll('[data-session-current="true"]')
    expect(currentRows).toHaveLength(1)
    expect(currentRows[0]?.textContent).toContain("Alpha session")
    const alphaButton = screen.getByText("Alpha session").closest("button")
    expect(alphaButton?.disabled).toBe(true)
    fireEvent.click(screen.getByText("Beta session"))
    expect(onRestore).toHaveBeenCalledWith("s2")
  })

  it("关闭按钮触发 onClose", () => {
    const onClose = vi.fn()
    renderPanel({ onClose })
    fireEvent.click(screen.getByRole("button", { name: "Close History Panel" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("删除需二次确认后才触发 onDelete", () => {
    const onDelete = vi.fn()
    renderPanel({ onDelete })
    fireEvent.click(screen.getAllByRole("button", { name: "More" })[0])
    fireEvent.click(screen.getByText("Delete"))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText("Confirm Delete"))
    expect(onDelete).toHaveBeenCalledWith("s1")
  })
})

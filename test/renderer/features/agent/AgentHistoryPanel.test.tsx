// @vitest-environment jsdom

import type { AgentSessionSummary } from "@shared/contracts/agent"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentHistoryPanel } from "@/features/agent"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"

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

// 可控的 IntersectionObserver：记录存活回调，供分页触底测试手动触发。
type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void
const observers = new Set<ObserverCallback>()
vi.stubGlobal(
  "IntersectionObserver",
  class {
    private readonly callback: ObserverCallback
    constructor(callback: ObserverCallback) {
      this.callback = callback
    }
    observe = (): void => {
      observers.add(this.callback)
    }
    unobserve = (): void => {
      observers.delete(this.callback)
    }
    disconnect = (): void => {
      observers.delete(this.callback)
    }
  },
)

// 模拟触底：通知全部存活观察者哨兵已进入视口。
const triggerLoadMore = (): void => {
  act(() => {
    for (const callback of observers) callback([{ isIntersecting: true }])
  })
}

// 构造会话摘要。
const createSession = (overrides: Partial<AgentSessionSummary>): AgentSessionSummary => ({
  id: "s1",
  title: "Alpha session",
  cwd: "/tmp/alpha",
  projectId: "p1",
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

const sessions: AgentSessionSummary[] = [
  createSession({ id: "s1", title: "Alpha session", projectId: "p1" }),
  createSession({ id: "s2", title: "Beta session", projectId: null }),
]

// 生成指定数量的普通会话（updatedAt 依次递增，标题稳定可断言）。
const createRegularSessions = (count: number): AgentSessionSummary[] =>
  Array.from({ length: count }, (_, index) =>
    createSession({
      id: `r${index}`,
      title: `Session ${index}`,
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    }),
  )

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
      onDeleteMany={vi.fn().mockResolvedValue(true)}
      {...props}
    />,
  )

describe("AgentHistoryPanel", () => {
  afterEach(() => {
    cleanup()
    observers.clear()
    delete (window as unknown as { api?: unknown }).api
  })

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
      onDeleteMany: vi.fn().mockResolvedValue(true),
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

  it("会话行渲染为二级 LxNavItem 并标记当前会话", () => {
    const { container } = renderPanel({ currentSessionId: "s1" })
    const rows = container.querySelectorAll(".lx-nav-item")
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.getAttribute("data-item-level")).toBe("2")
    }
    const currentRows = container.querySelectorAll('[data-session-current="true"]')
    expect(currentRows).toHaveLength(1)
    expect(currentRows[0]?.textContent).toContain("Alpha session")
    expect(currentRows[0]?.getAttribute("aria-current")).toBe("page")
  })

  it("点击非当前会话触发恢复，当前会话不触发", () => {
    const onRestore = vi.fn()
    renderPanel({ currentSessionId: "s1", onRestore })
    fireEvent.click(screen.getByText("Alpha session"))
    expect(onRestore).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText("Beta session"))
    expect(onRestore).toHaveBeenCalledWith("s2")
  })

  it("关闭按钮触发 onClose", () => {
    const onClose = vi.fn()
    renderPanel({ onClose })
    fireEvent.click(screen.getByRole("button", { name: "Close History Panel" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("不再渲染更多按钮，右键会话行打开上下文菜单", () => {
    renderPanel()
    expect(screen.queryByRole("button", { name: "More" })).toBeNull()
    const row = screen.getByText("Alpha session").closest(".agent-history-session-row")
    expect(row).not.toBeNull()
    fireEvent.contextMenu(row!)
    expect(screen.getByRole("menu", { name: "More" })).not.toBeNull()
    expect(screen.getByText("Rename")).not.toBeNull()
  })

  it("右键菜单打开期间触发行保持 hover 高亮，关闭后还原", () => {
    renderPanel()
    const row = screen.getByText("Alpha session").closest(".agent-history-session-row")
    expect(row?.getAttribute("data-menu-open")).toBeNull()
    fireEvent.contextMenu(row!)
    expect(row?.getAttribute("data-menu-open")).toBe("true")
    fireEvent.keyDown(document, { key: "Escape" })
    expect(row?.getAttribute("data-menu-open")).toBeNull()
  })

  it("标题生成中的会话行不响应右键菜单", () => {
    sessionListStore.setSessionTitlePending("s1")
    try {
      const { container } = renderPanel()
      const row = container.querySelectorAll(".agent-history-session-row")[0]
      fireEvent.contextMenu(row!)
      expect(screen.queryByRole("menu")).toBeNull()
    } finally {
      sessionListStore.updateSessionTitle("s1", "Alpha session")
    }
  })

  it("删除需二次确认后才触发 onDelete", () => {
    const onDelete = vi.fn()
    renderPanel({ onDelete })
    const row = screen.getByText("Alpha session").closest(".agent-history-session-row")
    fireEvent.contextMenu(row!)
    fireEvent.click(screen.getByText("Delete"))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText("Confirm Delete"))
    expect(onDelete).toHaveBeenCalledWith("s1")
  })

  it("默认渲染 30 条普通会话，置顶项恒显且不占分页名额", () => {
    const pinnedSessions = [
      createSession({ id: "pin1", title: "Pinned One", pinned: true }),
      createSession({ id: "pin2", title: "Pinned Two", pinned: true }),
    ]
    const { container } = renderPanel({
      sessions: [...pinnedSessions, ...createRegularSessions(35)],
    })
    expect(container.querySelectorAll('[data-pinned="true"]')).toHaveLength(2)
    expect(
      container.querySelectorAll(".agent-history-session-row:not([data-pinned])"),
    ).toHaveLength(30)
    expect(screen.getByText("Pinned One")).not.toBeNull()
    expect(screen.queryByText("Session 34")).toBeNull()
  })

  it("触底每次追加 20 条普通会话", () => {
    const { container } = renderPanel({ sessions: createRegularSessions(60) })
    expect(container.querySelectorAll(".agent-history-session-row")).toHaveLength(30)

    triggerLoadMore()
    expect(container.querySelectorAll(".agent-history-session-row")).toHaveLength(50)
    expect(screen.getByText("Session 49")).not.toBeNull()
    expect(screen.queryByText("Session 50")).toBeNull()

    triggerLoadMore()
    expect(container.querySelectorAll(".agent-history-session-row")).toHaveLength(60)
    expect(screen.getByText("Session 59")).not.toBeNull()
  })

  it("筛选变化时重置分页回 30 条", () => {
    const { container } = renderPanel({ sessions: createRegularSessions(60) })
    triggerLoadMore()
    expect(container.querySelectorAll(".agent-history-session-row")).toHaveLength(50)

    fireEvent.change(screen.getByPlaceholderText("Search history sessions..."), {
      target: { value: "Session" },
    })
    expect(container.querySelectorAll(".agent-history-session-row")).toHaveLength(30)
  })

  it("置顶会话行渲染置顶标识与差异化样式，菜单提供取消置顶", () => {
    renderPanel({
      sessions: [
        createSession({ id: "s1", title: "Alpha session", pinned: true }),
        createSession({ id: "s2", title: "Beta session", projectId: null }),
      ],
    })
    const row = screen.getByText("Alpha session").closest(".agent-history-session-row")
    expect(row?.getAttribute("data-pinned")).toBe("true")
    expect(row?.className).toContain("agent-history-session-row--pinned")
    expect(row?.className).toContain("bg-[var(--color-theme-surface-hover)]")
    expect(row?.className).not.toContain("border-l")
    expect(row?.querySelector("svg")).not.toBeNull()

    fireEvent.contextMenu(row!)
    expect(screen.getByText("Unpin")).not.toBeNull()
  })

  it("右键置顶写入 IPC", async () => {
    const setSessionPinned = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { api: { agent: { setSessionPinned: typeof setSessionPinned } } }).api =
      { agent: { setSessionPinned } }

    renderPanel()
    const row = screen.getByText("Alpha session").closest(".agent-history-session-row")
    fireEvent.contextMenu(row!)
    fireEvent.click(screen.getByText("Pin"))
    await waitFor(() => {
      expect(setSessionPinned).toHaveBeenCalledWith("s1", true)
    })
  })

  it("多选模式勾选会话并在二次确认后批量删除", async () => {
    const onDeleteMany = vi.fn().mockResolvedValue(true)
    renderPanel({ onDeleteMany })

    fireEvent.click(screen.getByRole("button", { name: "Select Sessions" }))
    expect(screen.getAllByRole("checkbox")).toHaveLength(2)
    expect(screen.getByText("0 selected")).not.toBeNull()

    fireEvent.click(screen.getByText("Alpha session"))
    expect(screen.getByText("1 selected")).not.toBeNull()

    // 删除为 icon + Tooltip 二次确认：首次点击仅展开确认气泡。
    fireEvent.click(screen.getByRole("button", { name: "Delete Selected" }))
    expect(onDeleteMany).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText("Confirm"))
    expect(onDeleteMany).toHaveBeenCalledWith(["s1"])

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Select Sessions" })).not.toBeNull()
    })
  })

  it("多选模式下点击复选框不会重复切换勾选", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Select Sessions" }))
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[0]!)
    expect(screen.getByText("1 selected")).not.toBeNull()
    fireEvent.click(checkboxes[0]!)
    expect(screen.getByText("0 selected")).not.toBeNull()
  })

  it("批量删除被拒绝时保留多选态", async () => {
    const onDeleteMany = vi.fn().mockResolvedValue(false)
    renderPanel({ onDeleteMany })

    fireEvent.click(screen.getByRole("button", { name: "Select Sessions" }))
    fireEvent.click(screen.getByText("Alpha session"))
    fireEvent.click(screen.getByRole("button", { name: "Delete Selected" }))
    fireEvent.click(screen.getByLabelText("Confirm"))

    await waitFor(() => {
      expect(onDeleteMany).toHaveBeenCalledWith(["s1"])
    })
    expect(screen.getAllByRole("checkbox")).toHaveLength(2)
    expect(screen.getByText("1 selected")).not.toBeNull()
  })

  it("多选模式下可取消并退出多选", () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "Select Sessions" }))
    fireEvent.click(screen.getByText("Alpha session"))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.getByRole("button", { name: "Select Sessions" })).not.toBeNull()
  })

  it("标题生成中的会话在多选模式下不可勾选", () => {
    sessionListStore.setSessionTitlePending("s1")
    try {
      renderPanel()
      fireEvent.click(screen.getByRole("button", { name: "Select Sessions" }))
      const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[]
      expect(checkboxes[0]?.disabled).toBe(true)
      expect(checkboxes[1]?.disabled).toBe(false)

      fireEvent.click(screen.getByText("Beta session"))
      expect(screen.getByText("1 selected")).not.toBeNull()
    } finally {
      sessionListStore.updateSessionTitle("s1", "Alpha session")
    }
  })
})

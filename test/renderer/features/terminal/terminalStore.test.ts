import { beforeEach, describe, expect, it, vi } from "vitest"
import { useTerminalStore } from "@/features/terminal/terminalStore"

const mockHasRunningProcess = vi.fn()

vi.mock("@/features/terminal/api/terminalApi", () => ({
  terminalApi: {
    kill: vi.fn(),
    hasRunningProcess: (id: string) => mockHasRunningProcess(id),
  },
}))

describe("terminalStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasRunningProcess.mockResolvedValue(false)
    useTerminalStore.setState({
      tabs: [],
      activeTabId: null,
      terminalCounter: 1,
      pendingCloseTabId: null,
      pendingClosePaneId: null,
    })
  })

  it("支持新增标签页并自动递增默认标题与激活新建标签", () => {
    const id1 = useTerminalStore.getState().addTab()
    expect(useTerminalStore.getState().tabs).toHaveLength(1)
    expect(useTerminalStore.getState().tabs[0]?.title).toBe("Terminal 1")
    expect(useTerminalStore.getState().activeTabId).toBe(id1)

    const id2 = useTerminalStore.getState().addTab({ title: "Custom" })
    expect(useTerminalStore.getState().tabs).toHaveLength(2)
    expect(useTerminalStore.getState().tabs[1]?.title).toBe("Custom")
    expect(useTerminalStore.getState().activeTabId).toBe(id2)
  })

  it("支持重命名标签页", () => {
    const id = useTerminalStore.getState().addTab()
    useTerminalStore.getState().updateTabTitle(id, "My Shell")
    expect(useTerminalStore.getState().tabs[0]?.title).toBe("My Shell")
  })

  it("删除激活标签页时自动激活相邻标签", () => {
    const id1 = useTerminalStore.getState().addTab()
    const id2 = useTerminalStore.getState().addTab()
    const id3 = useTerminalStore.getState().addTab()

    // 当前 active 是 id3
    useTerminalStore.getState().removeTab(id3)
    expect(useTerminalStore.getState().tabs).toHaveLength(2)
    expect(useTerminalStore.getState().activeTabId).toBe(id2)

    // 当前 active 是 id2，删除 id2
    useTerminalStore.getState().removeTab(id2)
    expect(useTerminalStore.getState().tabs).toHaveLength(1)
    expect(useTerminalStore.getState().activeTabId).toBe(id1)

    // 删除最后一个
    useTerminalStore.getState().removeTab(id1)
    expect(useTerminalStore.getState().tabs).toHaveLength(0)
    expect(useTerminalStore.getState().activeTabId).toBeNull()
  })

  it("支持分屏并在 Store 中调整分屏比例，新分屏默认标题使用工作目录名而非 Terminal", () => {
    const tabId = useTerminalStore.getState().addTab({ cwd: "/workspace/my-feature" })
    const newPaneId = useTerminalStore
      .getState()
      .splitPane(tabId, "horizontal", "/workspace/backend-api")
    expect(newPaneId).toBeTruthy()

    const tab = useTerminalStore.getState().tabs.find((t) => t.id === tabId)
    expect(tab).toBeDefined()
    expect(Object.keys(tab!.panes)).toHaveLength(2)
    expect(tab!.panes[newPaneId!]?.title).toBe("backend-api")
    expect(tab!.title).toBe("backend-api")
    expect(tab!.rootNode.type).toBe("split")

    if (tab!.rootNode.type === "split") {
      const containerId = tab!.rootNode.id
      expect(tab!.rootNode.ratio).toBe(0.5)

      // 调整为 0.35
      useTerminalStore.getState().setSplitRatio(tabId, containerId, 0.35)
      const updatedTab = useTerminalStore.getState().tabs.find((t) => t.id === tabId)
      if (updatedTab?.rootNode.type === "split") {
        expect(updatedTab.rootNode.ratio).toBe(0.35)
      }

      // 测试极值 clamp
      useTerminalStore.getState().setSplitRatio(tabId, containerId, 0.01)
      const clampedTab = useTerminalStore.getState().tabs.find((t) => t.id === tabId)
      if (clampedTab?.rootNode.type === "split") {
        expect(clampedTab.rootNode.ratio).toBe(0.05)
      }
    }
  })

  it("支持更新分屏标题并同步至活跃标签页标题", () => {
    useTerminalStore.getState().addTab()
    const tab = useTerminalStore.getState().tabs[0]!
    const paneId = tab.activePaneId

    // 初始标题为默认 Terminal 1
    expect(tab.title).toBe("Terminal 1")
    expect(tab.panes[paneId]?.title).toBe("Terminal 1")

    // 动态更新 PTY 标题（如 CLI 输出的 OSC 序列）
    useTerminalStore.getState().updatePaneTitle(paneId, "claude")
    const updatedTab = useTerminalStore.getState().tabs[0]!
    expect(updatedTab.title).toBe("claude")
    expect(updatedTab.panes[paneId]?.title).toBe("claude")
  })

  it("多分屏时支持各分屏拥有独立标题，Tab 标题跟随活跃分屏", () => {
    const tabId = useTerminalStore.getState().addTab()
    const pane1Id = useTerminalStore.getState().tabs[0]!.activePaneId

    // 分屏创建 Pane 2
    const pane2Id = useTerminalStore.getState().splitPane(tabId, "horizontal")!
    expect(pane2Id).toBeTruthy()

    // 设置 Pane 1 标题为 'claude'，Pane 2 标题为 'vite dev'
    useTerminalStore.getState().updatePaneTitle(pane1Id, "claude")
    useTerminalStore.getState().updatePaneTitle(pane2Id, "vite dev")

    const state1 = useTerminalStore.getState().tabs[0]!
    // 当前 activePane 是 pane2Id
    expect(state1.activePaneId).toBe(pane2Id)
    expect(state1.title).toBe("vite dev")
    expect(state1.panes[pane1Id]?.title).toBe("claude")
    expect(state1.panes[pane2Id]?.title).toBe("vite dev")

    // 切换活跃分屏至 Pane 1
    useTerminalStore.getState().setActivePane(tabId, pane1Id)
    const state2 = useTerminalStore.getState().tabs[0]!
    expect(state2.activePaneId).toBe(pane1Id)
    expect(state2.title).toBe("claude")
  })

  it("用户手动重命名标签页（customTitle）后锁定标题，不被分屏动态标题覆盖", () => {
    const tabId = useTerminalStore.getState().addTab()
    const paneId = useTerminalStore.getState().tabs[0]!.activePaneId

    // 用户手动重命名
    useTerminalStore.getState().updateTabTitle(tabId, "My Work Tab")
    expect(useTerminalStore.getState().tabs[0]!.title).toBe("My Work Tab")
    expect(useTerminalStore.getState().tabs[0]!.customTitle).toBe("My Work Tab")

    // CLI 动态更新标题，Pane 标题更新但 Tab 保持锁定
    useTerminalStore.getState().updatePaneTitle(paneId, "claude-code")
    const updatedTab = useTerminalStore.getState().tabs[0]!
    expect(updatedTab.title).toBe("My Work Tab")
    expect(updatedTab.panes[paneId]?.title).toBe("claude-code")

    // 用户清空自定义重命名，Tab 标题恢复为活跃分屏标题
    useTerminalStore.getState().updateTabTitle(tabId, "   ")
    const clearedTab = useTerminalStore.getState().tabs[0]!
    expect(clearedTab.customTitle).toBeUndefined()
    expect(clearedTab.title).toBe("claude-code")
  })

  it("关闭分屏后 Tab 标题正确跟随剩余分屏", () => {
    const tabId = useTerminalStore.getState().addTab()
    const pane1Id = useTerminalStore.getState().tabs[0]!.activePaneId
    const pane2Id = useTerminalStore.getState().splitPane(tabId, "horizontal")!

    useTerminalStore.getState().updatePaneTitle(pane1Id, "main-server")
    useTerminalStore.getState().updatePaneTitle(pane2Id, "aux-tool")

    // 当前 active 是 pane2Id，关闭 pane2Id
    useTerminalStore.getState().removePane(tabId, pane2Id)

    const updatedTab = useTerminalStore.getState().tabs[0]!
    expect(updatedTab.activePaneId).toBe(pane1Id)
    expect(updatedTab.title).toBe("main-server")
    expect(Object.keys(updatedTab.panes)).toHaveLength(1)
  })

  it("无运行任务时 requestCloseTab 直接关闭标签页", async () => {
    mockHasRunningProcess.mockResolvedValue(false)
    const tabId = useTerminalStore.getState().addTab()

    const closed = await useTerminalStore.getState().requestCloseTab(tabId)
    expect(closed).toBe(true)
    expect(useTerminalStore.getState().tabs).toHaveLength(0)
    expect(useTerminalStore.getState().pendingCloseTabId).toBeNull()
  })

  it("存在运行任务时 requestCloseTab 设置 pendingCloseTabId 进行二次确认", async () => {
    mockHasRunningProcess.mockResolvedValue(true)
    const tabId = useTerminalStore.getState().addTab()

    const closed = await useTerminalStore.getState().requestCloseTab(tabId)
    expect(closed).toBe(false)
    expect(useTerminalStore.getState().tabs).toHaveLength(1)
    expect(useTerminalStore.getState().pendingCloseTabId).toBe(tabId)
  })

  it("分屏存在运行任务时 requestCloseTab 同样需要二次确认", async () => {
    const tabId = useTerminalStore.getState().addTab()
    const pane2Id = useTerminalStore.getState().splitPane(tabId, "horizontal")!

    // pane1 无任务，pane2 有任务
    mockHasRunningProcess.mockImplementation((id: string) => Promise.resolve(id === pane2Id))

    const closed = await useTerminalStore.getState().requestCloseTab(tabId)
    expect(closed).toBe(false)
    expect(useTerminalStore.getState().pendingCloseTabId).toBe(tabId)
    expect(useTerminalStore.getState().tabs).toHaveLength(1)
  })

  it("无运行任务时 requestClosePane 直接关闭分屏", async () => {
    mockHasRunningProcess.mockResolvedValue(false)
    const tabId = useTerminalStore.getState().addTab()
    const pane2Id = useTerminalStore.getState().splitPane(tabId, "horizontal")!

    const closed = await useTerminalStore.getState().requestClosePane(tabId, pane2Id)
    expect(closed).toBe(true)
    expect(useTerminalStore.getState().pendingClosePaneId).toBeNull()
    expect(Object.keys(useTerminalStore.getState().tabs[0]!.panes)).toHaveLength(1)
  })

  it("存在运行任务时 requestClosePane 设置 pendingClosePaneId 进行二次确认", async () => {
    const tabId = useTerminalStore.getState().addTab()
    const pane2Id = useTerminalStore.getState().splitPane(tabId, "horizontal")!

    mockHasRunningProcess.mockImplementation((id: string) => Promise.resolve(id === pane2Id))

    const closed = await useTerminalStore.getState().requestClosePane(tabId, pane2Id)
    expect(closed).toBe(false)
    expect(useTerminalStore.getState().pendingClosePaneId).toBe(pane2Id)
    expect(Object.keys(useTerminalStore.getState().tabs[0]!.panes)).toHaveLength(2)
  })
})

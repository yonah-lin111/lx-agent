// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { FrontDesignLeftSideBar } from "@/pages/front-design/components/FrontDesignLeftSideBar"

// mock LxTooltip
vi.mock("@/components/ui/LxTooltip", () => {
  return {
    LxTooltip: ({ children }: any) => <>{children}</>,
  }
})

describe("FrontDesignLeftSideBar 侧边栏多 Tab 原型树", () => {
  const resetTabs = () => {
    const currentTabs = [...agentTabStore.getTabs()]
    for (let i = 1; i < currentTabs.length; i++) {
      agentTabStore.closeTab(currentTabs[i].id)
    }
    const firstTab = agentTabStore.getTabs()[0]
    agentTabStore.switchTab(firstTab.id)
    agentTabStore.setTabTitle(firstTab.id, "")
    agentTabStore.setTabSessionId(firstTab.id, null)
  }

  beforeEach(() => {
    cleanup()
    frontDesignStore.clear()
    localStorage.clear()
    resetTabs()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    frontDesignStore.clear()
    localStorage.clear()
    resetTabs()
  })

  it("渲染全量 Tab 与空状态（空 Tab 显示 (0) 与空占位）", () => {
    const tab1Id = agentTabStore.getActiveTabId()
    agentTabStore.setTabTitle(tab1Id, "Feature Tab 1")
    agentTabStore.setTabSessionId(tab1Id, "session-1")

    // 创建 Tab 2
    const tab2Id = agentTabStore.createTab("session-2")!
    agentTabStore.setTabTitle(tab2Id, "Empty Tab 2")

    // 给 Tab 1 注册一个设计原型
    frontDesignStore.registerDesign({
      id: "design-1",
      title: "Tab 1 Design",
      html: "<div>Tab 1</div>",
      sessionId: "session-1",
      updatedAt: 1000,
    })

    const { container } = render(<FrontDesignLeftSideBar />)

    // 应该渲染两个 Tab 节点
    expect(screen.getByText("Feature Tab 1")).not.toBeNull()
    expect(screen.getByText("Empty Tab 2")).not.toBeNull()

    // Tab 1 下应该有设计项
    expect(screen.getByText("Tab 1 Design")).not.toBeNull()

    // Tab 2 下应该有空占位
    const emptyNotice = screen.getByText(/当前会话暂无设计历史|no designs in this session/i)
    expect(emptyNotice).not.toBeNull()

    // 标题栏设计总数应为 1
    const countBadges = container.querySelectorAll(".font-mono")
    expect(Array.from(countBadges).some((el) => el.textContent === "1")).toBe(true)
  })

  it("点击 Tab 节点切换激活 Tab，点击折叠箭头仅切换展开收起", () => {
    const tab1Id = agentTabStore.getActiveTabId()
    agentTabStore.setTabTitle(tab1Id, "Tab 1")
    agentTabStore.setTabSessionId(tab1Id, "session-1")

    const tab2Id = agentTabStore.createTab("session-2")!
    agentTabStore.setTabTitle(tab2Id, "Tab 2")

    frontDesignStore.registerDesign({
      id: "design-tab-1",
      title: "Tab 1 Item",
      html: "<div>1</div>",
      sessionId: "session-1",
    })

    frontDesignStore.registerDesign({
      id: "design-tab-2",
      title: "Tab 2 Item",
      html: "<div>2</div>",
      sessionId: "session-2",
    })

    // 初始激活为 Tab 2（因为刚新建）
    expect(agentTabStore.getActiveTabId()).toBe(tab2Id)

    render(<FrontDesignLeftSideBar />)

    // 点击 Tab 1 整行：应切换激活 Tab 到 Tab 1
    const tab1Row = screen.getByText("Tab 1").closest("[data-item-level='tab']")!
    fireEvent.click(tab1Row)
    expect(agentTabStore.getActiveTabId()).toBe(tab1Id)

    // 此时 Tab 1 的设计项应可见
    expect(screen.getByText("Tab 1 Item")).not.toBeNull()

    // 点击 Tab 1 的折叠箭头（阻止了整行点击的冒泡）
    const chevronBtn = tab1Row.querySelector("[role='button']")!
    fireEvent.click(chevronBtn)

    // 折叠后 Tab 1 Item 不再可见
    expect(screen.queryByText("Tab 1 Item")).toBeNull()
  })

  it("点击设计项节点激活设计并联动切换所属 Tab", () => {
    const tab1Id = agentTabStore.getActiveTabId()
    agentTabStore.setTabTitle(tab1Id, "Tab 1")
    agentTabStore.setTabSessionId(tab1Id, "session-1")

    const tab2Id = agentTabStore.createTab("session-2")!
    agentTabStore.setTabTitle(tab2Id, "Tab 2")

    // 切回 Tab 1
    agentTabStore.switchTab(tab1Id)

    frontDesignStore.registerDesign({
      id: "design-tab-2",
      title: "Tab 2 Target Design",
      html: "<div>Tab 2 Target</div>",
      sessionId: "session-2",
    })

    render(<FrontDesignLeftSideBar />)

    // 当前激活 Tab 为 Tab 1
    expect(agentTabStore.getActiveTabId()).toBe(tab1Id)

    // 点击 Tab 2 下面的设计项
    const designItem = screen.getByText("Tab 2 Target Design")
    fireEvent.click(designItem)

    // 设计项被激活
    expect(frontDesignStore.getState().activeDesignId).toBe("design-tab-2")

    // agentTabStore 同步切换到 Tab 2
    expect(agentTabStore.getActiveTabId()).toBe(tab2Id)
  })

  it("搜索关键字过滤设计原型，匹配 Tab 保持展开", () => {
    const tab1Id = agentTabStore.getActiveTabId()
    agentTabStore.setTabTitle(tab1Id, "Main Tab")
    agentTabStore.setTabSessionId(tab1Id, "session-1")

    const tab2Id = agentTabStore.createTab("session-2")!
    agentTabStore.setTabTitle(tab2Id, "Other Tab")

    frontDesignStore.registerDesign({
      id: "d1",
      title: "Alpha Prototype",
      html: "<div>Alpha</div>",
      sessionId: "session-1",
    })

    frontDesignStore.registerDesign({
      id: "d2",
      title: "Beta Component",
      html: "<div>Beta</div>",
      sessionId: "session-2",
    })

    render(<FrontDesignLeftSideBar />)

    const searchInput = screen.getByPlaceholderText(/搜索设计|search designs/i)

    // 搜索 "Alpha"
    fireEvent.change(searchInput, { target: { value: "Alpha" } })

    expect(screen.getByText("Alpha Prototype")).not.toBeNull()
    expect(screen.queryByText("Beta Component")).toBeNull()
  })

  it("点击删除按钮从 frontDesignStore 移除设计项", () => {
    const tabId = agentTabStore.getActiveTabId()
    agentTabStore.setTabSessionId(tabId, "session-del")

    frontDesignStore.registerDesign({
      id: "design-to-delete",
      title: "Deletable Design",
      html: "<div>delete me</div>",
      sessionId: "session-del",
    })

    render(<FrontDesignLeftSideBar />)

    expect(screen.getByText("Deletable Design")).not.toBeNull()

    const deleteBtn = screen.getByRole("button", { name: /删除此设计|delete design/i })
    fireEvent.click(deleteBtn)

    expect(screen.queryByText("Deletable Design")).toBeNull()
    expect(frontDesignStore.getAllDesigns().length).toBe(0)
  })

  it("折叠模式 (isCollapsed=true) 渲染精简图标导航", () => {
    const tabId = agentTabStore.getActiveTabId()
    agentTabStore.setTabSessionId(tabId, "session-c")

    frontDesignStore.registerDesign({
      id: "design-icon-test",
      title: "Icon Prototype",
      html: "<div>icon</div>",
      sessionId: "session-c",
    })

    const { container } = render(<FrontDesignLeftSideBar isCollapsed={true} />)

    // 折叠模式不渲染搜索框和文字树
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByText("Icon Prototype")).toBeNull()

    // 渲染了带图标的 IconButton
    const iconBtn = screen.getByRole("button", { name: "Icon Prototype" })
    expect(iconBtn).not.toBeNull()

    // 点击图标按钮激活该设计项
    fireEvent.click(iconBtn)
    expect(frontDesignStore.getState().activeDesignId).toBe("design-icon-test")
  })
})

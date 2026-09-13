// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
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

  it("点击 Tab 节点仅切换展开与收起，不切换激活 Tab 也不会打开设计", () => {
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

    // Tab 1 默认展开，设计项可见
    expect(screen.getByText("Tab 1 Item")).not.toBeNull()

    // 点击 Tab 1 整行：仅收起 Tab 1，不切换 agentTabStore，不激活 Tab 1 设计
    const tab1Row = screen.getByText("Tab 1").closest("[data-item-level='tab']")!
    // 统一使用默认尺寸的 LxNavItem
    expect(tab1Row.className).toContain("lx-nav-item")
    expect(tab1Row.className).toContain("h-7")
    fireEvent.click(tab1Row)

    // agentTabStore 依然保持在 Tab 2
    expect(agentTabStore.getActiveTabId()).toBe(tab2Id)

    // 折叠后 Tab 1 Item 不再可见
    expect(screen.queryByText("Tab 1 Item")).toBeNull()

    // 再次点击 Tab 1 整行：重新展开
    fireEvent.click(tab1Row)
    expect(screen.getByText("Tab 1 Item")).not.toBeNull()
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

    render(<FrontDesignLeftSideBar isCollapsed={true} />)

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

  it("在设计卡片流式生成内容时支持切换至其他 item，且后续流式不会抢占焦点", () => {
    const tabId = agentTabStore.getActiveTabId()
    agentTabStore.setTabSessionId(tabId, "session-stream")

    // 先注册一个已有历史设计
    frontDesignStore.registerDesign({
      id: "design-history",
      title: "History Design",
      html: "<div>Old version</div>",
      sessionId: "session-stream",
    })

    // 开始流式生成新设计（第一块）
    frontDesignStore.registerDesign({
      id: "design-generating",
      title: "Generating Design",
      html: "<div>Gen part 1",
      isStreaming: true,
      sessionId: "session-stream",
    })

    render(<FrontDesignLeftSideBar />)

    // 用户在流式生成中手动切换到历史设计
    const historyItem = screen.getByText("History Design")
    fireEvent.click(historyItem)
    expect(frontDesignStore.getState().activeDesignId).toBe("design-history")

    // 后续流式块持续到达（数据静默更新）
    frontDesignStore.registerDesign({
      id: "design-generating",
      title: "Generating Design",
      html: "<div>Gen part 1 and part 2</div>",
      isStreaming: true,
      sessionId: "session-stream",
    })

    // 焦点绝不应被抢占，依然保持在用户选中的历史设计
    expect(frontDesignStore.getState().activeDesignId).toBe("design-history")

    // 生成的设计数据已在后台更新
    const genItem = frontDesignStore.getAllDesigns().find((d) => d.id === "design-generating")
    expect(genItem?.html).toBe("<div>Gen part 1 and part 2</div>")
  })

  it("左侧栏无需版本切换，仅展示单行标题与当前版本徽标，不渲染子版本展开与折叠角标", () => {
    const tabId = agentTabStore.getActiveTabId()
    agentTabStore.setTabSessionId(tabId, "session-version")

    frontDesignStore.registerDesign({
      id: "design-v1",
      title: "Settings View",
      html: "<div>V1</div>",
      sessionId: "session-version",
    })

    frontDesignStore.registerDesign({
      id: "design-v2",
      title: "Settings View",
      html: "<div>V2</div>",
      sessionId: "session-version",
      parentId: "design-v1",
      autoActivate: true,
    })

    render(<FrontDesignLeftSideBar />)

    // 展示主设计项与当前激活版本徽标（v2）
    expect(screen.getByText("Settings View")).not.toBeNull()
    expect(screen.getByText("v2")).not.toBeNull()

    // 侧边栏不应渲染多版本展开角标（2v）或子版本条目
    expect(screen.queryByText("2v")).toBeNull()
    expect(screen.queryByText("Settings View v2")).toBeNull()
  })

  it("左侧栏版本徽标镜像同步当前激活版本，点击卡片保持当前选中的版本", () => {
    const tabId = agentTabStore.getActiveTabId()
    agentTabStore.setTabSessionId(tabId, "session-v3")

    // 1. 注册 v1
    frontDesignStore.registerDesign({
      id: "profile-v1",
      title: "User Profile",
      html: "<div>V1</div>",
      sessionId: "session-v3",
    })

    // 2. 衍生 v2
    frontDesignStore.registerDesign({
      id: "profile-v2",
      title: "User Profile",
      html: "<div>V2</div>",
      sessionId: "session-v3",
      parentId: "profile-v1",
    })

    // 3. 衍生 v3（激活最新版）
    frontDesignStore.registerDesign({
      id: "profile-v3",
      title: "User Profile",
      html: "<div>V3</div>",
      sessionId: "session-v3",
      parentId: "profile-v2",
      autoActivate: true,
    })

    const { rerender } = render(<FrontDesignLeftSideBar />)

    // 当前激活为 v3，侧边栏徽标显示 v3，无展开角标 3v
    expect(screen.queryByText("3v")).toBeNull()
    expect(screen.getByText("v3")).not.toBeNull()

    // 用户在设计页面切换至历史版本 v1
    frontDesignStore.setActiveDesignId("profile-v1")
    rerender(<FrontDesignLeftSideBar />)

    // 左侧栏徽标自动同步响应，变为 v1
    expect(screen.getByText("v1")).not.toBeNull()
    expect(screen.queryByText("v3")).toBeNull()

    // 点击左侧栏该设计条目，保持激活当前版本 v1，绝不冲掉用户已选版本
    const cardItem = screen.getByText("User Profile")
    fireEvent.click(cardItem)
    expect(frontDesignStore.getState().activeDesignId).toBe("profile-v1")

    // 用户在设计页面切换至历史版本 v2
    frontDesignStore.setActiveDesignId("profile-v2")
    rerender(<FrontDesignLeftSideBar />)

    // 左侧栏徽标自动同步响应，变为 v2
    expect(screen.getByText("v2")).not.toBeNull()
    expect(screen.queryByText("v1")).toBeNull()
  })
})

// @vitest-environment jsdom
import type { UpdateState } from "@shared/contracts/update"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { AppIndexDashboard } from "@/features/app-index/components/AppIndexDashboard"

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}))

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}))

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const activityEntries = [
  { date: "2026-09-14", count: 3 },
  { date: "2026-09-15", count: 0 },
  { date: "2026-09-16", count: 2 },
]

const RELEASE_URL = "https://github.com/yonah-lin111/lx-agent/releases/tag/v0.2.0"

// 更新状态替身：用例中按需改写后渲染。
const updateHolder: { state: UpdateState } = {
  state: {
    currentVersion: "0.1.0",
    latestVersion: null,
    hasUpdate: false,
    releaseUrl: null,
    checkedAt: null,
    failed: false,
  },
}

describe("AppIndexDashboard", () => {
  beforeEach(() => {
    updateHolder.state = {
      currentVersion: "0.1.0",
      latestVersion: null,
      hasUpdate: false,
      releaseUrl: null,
      checkedAt: null,
      failed: false,
    }
    // @ts-expect-error Mock window.api
    window.api = {
      activity: {
        getDaily: vi.fn().mockResolvedValue(activityEntries),
      },
      update: {
        getState: vi.fn(() => Promise.resolve(updateHolder.state)),
        check: vi.fn(() => Promise.resolve(updateHolder.state)),
        onStateChanged: vi.fn(() => () => {}),
      },
    }
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    mockNavigate.mockClear()
  })

  it("渲染品牌 Hero、9 个紧凑快速入口与年度会话活跃度绿墙，且绿墙位于快速入口之前", async () => {
    const { container } = render(<AppIndexDashboard />)

    // Hero 品牌与文案
    expect(screen.getByAltText("LX Agent")).toBeDefined()
    expect(screen.getByText("LX AGENT")).toBeDefined()
    expect(screen.getByText("Agentic desktop workspace for prompt production")).toBeDefined()

    // 标题行裸图标（快速入口 / 活跃度）
    expect(container.querySelector(".app-index-section-icon--entries")).not.toBeNull()
    expect(container.querySelector(".app-index-section-icon--activity")).not.toBeNull()

    // 交换位置：绿墙卡片先于快速入口卡片出现在文档中
    const heatmapCard = container.querySelector(".activity-heatmap-card")
    const firstEntry = container.querySelector(".app-index-entry")
    expect(heatmapCard).not.toBeNull()
    expect(firstEntry).not.toBeNull()
    expect(heatmapCard?.compareDocumentPosition(firstEntry as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )

    // 9 个快速入口
    const entries = [
      "New Chat",
      "Projects",
      "Schedule",
      "Usage",
      "Games",
      "Front Design",
      "OpenClaw",
      "UI Preview",
      "Settings",
    ]
    for (const label of entries) {
      expect(screen.getByRole("button", { name: label })).toBeDefined()
    }

    // 绿墙标题与年度会话总数（3 + 2）
    await waitFor(() => {
      expect(screen.getByText("5 sessions")).toBeDefined()
    })
    expect(screen.getByText("Activity")).toBeDefined()
    expect(window.api.activity.getDaily).toHaveBeenCalledTimes(1)
  })

  it("快速入口卡片精简为图标与标题，无序号与内联描述", async () => {
    const { container } = render(<AppIndexDashboard />)

    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeDefined()
    })

    // 紧凑卡片：单行图标 + 标题
    const entryButton = screen.getByRole("button", { name: "Projects" })
    expect(entryButton.textContent).toBe("Projects")

    // 描述不再内联展示，且无序号角标
    expect(screen.queryByText("Manage prompts and project assets")).toBeNull()
    expect(container.querySelector(".app-index-entry")?.textContent).not.toMatch(/^\d{2}/)
  })

  it("悬停快速入口卡片时通过 LxInfoTooltip 展示 Markdown 说明", async () => {
    render(<AppIndexDashboard />)

    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeDefined()
    })

    const entryButton = screen.getByRole("button", { name: "Projects" })
    fireEvent.mouseEnter(entryButton)

    // 加粗标题 + 描述文案均来自现有词条的 Markdown 组合
    await waitFor(() => {
      expect(screen.getByText("Projects", { selector: "strong" })).toBeDefined()
    })
    expect(screen.getByText("Manage prompts and project assets")).toBeDefined()
  })

  it("点击带路由的入口跳转到对应页面", async () => {
    render(<AppIndexDashboard />)

    fireEvent.click(screen.getByRole("button", { name: "Projects" }))
    expect(mockNavigate).toHaveBeenCalledWith("/project")

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }))
    expect(mockNavigate).toHaveBeenCalledWith("/?view=schedule")

    fireEvent.click(screen.getByRole("button", { name: "Usage" }))
    expect(mockNavigate).toHaveBeenCalledWith("/?view=usage")

    fireEvent.click(screen.getByRole("button", { name: "Games" }))
    expect(mockNavigate).toHaveBeenCalledWith("/?view=game")

    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(mockNavigate).toHaveBeenCalledWith("/settings")
  })

  it("logo 为纯展示，不再提供游戏入口", () => {
    render(<AppIndexDashboard />)

    const logo = screen.getByAltText("LX Agent")
    expect(logo.tagName).toBe("IMG")
    expect(logo.closest("button")).toBeNull()
    expect(screen.queryByRole("button", { name: "Feeling lucky?" })).toBeNull()
  })

  it("点击新建对话入口创建 Agent Tab 而不跳转路由", () => {
    const createTab = vi.spyOn(agentTabStore, "createTab").mockReturnValue("tab-1")
    render(<AppIndexDashboard />)

    fireEvent.click(screen.getByRole("button", { name: "New Chat" }))

    expect(createTab).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("活跃数据加载失败时展示错误提示与重试入口", async () => {
    const getDaily = vi.fn().mockRejectedValue(new Error("boom"))
    // @ts-expect-error Mock window.api
    window.api = { activity: { getDaily } }

    render(<AppIndexDashboard />)

    await waitFor(() => {
      expect(screen.getByText("boom")).toBeDefined()
    })

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    await waitFor(() => {
      expect(getDaily).toHaveBeenCalledTimes(2)
    })
  })

  it("Hero 展示当前版本号", async () => {
    render(<AppIndexDashboard />)

    await waitFor(() => {
      expect(screen.getByText("v0.1.0")).toBeDefined()
    })
  })

  it("有可用新版本时展示更新横幅，点击忽略后本会话不再展示", async () => {
    updateHolder.state = {
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      hasUpdate: true,
      releaseUrl: RELEASE_URL,
      checkedAt: 1,
      failed: false,
    }

    render(<AppIndexDashboard />)

    await waitFor(() => {
      expect(screen.getByText("New version v0.2.0 is available (current v0.1.0)")).toBeDefined()
    })

    fireEvent.click(screen.getByRole("button", { name: "Ignore" }))

    await waitFor(() => {
      expect(screen.queryByText("New version v0.2.0 is available (current v0.1.0)")).toBeNull()
    })
  })

  it("更新横幅下载入口指向对应 Release 页", async () => {
    updateHolder.state = {
      currentVersion: "0.1.0",
      latestVersion: "0.3.0",
      hasUpdate: true,
      releaseUrl: RELEASE_URL,
      checkedAt: 1,
      failed: false,
    }

    render(<AppIndexDashboard />)

    const link = await screen.findByText("Download")
    expect(link.getAttribute("href")).toBe(RELEASE_URL)
  })
})

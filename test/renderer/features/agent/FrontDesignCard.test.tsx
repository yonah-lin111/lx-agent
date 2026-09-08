// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { FrontDesignCard } from "@/features/agent/components/blocks/FrontDesignCard"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"

const mockNavigate = vi.fn()
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock("@/components/ui/LxCodeBlock", () => ({
  LxCodeBlock: ({ code }: { code: string }) => <pre data-testid="code-block">{code}</pre>,
}))

describe("FrontDesignCard", () => {
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
    resetTabs()
    mockNavigate.mockClear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    frontDesignStore.clear()
    resetTabs()
  })

  it("正确渲染设计原型基础信息与代码行数", () => {
    render(
      <FrontDesignCard
        design={{
          id: "design-card-1",
          title: "Pricing Section",
          html: "<div>Pricing Plan</div>\n<div>Card 1</div>",
          raw: "<front_design>...",
          mode: "tailwindcss",
        }}
      />,
    )

    expect(screen.getByText("Pricing Section")).not.toBeNull()
    expect(screen.getByText(/2 行|2 lines/i)).not.toBeNull()
    expect(screen.getByText(/Tailwind CSS/i)).not.toBeNull()
  })

  it("当包含 version 与 parentId 时，展示版本徽标与基准血缘标示", () => {
    render(
      <FrontDesignCard
        design={{
          id: "design-card-v2",
          title: "Pricing Section v2",
          html: "<div>Pricing Plan v2</div>",
          raw: "<front_design>...",
          version: 2,
          parentId: "design-card-1",
        }}
      />,
    )

    expect(screen.getByText("Pricing Section v2")).not.toBeNull()
    expect(screen.getByText("v2")).not.toBeNull()
    expect(screen.getByText(/design-card-1/i)).not.toBeNull()
  })

  it("点击基于此迭代按钮，自动将设计标记注入到活动 Tab 并校准协作模式为 design", async () => {
    const activeTabId = agentTabStore.getActiveTabId()
    agentTabStore.setTabSessionId(activeTabId, "session-card-test")

    let injectedPrompt = ""
    const unregister = agentTabStore.registerInputSetter(activeTabId, (updater) => {
      injectedPrompt = typeof updater === "function" ? updater(injectedPrompt) : updater
    })

    const setCollabModeSpy = vi
      .spyOn(agentApi, "setCollaborationMode")
      .mockResolvedValue({ ok: true })

    render(
      <FrontDesignCard
        design={{
          id: "design-pricing-1",
          title: "Pricing Table",
          html: "<div>Table</div>",
          raw: "<front_design>...",
          sessionId: "session-card-test",
        }}
      />,
    )

    const iterateBtn = screen.getByRole("button", { name: /基于此迭代|Iterate/i })
    expect(iterateBtn).not.toBeNull()

    fireEvent.click(iterateBtn)
    await Promise.resolve()
    await Promise.resolve()

    expect(setCollabModeSpy).toHaveBeenCalledWith("design", "session-card-test", activeTabId)
    expect(injectedPrompt).toBe("@design:design-pricing-1 (Pricing Table) ")

    unregister()
  })

  it("点击打开设计看板按钮，注册设计项并跳转到 /design 路由", () => {
    render(
      <FrontDesignCard
        design={{
          id: "design-open-test",
          title: "Hero Banner",
          html: "<div>Hero</div>",
          raw: "<front_design>...",
        }}
      />,
    )

    const openBtn = screen.getByRole("button", { name: /打开设计看板|Open Design Board/i })
    expect(openBtn).not.toBeNull()

    fireEvent.click(openBtn)

    expect(frontDesignStore.getState().activeDesignId).toBe("design-open-test")
    expect(mockNavigate).toHaveBeenCalledWith("/design")
  })
})

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LxToastProvider } from "@/components/ui/LxToast"
import { AgentTabBar } from "@/features/agent/components/AgentTabBar"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { btwStore } from "@/features/agent/hooks/btwStore"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    abort: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    listProjects: vi.fn().mockResolvedValue([]),
  },
}))

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const renderTabBar = (onOpenBtw?: () => void): ReturnType<typeof render> =>
  render(
    <LxToastProvider>
      <AgentTabBar onOpenBtw={onOpenBtw} />
    </LxToastProvider>,
  )

describe("AgentTabBar btw 侧问入口", () => {
  let createdTabIds: string[] = []

  const createTab = (): string => {
    const id = agentTabStore.createTab()
    if (id) createdTabIds.push(id)
    return id ?? ""
  }

  afterEach(() => {
    cleanup()
    for (const id of createdTabIds) {
      agentTabStore.closeTab(id)
    }
    createdTabIds = []
    localStorage.clear()
  })

  it("当前 Tab 有侧问记录时显示入口按钮，点击触发打开回调", async () => {
    const tabId = createTab()
    btwStore.appendUser(`tab:${tabId}`, 1000, "Q1")
    const onOpenBtw = vi.fn()

    renderTabBar(onOpenBtw)

    const button = await screen.findByLabelText("btw side question history")
    fireEvent.click(button)
    expect(onOpenBtw).toHaveBeenCalledTimes(1)
  })

  it("无侧问记录时不显示入口按钮", () => {
    createTab()

    renderTabBar()

    expect(screen.queryByLabelText("btw side question history")).toBeNull()
  })
})

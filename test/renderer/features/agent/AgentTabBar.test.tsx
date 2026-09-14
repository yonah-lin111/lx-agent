// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LxToastProvider } from "@/components/ui/LxToast"
import { agentApi } from "@/features/agent/api/agentApi"
import { AgentTabBar } from "@/features/agent/components/AgentTabBar"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"

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

const mockedAbort = vi.mocked(agentApi.abort)

describe("AgentTabBar 芯片迁移", () => {
  // 记录测试期间创建的标签，结束时回收，保持模块级 store 基线为 1 个标签。
  let createdTabIds: string[] = []

  const addTabs = (count: number): string[] => {
    const ids: string[] = []
    for (let index = 0; index < count; index += 1) {
      const id = agentTabStore.createTab()
      if (id) ids.push(id)
    }
    createdTabIds.push(...ids)
    return ids
  }

  const renderTabBar = (): ReturnType<typeof render> =>
    render(
      <LxToastProvider>
        <AgentTabBar />
      </LxToastProvider>,
    )

  afterEach(() => {
    cleanup()
    for (const id of createdTabIds) {
      agentTabStore.closeTab(id)
      agentTabStore.setTabStreaming(id, false)
    }
    createdTabIds = []
    mockedAbort.mockClear()
  })

  it("标签芯片按 LxIconButton 芯片渲染：h-7 尺寸并保留激活态 aria-selected", () => {
    const { container } = renderTabBar()
    const tab = container.querySelector("button[aria-selected]") as HTMLElement
    expect(tab).not.toBeNull()
    expect(tab.className).toContain("h-7")
    expect(tab.getAttribute("aria-selected")).toBe("true")
  })

  it("仅一个标签时不渲染关闭入口", () => {
    const { container } = renderTabBar()
    expect(container.querySelector('span[role="button"]')).toBeNull()
  })

  it("多标签时点击关闭入口移除对应标签", () => {
    addTabs(1)
    const before = agentTabStore.getTabs().length
    const { container } = renderTabBar()

    const closeIcon = container.querySelector('span[role="button"]') as HTMLElement
    expect(closeIcon).not.toBeNull()
    fireEvent.click(closeIcon)

    expect(agentTabStore.getTabs().length).toBe(before - 1)
  })

  it("流式标签关闭需二次确认：确认前不关闭，确认后中止并关闭", async () => {
    const [streamingTabId] = addTabs(1)
    agentTabStore.setTabStreaming(streamingTabId, true)
    const before = agentTabStore.getTabs().length

    const { container } = renderTabBar()
    const chips = container.querySelectorAll("button[aria-selected]")
    const streamingChip = chips[chips.length - 1] as HTMLElement
    const closeIcon = streamingChip.querySelector('span[role="button"]') as HTMLElement
    expect(closeIcon).not.toBeNull()

    fireEvent.click(closeIcon)
    expect(agentTabStore.getTabs().length).toBe(before)

    fireEvent.click(screen.getByLabelText("Confirm"))
    await act(async () => undefined)
    expect(agentTabStore.getTabs().length).toBe(before - 1)
    expect(mockedAbort).toHaveBeenCalled()
  })

  it("点击标签主体切换激活标签", () => {
    addTabs(1)
    const { container } = renderTabBar()
    const chips = container.querySelectorAll("button[aria-selected]")
    const firstChip = chips[0] as HTMLElement

    fireEvent.click(firstChip)

    expect(agentTabStore.getActiveTabId()).toBe(agentTabStore.getTabs()[0].id)
  })
})

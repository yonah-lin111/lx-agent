// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"

describe("agentTabStore 引用稳定性与状态卫语句", () => {
  beforeEach(() => {
    // 确保有至少一个 tab
    const tabs = agentTabStore.getTabs()
    if (tabs.length === 0) {
      agentTabStore.createTab()
    }
  })

  it("当 turnCount 相同调用 setTabTurnCount 时，不应创建新数组引用，也不应触发 notify", () => {
    const tab = agentTabStore.getTabs()[0]
    agentTabStore.setTabTurnCount(tab.id, 5)

    const initialTabs = agentTabStore.getTabs()
    const listener = vi.fn()
    const unsubscribe = agentTabStore.subscribe(listener)

    // 重复设置相同 turnCount
    agentTabStore.setTabTurnCount(tab.id, 5)

    expect(listener).not.toHaveBeenCalled()
    expect(agentTabStore.getTabs()).toBe(initialTabs) // 引用严格相等

    unsubscribe()
  })

  it("当 sessionId 相同调用 setTabSessionId 时，不应触发 notify，保持引用不变", () => {
    const tab = agentTabStore.getTabs()[0]
    agentTabStore.setTabSessionId(tab.id, "session-stable-1")

    const initialTabs = agentTabStore.getTabs()
    const listener = vi.fn()
    const unsubscribe = agentTabStore.subscribe(listener)

    agentTabStore.setTabSessionId(tab.id, "session-stable-1")

    expect(listener).not.toHaveBeenCalled()
    expect(agentTabStore.getTabs()).toBe(initialTabs)

    unsubscribe()
  })

  it("当 title 相同调用 setTabTitle 时，不应触发 notify，保持引用不变", () => {
    const tab = agentTabStore.getTabs()[0]
    agentTabStore.setTabTitle(tab.id, "Tab Title Test")

    const initialTabs = agentTabStore.getTabs()
    const listener = vi.fn()
    const unsubscribe = agentTabStore.subscribe(listener)

    agentTabStore.setTabTitle(tab.id, "Tab Title Test")

    expect(listener).not.toHaveBeenCalled()
    expect(agentTabStore.getTabs()).toBe(initialTabs)

    unsubscribe()
  })

  it("当 draftBinding 相同调用 setTabDraftBinding 时，不应触发 notify", () => {
    const tab = agentTabStore.getTabs()[0]
    agentTabStore.setTabDraftBinding(tab.id, { projectId: "p1", cwd: "/tmp" })

    const initialTabs = agentTabStore.getTabs()
    const listener = vi.fn()
    const unsubscribe = agentTabStore.subscribe(listener)

    agentTabStore.setTabDraftBinding(tab.id, { projectId: "p1", cwd: "/tmp" })

    expect(listener).not.toHaveBeenCalled()
    expect(agentTabStore.getTabs()).toBe(initialTabs)

    unsubscribe()
  })

  it("findTabById 能够根据 tabId 精确返回目标 Tab", () => {
    const tab = agentTabStore.getTabs()[0]
    expect(agentTabStore.findTabById(tab.id)).toBe(tab)
    expect(agentTabStore.findTabById("non-existing-id")).toBeUndefined()
  })
})

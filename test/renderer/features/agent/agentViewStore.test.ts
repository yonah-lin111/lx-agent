// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { agentViewStore } from "@/features/agent/hooks/agentViewStore"

describe("agentViewStore", () => {
  beforeEach(() => {
    localStorage.clear()
    agentViewStore.setIsGenerating(false)
    agentViewStore.setViewMode("qa")
  })

  it("支持在非生成状态下正常切换视图并持久化", () => {
    expect(agentViewStore.getViewMode()).toBe("qa")

    agentViewStore.toggleViewMode()
    expect(agentViewStore.getViewMode()).toBe("flow")
    expect(localStorage.getItem("lx-agent-view-mode")).toBe("flow")

    agentViewStore.toggleViewMode()
    expect(agentViewStore.getViewMode()).toBe("qa")
    expect(localStorage.getItem("lx-agent-view-mode")).toBe("qa")
  })

  it("在 Agent 生成/输出过程中（isGenerating 为 true 时）也能无缝切换视图", () => {
    agentViewStore.setIsGenerating(true)
    expect(agentViewStore.isGenerating()).toBe(true)

    // 在输出进行中点击切换 Flow
    agentViewStore.toggleViewMode()
    expect(agentViewStore.getViewMode()).toBe("flow")
    expect(localStorage.getItem("lx-agent-view-mode")).toBe("flow")

    // 在输出进行中再次点击切回 QA
    agentViewStore.toggleViewMode()
    expect(agentViewStore.getViewMode()).toBe("qa")
    expect(localStorage.getItem("lx-agent-view-mode")).toBe("qa")

    // 直接通过 setViewMode 也能无缝切换
    agentViewStore.setViewMode("flow")
    expect(agentViewStore.getViewMode()).toBe("flow")
  })

  it("监听者能正常收到变更通知", () => {
    const listener = vi.fn()
    const unsubscribe = agentViewStore.subscribe(listener)

    agentViewStore.toggleViewMode()
    expect(listener).toHaveBeenCalledTimes(1)

    // 重复设置相同视图模式不触发多余通知
    agentViewStore.setViewMode("flow")
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    agentViewStore.toggleViewMode()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("isGenerating 状态可独立设置并供外部会话守卫查询", () => {
    expect(agentViewStore.isGenerating()).toBe(false)
    agentViewStore.setIsGenerating(true)
    expect(agentViewStore.isGenerating()).toBe(true)
    agentViewStore.setIsGenerating(false)
    expect(agentViewStore.isGenerating()).toBe(false)
  })
})

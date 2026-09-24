import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TurnStore } from "@/agent/turnStore"

describe("TurnStore usageTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const createTestStore = () => {
    const emitUsage = vi.fn()
    const emit = vi.fn()
    const setSessionId = vi.fn()
    const getCurrentSessionId = vi.fn(() => "sess-1")
    const setSessionBinding = vi.fn()
    const getCwd = vi.fn(() => "/tmp")

    const store = new TurnStore({
      emitUsage,
      emit,
      setSessionId,
      getCurrentSessionId,
      setSessionBinding,
      getCwd,
    })

    return { store, emitUsage }
  }

  it("agent_start 启动 5 秒定时器，定时触发 emitUsage", () => {
    const { store, emitUsage } = createTestStore()

    store.beginTurn({
      binding: {},
      text: "hello",
      cwd: "/tmp",
      capabilities: { tools: [], mcp: [], skills: [] },
    })

    store.handleEvent({ type: "agent_start" })
    expect(emitUsage).not.toHaveBeenCalled()

    vi.advanceTimersByTime(5000)
    expect(emitUsage).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5000)
    expect(emitUsage).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(10000)
    expect(emitUsage).toHaveBeenCalledTimes(4)
  })

  it("agent_end 立即关闭定时器并触发收尾 emitUsage", () => {
    const { store, emitUsage } = createTestStore()

    store.beginTurn({
      binding: {},
      text: "hello",
      cwd: "/tmp",
      capabilities: { tools: [], mcp: [], skills: [] },
    })

    store.handleEvent({ type: "agent_start" })
    vi.advanceTimersByTime(5000)
    expect(emitUsage).toHaveBeenCalledTimes(1)

    // agent_end 到达
    store.handleEvent({ type: "agent_end", messages: [] })
    // agent_end 自身会立刻触发一次收尾 emitUsage
    expect(emitUsage).toHaveBeenCalledTimes(2)

    // 定时器已关闭，时间再推进不会继续触发
    vi.advanceTimersByTime(15000)
    expect(emitUsage).toHaveBeenCalledTimes(2)
  })

  it("discardTurn 立即关闭定时器", () => {
    const { store, emitUsage } = createTestStore()

    store.beginTurn({
      binding: {},
      text: "hello",
      cwd: "/tmp",
      capabilities: { tools: [], mcp: [], skills: [] },
    })

    store.handleEvent({ type: "agent_start" })
    vi.advanceTimersByTime(5000)
    expect(emitUsage).toHaveBeenCalledTimes(1)

    store.discardTurn()

    vi.advanceTimersByTime(15000)
    expect(emitUsage).toHaveBeenCalledTimes(1)
  })

  it("resetSeqs 立即关闭定时器", () => {
    const { store, emitUsage } = createTestStore()

    store.beginTurn({
      binding: {},
      text: "hello",
      cwd: "/tmp",
      capabilities: { tools: [], mcp: [], skills: [] },
    })

    store.handleEvent({ type: "agent_start" })
    vi.advanceTimersByTime(5000)
    expect(emitUsage).toHaveBeenCalledTimes(1)

    store.resetSeqs()

    vi.advanceTimersByTime(15000)
    expect(emitUsage).toHaveBeenCalledTimes(1)
  })
})

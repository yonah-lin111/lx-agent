// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useOpenClawOfficeStore } from "@/features/openclaw/openclawOfficeStore"
import { OpenClawPage } from "@/pages/openclaw"

const connect = vi.fn()
const sendMessage = vi.fn()

const instance = {
  name: "Local OpenClaw",
  enabled: true,
  agents: [
    { id: "amy", name: "Amy" },
    { id: "lily", name: "Lily" },
  ],
}

vi.mock("@/features/openclaw", () => ({
  accentHexForIndex: (): string => "#ffffff",
  filterOfficeTimeline: (timeline: unknown[]): unknown[] => timeline,
  OpenClawInput: (): null => null,
  OpenClawMessageList: (): null => null,
  parseOpenClawCommand: (): null => null,
  resolveClawDispatchTargets: () => ({ body: "", agentIds: [] }),
  splitCommandAgentNames: (): string[] => [],
  toggleCommandAgentName: (current: string): string => current,
  useOpenClawChatStore: {
    getState: () => ({ connect, sendMessage }),
  },
  useOpenClawConfig: () => ({
    instances: { local: instance },
    enabledInstances: [{ id: "local", instance }],
  }),
  useOpenClawOffice: () => ({ sessions: [], timeline: [], isAnyStreaming: false }),
  useOpenClawOfficeStore,
}))

vi.mock("@/features/settings", () => ({ notifySettingsChanged: vi.fn() }))

describe("OpenClawPage 跨页 @claw 派发", () => {
  beforeEach(() => {
    connect.mockReset().mockResolvedValue(undefined)
    sendMessage.mockReset().mockResolvedValue(undefined)
    useOpenClawOfficeStore.setState({
      selectedInstanceId: null,
      selectedAgentIds: [],
      activeAgentId: null,
      onlyAgentIds: null,
      pendingDispatch: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it("页面已挂载时写入派发请求会立即消费并发送，无需重新进入页面", async () => {
    render(<OpenClawPage />)
    // 等待挂载回落选中首个启用实例的首个员工，确保后续断言来自派发请求。
    await waitFor(() => expect(useOpenClawOfficeStore.getState().activeAgentId).toBe("amy"))

    act(() => {
      useOpenClawOfficeStore.getState().requestDispatch({
        instanceId: "local",
        agentId: "lily",
        task: "跑测试",
      })
    })

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith("local", "lily", "跑测试"))
    expect(connect).toHaveBeenCalledWith("local")
    expect(useOpenClawOfficeStore.getState().pendingDispatch).toBeNull()
    expect(useOpenClawOfficeStore.getState().activeAgentId).toBe("lily")
    expect(useOpenClawOfficeStore.getState().selectedAgentIds).toEqual(["lily"])
  })

  it("挂载时已存在派发请求会立即消费（跨页跳转进入）", async () => {
    useOpenClawOfficeStore.setState({
      pendingDispatch: { instanceId: "local", agentId: "lily", task: "部署" },
    })

    render(<OpenClawPage />)

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith("local", "lily", "部署"))
    expect(useOpenClawOfficeStore.getState().pendingDispatch).toBeNull()
  })

  it("连续派发请求都能即时发送", async () => {
    render(<OpenClawPage />)

    act(() => {
      useOpenClawOfficeStore.getState().requestDispatch({
        instanceId: "local",
        agentId: "amy",
        task: "第一条",
      })
    })
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith("local", "amy", "第一条"))

    act(() => {
      useOpenClawOfficeStore.getState().requestDispatch({
        instanceId: "local",
        agentId: "lily",
        task: "第二条",
      })
    })
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith("local", "lily", "第二条"))
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })
})

describe("OpenClawPage 顶部工具条", () => {
  beforeEach(() => {
    useOpenClawOfficeStore.setState({
      selectedInstanceId: "local",
      selectedAgentIds: ["amy", "lily"],
      activeAgentId: "amy",
      onlyAgentIds: null,
      pendingDispatch: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it("多选员工时显示办公区名与全部选中员工名", async () => {
    render(<OpenClawPage />)

    await waitFor(() => {
      expect(document.body.textContent).toContain("Local OpenClaw")
      expect(document.body.textContent).toContain("· Amy · Lily")
    })
  })

  it("单选员工时只显示该员工名", async () => {
    useOpenClawOfficeStore.setState({ selectedAgentIds: ["lily"], activeAgentId: "lily" })

    render(<OpenClawPage />)

    await waitFor(() => {
      expect(document.body.textContent).toContain("· Lily")
    })
    expect(document.body.textContent).not.toContain("· Amy")
  })
})

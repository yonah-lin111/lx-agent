// @vitest-environment jsdom

import type { OpenClawChatMessage } from "@shared/contracts/openclaw"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenClawMessageList } from "@/features/openclaw/components/OpenClawMessageList"
import type { OfficeTimelineMessage } from "@/features/openclaw/hooks/useOpenClawOffice"

const assistant = (
  id: string,
  content: string,
  timestamp: number,
  extra: Partial<OpenClawChatMessage> = {},
): OpenClawChatMessage => ({
  id,
  role: "assistant",
  content,
  timestamp,
  status: "completed",
  ...extra,
})

const user = (id: string, content: string, timestamp: number): OpenClawChatMessage => ({
  id,
  role: "user",
  content,
  timestamp,
  status: "completed",
})

const agents = [
  { agentId: "lily", name: "Lily", accent: "#ff6b6b" },
  { agentId: "amy", name: "Amy", accent: "#6bcf7f" },
]

describe("OpenClaw 消息操作按钮", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = (): void => undefined
        unobserve = (): void => undefined
        disconnect = (): void => undefined
      },
    )
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("用户消息复制按钮把原文写入剪贴板", async () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: user("u1", "帮我看看登录逻辑", 100) },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} />)
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("帮我看看登录逻辑")
    })
  })

  it("AI 消息复制按钮把回复原文写入剪贴板", async () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: assistant("a1", "lily-reply", 200) },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} />)
    fireEvent.click(screen.getAllByRole("button", { name: "Copy message" })[0])

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("lily-reply")
    })
  })

  it("删除入口只出现在每个 Agent 最后一条非流式 AI 消息上", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: assistant("a1", "first", 100) },
      { agentId: "lily", message: assistant("a2", "second", 200) },
      { agentId: "amy", message: assistant("a3", "amy-reply", 300) },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} onDeleteTurn={vi.fn()} />)

    const deleteButtons = screen.getAllByRole("button", { name: "Delete this Q&A turn" })
    expect(deleteButtons).toHaveLength(2)
  })

  it("会话流式中的 Agent 不显示删除入口", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: assistant("a1", "first", 100) },
      { agentId: "lily", message: { ...assistant("a2", "", 200), status: "streaming" } },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} onDeleteTurn={vi.fn()} />)

    expect(screen.queryByRole("button", { name: "Delete this Q&A turn" })).toBeNull()
  })

  it("点击删除并在二次确认后回调 agentId 与消息 id", async () => {
    const onDeleteTurn = vi.fn()
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: assistant("a1", "reply", 200) },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} onDeleteTurn={onDeleteTurn} />)
    fireEvent.click(screen.getByRole("button", { name: "Delete this Q&A turn" }))
    // jsdom 中 Tooltip 定位坐标为 0，气泡以 visibility:hidden 挂载：按属性直取确认按钮。
    const confirmButton = document.querySelector(
      'button[aria-label="Confirm"]',
    ) as HTMLButtonElement
    expect(confirmButton).not.toBeNull()
    fireEvent.click(confirmButton)

    expect(onDeleteTurn).toHaveBeenCalledWith("lily", "a1")
  })

  it("未提供删除回调时不渲染删除入口", () => {
    const timeline: OfficeTimelineMessage[] = [
      { agentId: "lily", message: assistant("a1", "reply", 200) },
    ]

    render(<OpenClawMessageList timeline={timeline} agents={agents} />)

    expect(screen.queryByRole("button", { name: "Delete this Q&A turn" })).toBeNull()
    expect(screen.getAllByRole("button", { name: "Copy message" }).length).toBeGreaterThan(0)
  })
})

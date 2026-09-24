// @vitest-environment jsdom
import type { ModeExitResponse } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const modeExitRespond = vi.fn<(response: ModeExitResponse) => Promise<{ ok: boolean }>>(
  async () => ({ ok: true }),
)

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    modeExitRespond: (response: ModeExitResponse) => modeExitRespond(response),
  },
}))

import { AgentModeExitBlock } from "@/features/agent"
import type { ChatBlock } from "@/features/agent/types"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 挂起态块：带 mode_exit_request 回填的退出审批。
const pendingBlock: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "call-switch-1",
  toolName: "switch_mode",
  status: "running",
  args: { mode: "build", reason: "plan complete" },
  modeExit: {
    requestId: "session-1:1",
    toolCallId: "call-switch-1",
    fromMode: "plan",
    toMode: "build",
    sessionId: "session-1",
  },
}

// 历史回放块：无挂起请求的只读摘要。
const resolvedBlock: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "call-switch-2",
  toolName: "switch_mode",
  status: "done",
  args: { mode: "plan" },
}

describe("AgentModeExitBlock 模式退出审批", () => {
  beforeEach(() => {
    cleanup()
    modeExitRespond.mockClear()
  })

  it("挂起态：展示审批提示与两个动作，批准后回传 allow", () => {
    render(<AgentModeExitBlock toolCall={pendingBlock} />)

    expect(screen.getByText("Mode Switch Approval")).toBeTruthy()
    expect(screen.getByText(/requests to exit Plan Mode and start executing/)).toBeTruthy()

    fireEvent.click(screen.getByText("Exit & Execute"))
    expect(modeExitRespond).toHaveBeenCalledWith({
      requestId: "session-1:1",
      decision: "allow",
    })
  })

  it("挂起态：拒绝后回传 deny", () => {
    render(<AgentModeExitBlock toolCall={pendingBlock} />)

    fireEvent.click(screen.getByText("Stay in Current Mode"))
    expect(modeExitRespond).toHaveBeenCalledWith({
      requestId: "session-1:1",
      decision: "deny",
    })
  })

  it("审批完成后块退回只读摘要（历史回放展示目标模式）", () => {
    render(<AgentModeExitBlock toolCall={resolvedBlock} />)

    expect(screen.queryByText("Exit & Execute")).toBeNull()
    expect(screen.getByText(/Mode switch request resolved/)).toBeTruthy()
  })
})

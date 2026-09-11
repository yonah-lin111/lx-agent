// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OpenClawInput } from "@/features/openclaw/components/OpenClawInput"
import { OpenClawTargetSelect } from "@/features/openclaw/components/OpenClawTargetSelect"

const offices = [
  {
    id: "office-1",
    name: "研发中心",
    agents: [
      { id: "agent-a", name: "架构师" },
      { id: "agent-b", name: "前端工程" },
    ],
  },
  {
    id: "office-2",
    name: "运营中心",
    agents: [{ id: "agent-c", name: "运营助手" }],
  },
]

describe("OpenClawTargetSelect & OpenClawInput UI", () => {
  afterEach(() => {
    cleanup()
  })

  it("OpenClawTargetSelect 能正确渲染当前办公区与选中员工数，并触发切换事件", () => {
    const onSelectOffice = vi.fn()
    const onToggleAgent = vi.fn()

    render(
      <OpenClawTargetSelect
        offices={offices}
        selectedOfficeId="office-1"
        selectedAgentIds={["agent-a"]}
        onSelectOffice={onSelectOffice}
        onToggleAgent={onToggleAgent}
      />,
    )

    const btn = screen.getByRole("button")
    expect(btn.textContent).toContain("研发中心 · 架构师")

    // 打开下拉
    fireEvent.click(btn)
    expect(screen.getByText("运营中心")).not.toBeNull()

    // 切换办公区
    fireEvent.click(screen.getByText("运营中心"))
    expect(onSelectOffice).toHaveBeenCalledWith("office-2")

    // 点击员工多选
    fireEvent.click(screen.getByText("前端工程"))
    expect(onToggleAgent).toHaveBeenCalledWith("agent-b")
  })

  it("OpenClawInput 正确渲染语音按钮、目标选择器与发送按钮", () => {
    const onSend = vi.fn()
    const onStop = vi.fn()

    render(
      <OpenClawInput
        value="Hello OpenClaw"
        onChange={vi.fn()}
        onSend={onSend}
        onStop={onStop}
        candidates={[]}
        onCommand={vi.fn()}
        offices={offices}
        selectedOfficeId="office-1"
        selectedAgentIds={["agent-a"]}
        onSelectOffice={vi.fn()}
        onToggleAgent={vi.fn()}
      />,
    )

    expect(screen.getByText("研发中心 · 架构师")).not.toBeNull()
    const sendBtn = screen.getByRole("button", { name: "Send" })
    expect(sendBtn).not.toBeNull()
    fireEvent.click(sendBtn)
    expect(onSend).toHaveBeenCalled()
  })
})
